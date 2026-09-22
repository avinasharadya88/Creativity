import { MTRRoute } from "../types.js";
import { toArincDms } from "./corridorCalc.js";

export const RECORD_LENGTH = 132;

export function pad(
  value: any,
  length: number,
  alignLeft: boolean = true,
  padChar: string = " "
): string {
  const valStr = value == null ? "" : String(value);
  if (valStr.length > length) {
    return valStr.substring(0, length);
  }
  if (alignLeft) {
    return valStr.padEnd(length, padChar);
  } else {
    return valStr.padStart(length, padChar);
  }
}

export function formatAltitude(altFt: any): string {
  try {
    const val = parseInt(altFt, 10);
    if (isNaN(val)) return "00000";
    return String(Math.max(0, val)).padStart(5, "0");
  } catch {
    return "00000";
  }
}

export function generateMtrFixedRecords(
  route: MTRRoute,
  cycle: string = "2609"
): string[] {
  const records: string[] = [];
  const routeId = route.route_id || "MTR";
  const cleanId = routeId.replace(/-/g, "");
  const areaCode = "USA";
  const sectionCode = "U";
  const subsectionCode = "R";

  const segments = route.segments || [];
  if (segments.length === 0) {
    const recordLine =
      "S" +
      pad(areaCode, 3) +
      sectionCode +
      subsectionCode +
      pad(cleanId, 5) +
      pad("K2", 2) +
      "0010" +
      pad("HDR", 5) +
      pad(route.route_name || "", 30) +
      pad(formatAltitude(route.floor_alt_ft ?? 100), 5) +
      pad(formatAltitude(route.ceiling_alt_ft ?? 15000), 5) +
      pad("", 63) +
      pad(cycle, 4);

    records.push(pad(recordLine, RECORD_LENGTH));
    return records;
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const seq = (i + 1) * 10;
    const seqStr = String(seq).padStart(4, "0");
    const ptName = seg.point_name || `PT${i + 1}`;
    const lat = seg.latitude_dec || 0.0;
    const lon = seg.longitude_dec || 0.0;
    const [arincLat, arincLon] = toArincDms(lat, lon);

    const minAlt = formatAltitude(seg.min_alt_ft ?? route.floor_alt_ft ?? 100);
    const maxAlt = formatAltitude(seg.max_alt_ft ?? route.ceiling_alt_ft ?? 15000);

    const wLeft = Math.round((seg.width_left_nm ?? 5.0) * 10);
    const wRight = Math.round((seg.width_right_nm ?? 5.0) * 10);
    const widthStr = `${String(wLeft).padStart(3, "0")}${String(wRight).padStart(3, "0")}`;

    const terminator = i === 0 ? "IF" : "TF";

    const distNm = seg.segment_distance_nm || 0.0;
    const distStr = String(Math.round(distNm * 10)).padStart(4, "0");

    const part1 = "S" + pad(areaCode, 3) + sectionCode + subsectionCode + pad(cleanId, 5); // 11
    const part2 = pad("K2", 2) + seqStr + pad(ptName, 5) + pad("K2", 2) + pad(terminator, 2) + pad("", 5); // 20 -> 31
    const part3 = pad(arincLat, 9) + pad(arincLon, 10); // 19 -> 50
    const part4 = pad("", 6) + pad(distStr, 4) + pad(widthStr, 6); // 16 -> 66
    const part5 = pad(minAlt, 5) + pad(maxAlt, 5); // 10 -> 76

    const remarks = `${seg.point_type || ""} TO ${seg.next_point_name || ""}`.trim();
    const part6 = pad(remarks, 48); // 48 -> 124
    const part7 = pad("", 4); // 4 -> 128
    const part8 = pad(cycle, 4); // 4 -> 132

    let line = part1 + part2 + part3 + part4 + part5 + part6 + part7 + part8;
    if (line.length !== RECORD_LENGTH) {
      line = pad(line, RECORD_LENGTH);
    }
    records.push(line);
  }

  return records;
}

export function generateAllFixedRecords(
  routes: MTRRoute[],
  cycle: string = "2609"
): string {
  const allLines: string[] = [];
  for (const r of routes) {
    allLines.push(...generateMtrFixedRecords(r, cycle));
  }
  return allLines.join("\n");
}
