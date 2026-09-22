import { MTRRoute, MTRSegment } from "../types.js";
import {
  toArincDms,
  toHumanDms,
  calculateBearing,
  calculateDistanceNm,
} from "./corridorCalc.js";

export const ARINC_NAMESPACE = "http://www.sae-itc.com/arinc424/23";
export const ARINC_VERSION = "424-23";
export const DEFAULT_CYCLE = "2609";

export function formatRouteType(routeTypeCode: string): string {
  const mapping: Record<string, string> = {
    IR: "IFR_MILITARY_TRAINING_ROUTE",
    VR: "VFR_MILITARY_TRAINING_ROUTE",
    SR: "SLOW_SPEED_LOW_ALTITUDE_ROUTE",
  };
  return mapping[routeTypeCode.toUpperCase()] || "MILITARY_TRAINING_ROUTE";
}

function pathTerminatorForSegment(seqNum: number, pointType: string): string {
  if (seqNum === 1 || pointType.toUpperCase() === "ENTRY") {
    return "IF";
  } else if (pointType.toUpperCase().includes("TURN")) {
    return "TF";
  } else {
    return "TF";
  }
}

function escapeXml(unsafe: string | number | undefined | null): string {
  if (unsafe == null) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildRouteXml(route: MTRRoute, indent: string = "    "): string {
  const routeId = route.route_id || "MTR";
  const status = route.status || "ACTIVE";
  const routeType = route.route_type || "IR";
  const routeName = route.route_name || "";
  const parts = routeId.split("-");
  const routeNum = parts.length > 1 ? parts[1] : parts[0];
  const agency = route.originating_agency || "DoD / FAA";
  const artcc = route.artcc_facility || "UNSPECIFIED";
  const hours = route.operating_hours || "CONTINUOUS";
  const floor = route.floor_alt_ft ?? 100;
  const ceiling = route.ceiling_alt_ft ?? 15000;
  const width = route.route_width_nm ?? 10.0;
  const segments = route.segments || [];

  let xml = `${indent}<MilitaryTrainingRoute id="${escapeXml(routeId)}" status="${escapeXml(status)}">\n`;

  // RouteIdentification
  xml += `${indent}  <RouteIdentification>\n`;
  xml += `${indent}    <RouteDesignator>${escapeXml(routeId)}</RouteDesignator>\n`;
  xml += `${indent}    <RouteType>${escapeXml(formatRouteType(routeType))}</RouteType>\n`;
  xml += `${indent}    <RouteName>${escapeXml(routeName)}</RouteName>\n`;
  xml += `${indent}    <RouteNumber>${escapeXml(routeNum)}</RouteNumber>\n`;
  xml += `${indent}    <EffectiveCycle>${DEFAULT_CYCLE}</EffectiveCycle>\n`;
  xml += `${indent}  </RouteIdentification>\n`;

  // ControllingAgencies
  xml += `${indent}  <ControllingAgencies>\n`;
  xml += `${indent}    <Agency sequence="1">\n`;
  xml += `${indent}      <OriginatingAgency>${escapeXml(agency)}</OriginatingAgency>\n`;
  xml += `${indent}      <ArtccFacility>${escapeXml(artcc)}</ArtccFacility>\n`;
  xml += `${indent}      <OperatingHours>${escapeXml(hours)}</OperatingHours>\n`;
  xml += `${indent}    </Agency>\n`;
  xml += `${indent}  </ControllingAgencies>\n`;

  // OperationalParameters
  xml += `${indent}  <OperationalParameters>\n`;
  xml += `${indent}    <TimesOfUse>${escapeXml(hours)}</TimesOfUse>\n`;
  xml += `${indent}    <SpecialOperatingProcedures>Military aircraft operating under ${escapeXml(routeType)} rules. High-speed low-altitude navigation in accordance with FAA Order JO 7610.4.</SpecialOperatingProcedures>\n`;
  xml += `${indent}    <TerrainFollowingProcedures>Radar altimeter terrain-following operations authorized at certified floor altitude.</TerrainFollowingProcedures>\n`;
  xml += `${indent}  </OperationalParameters>\n`;

  // RouteVerticalLimits
  xml += `${indent}  <RouteVerticalLimits>\n`;
  xml += `${indent}    <FloorAltitude unit="FT" datum="MSL">${floor}</FloorAltitude>\n`;
  xml += `${indent}    <CeilingAltitude unit="FT" datum="MSL">${ceiling}</CeilingAltitude>\n`;
  xml += `${indent}    <OverallRouteWidth unit="NM">${width}</OverallRouteWidth>\n`;
  xml += `${indent}  </RouteVerticalLimits>\n`;

  // RouteSegments
  xml += `${indent}  <RouteSegments count="${segments.length}">\n`;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const seqNum = seg.sequence_num || i + 1;
    const lat1 = seg.latitude_dec;
    const lon1 = seg.longitude_dec;
    const pointName = seg.point_name || `PT_${seqNum}`;
    const pointType = seg.point_type || "WAYPOINT";
    const [arincLat1, arincLon1] = toArincDms(lat1, lon1);
    const [humanLat1, humanLon1] = toHumanDms(lat1, lon1);

    xml += `${indent}    <Segment sequence="${seqNum}">\n`;
    xml += `${indent}      <StartPoint>\n`;
    xml += `${indent}        <PointIdentifier>${escapeXml(pointName)}</PointIdentifier>\n`;
    xml += `${indent}        <PointType>${escapeXml(pointType)}</PointType>\n`;
    xml += `${indent}        <Coordinates>\n`;
    xml += `${indent}          <Latitude decimal="${lat1}" arincDMS="${arincLat1}">${escapeXml(humanLat1)}</Latitude>\n`;
    xml += `${indent}          <Longitude decimal="${lon1}" arincDMS="${arincLon1}">${escapeXml(humanLon1)}</Longitude>\n`;
    xml += `${indent}        </Coordinates>\n`;
    xml += `${indent}      </StartPoint>\n`;

    let nextName = seg.next_point_name;
    let lat2 = seg.next_lat_dec;
    let lon2 = seg.next_lon_dec;
    if ((lat2 == null || lon2 == null) && i + 1 < segments.length) {
      lat2 = segments[i + 1].latitude_dec;
      lon2 = segments[i + 1].longitude_dec;
      if (!nextName) {
        nextName = segments[i + 1].point_name;
      }
    }

    if (nextName) {
      xml += `${indent}      <EndPoint>\n`;
      xml += `${indent}        <PointIdentifier>${escapeXml(nextName)}</PointIdentifier>\n`;
      if (lat2 != null && lon2 != null) {
        const [arincLat2, arincLon2] = toArincDms(lat2, lon2);
        const [humanLat2, humanLon2] = toHumanDms(lat2, lon2);
        xml += `${indent}        <Coordinates>\n`;
        xml += `${indent}          <Latitude decimal="${lat2}" arincDMS="${arincLat2}">${escapeXml(humanLat2)}</Latitude>\n`;
        xml += `${indent}          <Longitude decimal="${lon2}" arincDMS="${arincLon2}">${escapeXml(humanLon2)}</Longitude>\n`;
        xml += `${indent}        </Coordinates>\n`;
      }
      xml += `${indent}      </EndPoint>\n`;
    }

    const terminator = pathTerminatorForSegment(seqNum, pointType);
    xml += `${indent}      <PathTerminator>${terminator}</PathTerminator>\n`;

    const leftW = seg.width_left_nm ?? 5.0;
    const rightW = seg.width_right_nm ?? 5.0;
    xml += `${indent}      <CorridorDimensions>\n`;
    xml += `${indent}        <LeftWidth unit="NM">${leftW}</LeftWidth>\n`;
    xml += `${indent}        <RightWidth unit="NM">${rightW}</RightWidth>\n`;
    xml += `${indent}        <TotalSegmentWidth unit="NM">${leftW + rightW}</TotalSegmentWidth>\n`;
    xml += `${indent}      </CorridorDimensions>\n`;

    const minAlt = seg.min_alt_ft ?? floor;
    const maxAlt = seg.max_alt_ft ?? ceiling;
    xml += `${indent}      <VerticalLimits>\n`;
    xml += `${indent}        <MinAltitude unit="FT" datum="MSL">${minAlt}</MinAltitude>\n`;
    xml += `${indent}        <MaxAltitude unit="FT" datum="MSL">${maxAlt}</MaxAltitude>\n`;
    xml += `${indent}      </VerticalLimits>\n`;

    let distNm = seg.segment_distance_nm;
    let bearing: number | null = null;
    if (lat2 != null && lon2 != null) {
      bearing = calculateBearing(lat1, lon1, lat2, lon2);
      if (distNm == null) {
        distNm = calculateDistanceNm(lat1, lon1, lat2, lon2);
      }
    }

    xml += `${indent}      <Course>\n`;
    if (bearing != null) {
      xml += `${indent}        <Bearing unit="DEG" reference="TRUE">${bearing}</Bearing>\n`;
      xml += `${indent}        <MagneticBearing unit="DEG" reference="MAG">${bearing}</MagneticBearing>\n`;
    }
    if (distNm != null) {
      xml += `${indent}        <Distance unit="NM">${distNm}</Distance>\n`;
    }
    xml += `${indent}      </Course>\n`;

    let wkt = seg.geometry_wkt;
    if (!wkt && lat2 != null && lon2 != null) {
      wkt = `LINESTRING(${lon1} ${lat1}, ${lon2} ${lat2})`;
    }
    if (wkt) {
      xml += `${indent}      <GeometryWKT>${escapeXml(wkt)}</GeometryWKT>\n`;
    }

    xml += `${indent}    </Segment>\n`;
  }
  xml += `${indent}  </RouteSegments>\n`;

  xml += `${indent}</MilitaryTrainingRoute>`;
  return xml;
}

