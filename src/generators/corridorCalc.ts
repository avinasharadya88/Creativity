import { MTRSegment } from "../types.js";

export const EARTH_RADIUS_NM = 3440.065; // WGS-84 mean radius in Nautical Miles

export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  const bearing = ((theta * 180) / Math.PI + 360.0) % 360.0;
  return Math.round(bearing * 100) / 100;
}

export function calculateDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2.0) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2.0) ** 2;
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  const distance = EARTH_RADIUS_NM * c;
  return Math.round(distance * 100) / 100;
}

export function destinationPoint(
  lat: number,
  lon: number,
  distanceNm: number,
  bearingDeg: number
): [number, number] {
  const delta = distanceNm / EARTH_RADIUS_NM;
  const theta = (bearingDeg * Math.PI) / 180;
  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lon * Math.PI) / 180;

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );

  const lonDeg = (((lambda2 * 180) / Math.PI + 540.0) % 360.0) - 180.0;
  const latDeg = (phi2 * 180) / Math.PI;
  return [Math.round(latDeg * 1e6) / 1e6, Math.round(lonDeg * 1e6) / 1e6];
}

export function toArincDms(lat: number, lon: number): [string, string] {
  const latHem = lat >= 0 ? "N" : "S";
  const latAbs = Math.abs(lat);
  let latDeg = Math.floor(latAbs);
  const latRem = (latAbs - latDeg) * 60.0;
  let latMin = Math.floor(latRem);
  const latSec = (latRem - latMin) * 60.0;
  let latSecInt = Math.round(latSec * 100);
  if (latSecInt >= 6000) {
    latSecInt = 0;
    latMin += 1;
  }
  if (latMin >= 60) {
    latMin = 0;
    latDeg += 1;
  }
  const latStr = `${String(latDeg).padStart(2, "0")}${String(latMin).padStart(2, "0")}${String(latSecInt).padStart(4, "0")}${latHem}`;

  const lonHem = lon >= 0 ? "E" : "W";
  const lonAbs = Math.abs(lon);
  let lonDeg = Math.floor(lonAbs);
  const lonRem = (lonAbs - lonDeg) * 60.0;
  let lonMin = Math.floor(lonRem);
  const lonSec = (lonRem - lonMin) * 60.0;
  let lonSecInt = Math.round(lonSec * 100);
  if (lonSecInt >= 6000) {
    lonSecInt = 0;
    lonMin += 1;
  }
  if (lonMin >= 60) {
    lonMin = 0;
    lonDeg += 1;
  }
  const lonStr = `${String(lonDeg).padStart(3, "0")}${String(lonMin).padStart(2, "0")}${String(lonSecInt).padStart(4, "0")}${lonHem}`;

  return [latStr, lonStr];
}

export function toHumanDms(lat: number, lon: number): [string, string] {
  const latHem = lat >= 0 ? "N" : "S";
  const latAbs = Math.abs(lat);
  let latDeg = Math.floor(latAbs);
  const latRem = (latAbs - latDeg) * 60.0;
  let latMin = Math.floor(latRem);
  let latSec = Math.round((latRem - latMin) * 60.0 * 100) / 100;
  if (latSec >= 60) {
    latSec = 0;
    latMin += 1;
  }
  if (latMin >= 60) {
    latMin = 0;
    latDeg += 1;
  }
  const latSecStr = latSec < 10 ? `0${latSec.toFixed(2)}` : latSec.toFixed(2);
  const latStr = `${String(latDeg).padStart(2, "0")}° ${String(latMin).padStart(2, "0")}' ${latSecStr}" ${latHem}`;

  const lonHem = lon >= 0 ? "E" : "W";
  const lonAbs = Math.abs(lon);
  let lonDeg = Math.floor(lonAbs);
  const lonRem = (lonAbs - lonDeg) * 60.0;
  let lonMin = Math.floor(lonRem);
  let lonSec = Math.round((lonRem - lonMin) * 60.0 * 100) / 100;
  if (lonSec >= 60) {
    lonSec = 0;
    lonMin += 1;
  }
  if (lonMin >= 60) {
    lonMin = 0;
    lonDeg += 1;
  }
  const lonSecStr = lonSec < 10 ? `0${lonSec.toFixed(2)}` : lonSec.toFixed(2);
  const lonStr = `${String(lonDeg).padStart(3, "0")}° ${String(lonMin).padStart(2, "0")}' ${lonSecStr}" ${lonHem}`;

  return [latStr, lonStr];
}

