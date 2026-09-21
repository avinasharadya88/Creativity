"""
ARINC 424 Fixed-Width (132-character) Record Generator.
Produces legacy-compliant 132-byte aeronautical records for Military Training Routes.
Guarantees exact byte-length constraints required by traditional FMS loaders.
"""

from typing import Dict, Any, List
from mtr_app.generators.corridor_calc import to_arinc_dms

RECORD_LENGTH = 132


def pad(value: Any, length: int, align_left: bool = True, pad_char: str = " ") -> str:
    """Safely formats and truncates/pads value to exact character length."""
    val_str = "" if value is None else str(value)
    if len(val_str) > length:
        return val_str[:length]
    if align_left:
        return val_str.ljust(length, pad_char)
    else:
        return val_str.rjust(length, pad_char)


def format_altitude(alt_ft: Any) -> str:
    """Formats altitude as 5-character string (e.g., 100 -> '00100', 15000 -> '15000')."""
    try:
        val = int(alt_ft)
        return f"{val:05d}"
    except (ValueError, TypeError):
        return "00000"


def generate_mtr_fixed_records(route: Dict[str, Any], cycle: str = "2609") -> List[str]:
    """
    Generates a list of 132-character ARINC 424 records for an MTR route.
    Uses Standard Section Code 'U' (Airspace), Subsection 'R' (Restrictive/Training Route)
    or Enroute Airway structure depending on configuration.
    """
    records = []
    route_id = route.get("route_id", "MTR")
    # Clean route id without hyphens (e.g., IR102)
    clean_id = route_id.replace("-", "")
    area_code = "USA"
    section_code = "U"      # Special Use / Restrictive / Military Airspace
    subsection_code = "R"   # Military Training Route / Restricted Area

    segments = route.get("segments", [])
    if not segments:
        # Generate at least a header record
        record_line = (
            "S"                                    # Col 1: Record Type (S = Standard)
            + pad(area_code, 3)                    # Col 2-4: Area Code
            + section_code                         # Col 5: Section Code
            + subsection_code                      # Col 6: Subsection Code
            + pad(clean_id, 5)                     # Col 7-11: Route Ident
            + pad("K2", 2)                         # Col 12-13: ICAO Code
            + "0010"                               # Col 14-17: Sequence Number
            + pad("HDR", 5)                        # Col 18-22: Fix / Point Name
            + pad(route.get("route_name", ""), 30) # Col 23-52: Description
            + pad(format_altitude(route.get("floor_alt_ft", 100)), 5)    # Lower Alt
            + pad(format_altitude(route.get("ceiling_alt_ft", 15000)), 5) # Upper Alt
            + pad("", 63)                          # Reserved / Fill
            + pad(cycle, 4)                        # Col 129-132: AIRAC Cycle
        )
        assert len(record_line) == RECORD_LENGTH, f"Record length {len(record_line)} != 132"
        records.append(record_line)
        return records

    for i, seg in enumerate(segments):
        seq = (i + 1) * 10  # 0010, 0020, 0030...
        seq_str = f"{seq:04d}"
        pt_name = seg.get("point_name", f"PT{i+1}")
        lat = seg.get("latitude_dec", 0.0)
        lon = seg.get("longitude_dec", 0.0)
        arinc_lat, arinc_lon = to_arinc_dms(lat, lon)

        min_alt = format_altitude(seg.get("min_alt_ft", route.get("floor_alt_ft", 100)))
        max_alt = format_altitude(seg.get("max_alt_ft", route.get("ceiling_alt_ft", 15000)))

        # Widths (e.g. 5.0 NM -> '050')
        w_left = int(round((seg.get("width_left_nm", 5.0) or 5.0) * 10))
        w_right = int(round((seg.get("width_right_nm", 5.0) or 5.0) * 10))
        width_str = f"{w_left:03d}{w_right:03d}"

        # Path Terminator
        terminator = "IF" if i == 0 else "TF"

        # Record construction (Total: exactly 132 chars)
        # Col 1: Record Type (S)
        # Col 2-4: Area Code (USA)
        # Col 5: Section (U)
        # Col 6: Subsection (R)
        # Col 7-11: Route Ident (IR102)
        # Col 12-13: ICAO Region (K2)
        # Col 14-17: Sequence Number (0010)
        # Col 18-22: Fix / Point Ident (PT_A )
        # Col 23-24: ICAO Region of Fix (K2)
        # Col 25-26: Path Terminator (IF/TF)
        # Col 27-29: Turn Direction / Code
        # Col 30-31: Reserved
        # Col 32-40: Latitude (34542016N) - 9 chars
        # Col 41-51: Longitude (117525556W) - 10 chars
        # Col 52-57: Inbound Magnetic Course
        # Col 58-61: Route Distance (NM * 10)
        # Col 62-67: Corridor Width (Left + Right)
        # Col 68-72: Min Altitude (00100)
        # Col 73-77: Max Altitude (15000)
        # Col 78-128: Agency / Procedure Remarks
        # Col 129-132: AIRAC Cycle (2609)

        dist_nm = seg.get("segment_distance_nm", 0.0) or 0.0
        dist_str = f"{int(round(dist_nm * 10)):04d}"

        part1 = "S" + pad(area_code, 3) + section_code + subsection_code + pad(clean_id, 5) # 11 chars
        part2 = pad("K2", 2) + seq_str + pad(pt_name, 5) + pad("K2", 2) + pad(terminator, 2) + pad("", 5) # 20 chars -> total 31
        part3 = pad(arinc_lat, 9) + pad(arinc_lon, 10) # 19 chars -> total 50
        part4 = pad("", 6) + pad(dist_str, 4) + pad(width_str, 6) # 16 chars -> total 66
        part5 = pad(min_alt, 5) + pad(max_alt, 5) # 10 chars -> total 76
        
        remarks = f"{seg.get('point_type', '')} TO {seg.get('next_point_name', '')}".strip()
        part6 = pad(remarks, 48) # 48 chars -> total 124
        part7 = pad("", 4)       # 4 chars -> total 128
        part8 = pad(cycle, 4)    # 4 chars -> total 132

        line = part1 + part2 + part3 + part4 + part5 + part6 + part7 + part8
        if len(line) != RECORD_LENGTH:
            # Fallback formatting guarantee
            line = pad(line, RECORD_LENGTH)

        records.append(line)

    return records


def generate_all_fixed_records(routes: List[Dict[str, Any]], cycle: str = "2609") -> str:
    """Generates complete fixed-width ARINC 424 dataset as a newline-delimited string."""
    all_lines = []
    for r in routes:
        all_lines.extend(generate_mtr_fixed_records(r, cycle=cycle))
    return "\n".join(all_lines)