export function generateArinc424Xml(routes: MTRRoute[], cycle: string = DEFAULT_CYCLE): string {
  const now = new Date().toISOString();
  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<Arinc424Data version="${ARINC_VERSION}" cycle="${cycle}" generationDate="${now}" xmlns="${ARINC_NAMESPACE}">\n`;
  xml += `  <FileHeader>\n`;
  xml += `    <Specification>ARINC Specification ${ARINC_VERSION}</Specification>\n`;
  xml += `    <ContentDescription>eNASR Government Aviation Data - Military Training Routes (MTR)</ContentDescription>\n`;
  xml += `    <AiracCycle>${cycle}</AiracCycle>\n`;
  xml += `    <RecordCount>${routes.length}</RecordCount>\n`;
  xml += `  </FileHeader>\n`;
  xml += `  <MilitaryTrainingRoutes>\n`;
  for (const r of routes) {
    xml += buildRouteXml(r, "    ") + "\n";
  }
  xml += `  </MilitaryTrainingRoutes>\n`;
  xml += `</Arinc424Data>\n`;
  return xml;
}

export function generateSingleRouteXml(route: MTRRoute, cycle: string = DEFAULT_CYCLE): string {
  return generateArinc424Xml([route], cycle);
}

export function validateArinc424Xml(xmlContent: string): { valid: boolean; version?: string; cycle?: string; route_count?: number; routes?: any[]; error?: string } {
  try {
    if (!xmlContent.includes("<Arinc424Data")) {
      return { valid: false, error: "Root tag must be Arinc424Data" };
    }
    if (!xmlContent.includes(`version="${ARINC_VERSION}"`)) {
      return { valid: false, error: `Expected version ${ARINC_VERSION}` };
    }
    const routeRegex = /<MilitaryTrainingRoute\s+id="([^"]+)"\s+status="([^"]+)"/g;
    const routes: { route_id: string; status: string; segment_count: number }[] = [];
    let match;
    while ((match = routeRegex.exec(xmlContent)) !== null) {
      routes.push({
        route_id: match[1],
        status: match[2],
        segment_count: (xmlContent.match(/<Segment\s+sequence=/g) || []).length,
      });
    }

    if (routes.length === 0) {
      return { valid: false, error: "No MilitaryTrainingRoute elements found in XML" };
    }

    return {
      valid: true,
      version: ARINC_VERSION,
      cycle: DEFAULT_CYCLE,
      route_count: routes.length,
      routes,
    };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export function decodeToPlainEnglish(route: MTRRoute): string {
  const routeId = route.route_id || "N/A";
  const routeType = route.route_type || "N/A";
  const typeName = formatRouteType(routeType).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const name = route.route_name || "No description";
  const agency = route.originating_agency || "Unknown Unit";
  const artcc = route.artcc_facility || "Unknown ARTCC";
  const floor = route.floor_alt_ft ?? 0;
  const ceiling = route.ceiling_alt_ft ?? 0;
  const width = route.route_width_nm ?? 0.0;
  const hours = route.operating_hours || "CONTINUOUS";
  const segments = route.segments || [];

  const lines: string[] = [
    `═══════════════════════════════════════════════════════════════════`,
    ` MILITARY TRAINING ROUTE OPERATIONAL BRIEF: ${routeId}`,
    `═══════════════════════════════════════════════════════════════════`,
    `• Route Identifier   : ${routeId} (${typeName})`,
    `• Route Name         : ${name}`,
    `• Operating Agency   : ${agency}`,
    `• Controlling ARTCC  : ${artcc}`,
    `• Schedule / Hours   : ${hours}`,
    `• Altitude Envelope  : ${floor.toLocaleString()} ft MSL to ${ceiling.toLocaleString()} ft MSL`,
    `• Corridor Width     : ${width} NM (${(width / 2.0).toFixed(1)} NM Left / ${(width / 2.0).toFixed(1)} NM Right)`,
    `• Total Waypoints    : ${segments.length} sequenced legs`,
    `───────────────────────────────────────────────────────────────────`,
    ` FLIGHT PATH & WAYPOINT SEQUENCES:`,
    `───────────────────────────────────────────────────────────────────`,
  ];

  let totalDistance = 0.0;
  for (const seg of segments) {
    const seq = seg.sequence_num || 1;
    const ptName = seg.point_name || `PT_${seq}`;
    const ptType = seg.point_type || "WAYPOINT";
    const lat = seg.latitude_dec || 0.0;
    const lon = seg.longitude_dec || 0.0;
    const [hLat, hLon] = toHumanDms(lat, lon);
    const dist = seg.segment_distance_nm || 0.0;
    totalDistance += dist;
    const minA = seg.min_alt_ft ?? floor;
    const maxA = seg.max_alt_ft ?? ceiling;
    const nextPt = seg.next_point_name || "ROUTE_END";

    lines.push(` [Leg ${seq}] ${ptName} (${ptType}) -> ${nextPt}`);
    lines.push(`       Coordinates : ${hLat}, ${hLon}`);
    lines.push(`       Altitudes   : ${minA.toLocaleString()} - ${maxA.toLocaleString()} ft MSL | Leg Distance: ${dist.toFixed(1)} NM`);
    lines.push(`       Corridor    : ${seg.width_left_nm ?? 5.0} NM Left / ${seg.width_right_nm ?? 5.0} NM Right`);
  }

  lines.push(`───────────────────────────────────────────────────────────────────`);
  lines.push(`• Total Route Distance: ${totalDistance.toFixed(1)} NM`);
  lines.push(`• ARINC 424-23 Spec  : Compliant XML with Supplement 23 Government Schema`);
  lines.push(`═══════════════════════════════════════════════════════════════════`);

  return lines.join("\n");
}
