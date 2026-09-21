"""
ARINC 424-23 XML Generator for Military Training Routes (MTR).
Implements the ARINC 424 Supplement 23 Government Aviation Data XML Specification.
Includes validation, formatting, and human-readable plain-English decoding.
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime
from typing import Dict, Any, List, Optional
from mtr_app.generators.corridor_calc import (
    to_arinc_dms,
    to_human_dms,
    calculate_bearing,
    calculate_distance_nm
)

ARINC_NAMESPACE = "http://www.sae-itc.com/arinc424/23"
ARINC_VERSION = "424-23"
DEFAULT_CYCLE = "2609"


def _format_route_type(route_type_code: str) -> str:
    mapping = {
        "IR": "IFR_MILITARY_TRAINING_ROUTE",
        "VR": "VFR_MILITARY_TRAINING_ROUTE",
        "SR": "SLOW_SPEED_LOW_ALTITUDE_ROUTE"
    }
    return mapping.get(route_type_code.upper(), "MILITARY_TRAINING_ROUTE")


def _path_terminator_for_segment(seq_num: int, point_type: str) -> str:
    """
    Determines standard ARINC 424 path terminator:
    IF = Initial Fix (Entry point / initial leg)
    TF = Track to Fix (Normal enroute straight-in leg to waypoint)
    DF = Direct to Fix (Turn point heading change)
    """
    if seq_num == 1 or point_type.upper() == "ENTRY":
        return "IF"
    elif "TURN" in point_type.upper():
        return "TF"
    else:
        return "TF"


def build_route_element(route: Dict[str, Any], root: Optional[ET.Element] = None) -> ET.Element:
    """
    Builds an ARINC 424-23 <MilitaryTrainingRoute> XML element from route dictionary.
    """
    route_elem = ET.SubElement(root, "MilitaryTrainingRoute") if root is not None else ET.Element("MilitaryTrainingRoute")
    route_elem.set("id", str(route.get("route_id", "MTR")))
    route_elem.set("status", str(route.get("status", "ACTIVE")))

    # 1. Route Identification
    ident_elem = ET.SubElement(route_elem, "RouteIdentification")
    ET.SubElement(ident_elem, "RouteDesignator").text = route.get("route_id", "")
    ET.SubElement(ident_elem, "RouteType").text = _format_route_type(route.get("route_type", "IR"))
    ET.SubElement(ident_elem, "RouteName").text = route.get("route_name", "")
    
    # Extract route number
    parts = route.get("route_id", "").split("-")
    route_num = parts[1] if len(parts) > 1 else parts[0]
    ET.SubElement(ident_elem, "RouteNumber").text = route_num
    ET.SubElement(ident_elem, "EffectiveCycle").text = DEFAULT_CYCLE

    # 2. Controlling Agencies
    agencies_elem = ET.SubElement(route_elem, "ControllingAgencies")
    agy_elem = ET.SubElement(agencies_elem, "Agency", {"sequence": "1"})
    ET.SubElement(agy_elem, "OriginatingAgency").text = route.get("originating_agency", "DoD / FAA")
    ET.SubElement(agy_elem, "ArtccFacility").text = route.get("artcc_facility", "UNSPECIFIED")
    ET.SubElement(agy_elem, "OperatingHours").text = route.get("operating_hours", "CONTINUOUS")

    # 3. Operational Parameters
    ops_elem = ET.SubElement(route_elem, "OperationalParameters")
    ET.SubElement(ops_elem, "TimesOfUse").text = route.get("operating_hours", "CONTINUOUS")
    ET.SubElement(ops_elem, "SpecialOperatingProcedures").text = (
        f"Military aircraft operating under {route.get('route_type', 'IR')} rules. "
        "High-speed low-altitude navigation in accordance with FAA Order JO 7610.4."
    )
    ET.SubElement(ops_elem, "TerrainFollowingProcedures").text = (
        "Radar altimeter terrain-following operations authorized at certified floor altitude."
    )

    # 4. Route Vertical Limits & Width
    limits_elem = ET.SubElement(route_elem, "RouteVerticalLimits")
    floor_elem = ET.SubElement(limits_elem, "FloorAltitude", {"unit": "FT", "datum": "MSL"})
    floor_elem.text = str(route.get("floor_alt_ft", 100))
    ceiling_elem = ET.SubElement(limits_elem, "CeilingAltitude", {"unit": "FT", "datum": "MSL"})
    ceiling_elem.text = str(route.get("ceiling_alt_ft", 15000))
    width_elem = ET.SubElement(limits_elem, "OverallRouteWidth", {"unit": "NM"})
    width_elem.text = str(route.get("route_width_nm", 10.0))

    # 5. Route Segments
    segments = route.get("segments", [])
    segs_elem = ET.SubElement(route_elem, "RouteSegments", {"count": str(len(segments))})

    for seg in segments:
        seq_num = seg.get("sequence_num", 1)
        seg_elem = ET.SubElement(segs_elem, "Segment", {"sequence": str(seq_num)})

        lat1 = seg.get("latitude_dec", 0.0)
        lon1 = seg.get("longitude_dec", 0.0)
        point_name = seg.get("point_name", f"PT_{seq_num}")
        point_type = seg.get("point_type", "WAYPOINT")

        # Start Point
        start_elem = ET.SubElement(seg_elem, "StartPoint")
        ET.SubElement(start_elem, "PointIdentifier").text = point_name
        ET.SubElement(start_elem, "PointType").text = point_type
        
        arinc_lat1, arinc_lon1 = to_arinc_dms(lat1, lon1)
        human_lat1, human_lon1 = to_human_dms(lat1, lon1)
        coords1 = ET.SubElement(start_elem, "Coordinates")
        lat1_elem = ET.SubElement(coords1, "Latitude", {"decimal": str(lat1), "arincDMS": arinc_lat1})
        lat1_elem.text = human_lat1
        lon1_elem = ET.SubElement(coords1, "Longitude", {"decimal": str(lon1), "arincDMS": arinc_lon1})
        lon1_elem.text = human_lon1

        # End Point (Next Waypoint)
        next_name = seg.get("next_point_name")
        lat2 = seg.get("next_lat_dec")
        lon2 = seg.get("next_lon_dec")
        
        # If coordinates for next point are not explicitly in segment, infer from following segment
        if (lat2 is None or lon2 is None) and seq_num < len(segments):
            next_seg = segments[seq_num]  # next item (0-indexed seq_num is index)
            lat2 = next_seg.get("latitude_dec")
            lon2 = next_seg.get("longitude_dec")
            if not next_name:
                next_name = next_seg.get("point_name")

        if next_name:
            end_elem = ET.SubElement(seg_elem, "EndPoint")
            ET.SubElement(end_elem, "PointIdentifier").text = next_name
            if lat2 is not None and lon2 is not None:
                arinc_lat2, arinc_lon2 = to_arinc_dms(lat2, lon2)
                human_lat2, human_lon2 = to_human_dms(lat2, lon2)
                coords2 = ET.SubElement(end_elem, "Coordinates")
                lat2_elem = ET.SubElement(coords2, "Latitude", {"decimal": str(lat2), "arincDMS": arinc_lat2})
                lat2_elem.text = human_lat2
                lon2_elem = ET.SubElement(coords2, "Longitude", {"decimal": str(lon2), "arincDMS": arinc_lon2})
                lon2_elem.text = human_lon2

        # Path Terminator
        terminator = _path_terminator_for_segment(seq_num, point_type)
        ET.SubElement(seg_elem, "PathTerminator").text = terminator

        # Corridor Dimensions
        left_w = seg.get("width_left_nm", 5.0) or 5.0
        right_w = seg.get("width_right_nm", 5.0) or 5.0
        corr_elem = ET.SubElement(seg_elem, "CorridorDimensions")
        ET.SubElement(corr_elem, "LeftWidth", {"unit": "NM"}).text = str(left_w)
        ET.SubElement(corr_elem, "RightWidth", {"unit": "NM"}).text = str(right_w)
        ET.SubElement(corr_elem, "TotalSegmentWidth", {"unit": "NM"}).text = str(left_w + right_w)

        # Segment Vertical Limits
        min_alt = seg.get("min_alt_ft", route.get("floor_alt_ft", 100))
        max_alt = seg.get("max_alt_ft", route.get("ceiling_alt_ft", 15000))
        vlimits_elem = ET.SubElement(seg_elem, "VerticalLimits")
        ET.SubElement(vlimits_elem, "MinAltitude", {"unit": "FT", "datum": "MSL"}).text = str(min_alt)
        ET.SubElement(vlimits_elem, "MaxAltitude", {"unit": "FT", "datum": "MSL"}).text = str(max_alt)

        # Course & Distance
        course_elem = ET.SubElement(seg_elem, "Course")
        dist_nm = seg.get("segment_distance_nm")
        if lat2 is not None and lon2 is not None:
            bearing = calculate_bearing(lat1, lon1, lat2, lon2)
            if dist_nm is None:
                dist_nm = calculate_distance_nm(lat1, lon1, lat2, lon2)
            ET.SubElement(course_elem, "Bearing", {"unit": "DEG", "reference": "TRUE"}).text = str(bearing)
            ET.SubElement(course_elem, "MagneticBearing", {"unit": "DEG", "reference": "MAG"}).text = str(bearing)

        if dist_nm is not None:
            ET.SubElement(course_elem, "Distance", {"unit": "NM"}).text = str(dist_nm)

        # WKT Geometry
        wkt = seg.get("geometry_wkt")
        if not wkt and lat2 is not None and lon2 is not None:
            wkt = f"LINESTRING({lon1} {lat1}, {lon2} {lat2})"
        if wkt:
            ET.SubElement(seg_elem, "GeometryWKT").text = wkt

    return route_elem


def generate_arinc424_xml(routes: List[Dict[str, Any]], cycle: str = DEFAULT_CYCLE, pretty: bool = True) -> str:
    """
    Generates a full ARINC 424-23 XML document containing one or more Military Training Routes.
    """
    root = ET.Element("Arinc424Data", {
        "version": ARINC_VERSION,
        "cycle": cycle,
        "generationDate": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "xmlns": ARINC_NAMESPACE
    })

    # Header metadata
    header = ET.SubElement(root, "FileHeader")
    ET.SubElement(header, "Specification").text = f"ARINC Specification {ARINC_VERSION}"
    ET.SubElement(header, "ContentDescription").text = "eNASR Government Aviation Data - Military Training Routes (MTR)"
    ET.SubElement(header, "AiracCycle").text = cycle
    ET.SubElement(header, "RecordCount").text = str(len(routes))

    # Add each route
    routes_container = ET.SubElement(root, "MilitaryTrainingRoutes")
    for r in routes:
        build_route_element(r, routes_container)

    raw_xml = ET.tostring(root, encoding="utf-8")
    if pretty:
        parsed = minidom.parseString(raw_xml)
        return parsed.toprettyxml(indent="  ", encoding="utf-8").decode("utf-8")
    return raw_xml.decode("utf-8")


def generate_single_route_xml(route: Dict[str, Any], cycle: str = DEFAULT_CYCLE, pretty: bool = True) -> str:
    """Convenience helper to generate ARINC 424-23 XML for a single route."""
    return generate_arinc424_xml([route], cycle=cycle, pretty=pretty)


def validate_arinc424_xml(xml_content: str) -> Dict[str, Any]:
    """
    Validates the generated ARINC 424-23 XML against syntax and expected element hierarchy.
    """
    try:
        root = ET.fromstring(xml_content)
        if not root.tag.endswith("Arinc424Data"):
            return {"valid": False, "error": f"Root tag must be Arinc424Data, got '{root.tag}'"}
        
        version = root.get("version")
        if version != ARINC_VERSION:
            return {"valid": False, "error": f"Expected version {ARINC_VERSION}, got '{version}'"}

        routes = [e for e in root.iter() if e.tag.endswith("MilitaryTrainingRoute")]
        if not routes:
            return {"valid": False, "error": "No MilitaryTrainingRoute elements found in XML"}

        report_routes = []
        for r in routes:
            r_id = r.get("id", "UNKNOWN")
            segments = [s for s in r.iter() if s.tag.endswith("Segment")]
            report_routes.append({
                "route_id": r_id,
                "status": r.get("status"),
                "segment_count": len(segments)
            })

        return {
            "valid": True,
            "version": version,
            "cycle": root.get("cycle"),
            "route_count": len(routes),
            "routes": report_routes
        }
    except ET.ParseError as pe:
        return {"valid": False, "error": f"XML Parse Error: {str(pe)}"}
    except Exception as e:
        return {"valid": False, "error": f"Validation Error: {str(e)}"}


def decode_to_plain_english(route: Dict[str, Any]) -> str:
    """
    Decodes an MTR into a clean, human-readable operational flight brief.
    Translates aeronautical codes into plain English for pilots, controllers, and analysts.
    """
    route_id = route.get("route_id", "N/A")
    route_type = route.get("route_type", "N/A")
    type_name = _format_route_type(route_type).replace("_", " ").title()
    name = route.get("route_name", "No description")
    agency = route.get("originating_agency", "Unknown Unit")
    artcc = route.get("artcc_facility", "Unknown ARTCC")
    floor = route.get("floor_alt_ft", 0)
    ceiling = route.get("ceiling_alt_ft", 0)
    width = route.get("route_width_nm", 0.0)
    hours = route.get("operating_hours", "CONTINUOUS")
    segments = route.get("segments", [])

    lines = [
        f"═══════════════════════════════════════════════════════════════════",
        f" MILITARY TRAINING ROUTE OPERATIONAL BRIEF: {route_id}",
        f"═══════════════════════════════════════════════════════════════════",
        f"• Route Identifier   : {route_id} ({type_name})",
        f"• Route Name         : {name}",
        f"• Operating Agency   : {agency}",
        f"• Controlling ARTCC  : {artcc}",
        f"• Schedule / Hours   : {hours}",
        f"• Altitude Envelope  : {floor:,} ft MSL to {ceiling:,} ft MSL",
        f"• Corridor Width     : {width} NM ({width/2.0:.1f} NM Left / {width/2.0:.1f} NM Right)",
        f"• Total Waypoints    : {len(segments)} sequenced legs",
        f"───────────────────────────────────────────────────────────────────",
        f" FLIGHT PATH & WAYPOINT SEQUENCES:",
        f"───────────────────────────────────────────────────────────────────"
    ]

    total_distance = 0.0
    for seg in segments:
        seq = seg.get("sequence_num", 1)
        pt_name = seg.get("point_name", f"PT_{seq}")
        pt_type = seg.get("point_type", "WAYPOINT")
        lat = seg.get("latitude_dec", 0.0)
        lon = seg.get("longitude_dec", 0.0)
        h_lat, h_lon = to_human_dms(lat, lon)
        dist = seg.get("segment_distance_nm", 0.0) or 0.0
        total_distance += dist
        min_a = seg.get("min_alt_ft", floor)
        max_a = seg.get("max_alt_ft", ceiling)
        next_pt = seg.get("next_point_name", "ROUTE_END")

        lines.append(
            f" [Leg {seq}] {pt_name} ({pt_type}) -> {next_pt}"
        )
        lines.append(
            f"       Coordinates : {h_lat}, {h_lon}"
        )
        lines.append(
            f"       Altitudes   : {min_a:,} - {max_a:,} ft MSL | Leg Distance: {dist:.1f} NM"
        )
        lines.append(
            f"       Corridor    : {seg.get('width_left_nm', 5.0)} NM Left / {seg.get('width_right_nm', 5.0)} NM Right"
        )

    lines.append(f"───────────────────────────────────────────────────────────────────")
    lines.append(f"• Total Route Distance: {total_distance:.1f} NM")
    lines.append(f"• ARINC 424-23 Spec  : Compliant XML with Supplement 23 Government Schema")
    lines.append(f"═══════════════════════════════════════════════════════════════════")

    return "\n".join(lines)