export function generateCorridorPolygon(segments: MTRSegment[]): number[][] {
  if (!segments || segments.length < 2) return [];

  const points = segments.map((segment) => [segment.latitude_dec, segment.longitude_dec] as [number, number]);
  const leftPoints: [number, number][] = [];
  const rightPoints: [number, number][] = [];

  const normalizeDelta = (degrees: number) => ((degrees + 540) % 360) - 180;

  for (let i = 0; i < points.length; i++) {
    const [lat, lon] = points[i];
    const incoming = i > 0
      ? calculateBearing(points[i - 1][0], points[i - 1][1], lat, lon)
      : calculateBearing(lat, lon, points[i + 1][0], points[i + 1][1]);
    const outgoing = i < points.length - 1
      ? calculateBearing(lat, lon, points[i + 1][0], points[i + 1][1])
      : incoming;
    const turn = normalizeDelta(outgoing - incoming);
    const tangent = (incoming + turn / 2 + 360) % 360;

    // A mitered geodesic join keeps adjacent offsets connected. The cap avoids
    // extreme spikes at near-reversals, which are rejected by topology checks.
    const miterScale = Math.min(4, 1 / Math.max(0.25, Math.cos(Math.abs(turn) * Math.PI / 360)));
    const widthSource = segments[Math.min(i, segments.length - 1)];
    const widthLeft = (widthSource.width_left_nm ?? 5) * miterScale;
    const widthRight = (widthSource.width_right_nm ?? 5) * miterScale;

    leftPoints.push(destinationPoint(lat, lon, widthLeft, (tangent - 90 + 360) % 360));
    rightPoints.push(destinationPoint(lat, lon, widthRight, (tangent + 90) % 360));
  }

  const polygonCoords: number[][] = [];
  for (const [lat, lon] of leftPoints) {
    polygonCoords.push([lon, lat]);
  }
  for (let j = rightPoints.length - 1; j >= 0; j--) {
    const [lat, lon] = rightPoints[j];
    polygonCoords.push([lon, lat]);
  }

  if (polygonCoords.length > 0) {
    polygonCoords.push(polygonCoords[0]);
  }

  const validation = validateCorridorPolygon(polygonCoords);
  if (!validation.valid) {
    throw new Error(`Corridor geometry is invalid: ${validation.error}`);
  }

  return polygonCoords;
}

export function validateCorridorPolygon(polygon: number[][]): { valid: boolean; error?: string } {
  if (polygon.length < 4) return { valid: false, error: "polygon has fewer than four coordinates" };
  if (polygon.some((point) => point.length < 2 || !point.every(Number.isFinite))) {
    return { valid: false, error: "polygon contains non-finite coordinates" };
  }
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { valid: false, error: "polygon ring is not closed" };
  }

  const orientation = (a: number[], b: number[], c: number[]) =>
    (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  const intersects = (a: number[], b: number[], c: number[], d: number[]) => {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
  };

  const edgeCount = polygon.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const a = polygon[i];
    const b = polygon[i + 1];
    if (a[0] === b[0] && a[1] === b[1]) {
      return { valid: false, error: "polygon contains a zero-length edge" };
    }
    for (let j = i + 1; j < edgeCount; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === edgeCount - 1);
      if (!adjacent && intersects(a, b, polygon[j], polygon[j + 1])) {
        return { valid: false, error: `edges ${i + 1} and ${j + 1} intersect` };
      }
    }
  }
  return { valid: true };
}
