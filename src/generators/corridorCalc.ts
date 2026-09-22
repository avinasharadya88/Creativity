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
  if (!segments || segments.length === 0) return [];

  const leftPoints: [number, number][] = [];
  const rightPoints: [number, number][] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const lat1 = seg.latitude_dec;
    const lon1 = seg.longitude_dec;
    let lat2 = seg.next_lat_dec;
    let lon2 = seg.next_lon_dec;

    if (lat2 == null || lon2 == null) {
      if (i + 1 < segments.length) {
        lat2 = segments[i + 1].latitude_dec;
        lon2 = segments[i + 1].longitude_dec;
      } else {
        break;
      }
    }

    const widthLeft = seg.width_left_nm != null ? seg.width_left_nm : 5.0;
    const widthRight = seg.width_right_nm != null ? seg.width_right_nm : 5.0;

    const course = calculateBearing(lat1, lon1, lat2, lon2);
    const bearingLeft = (course - 90.0 + 360.0) % 360.0;
    const bearingRight = (course + 90.0) % 360.0;

    const startLeft = destinationPoint(lat1, lon1, widthLeft, bearingLeft);
    const startRight = destinationPoint(lat1, lon1, widthRight, bearingRight);

    const endLeft = destinationPoint(lat2, lon2, widthLeft, bearingLeft);
    const endRight = destinationPoint(lat2, lon2, widthRight, bearingRight);

    leftPoints.push(startLeft);
    if (i === segments.length - 1 || (i + 1 < segments.length && segments[i + 1].next_lat_dec == null)) {
      leftPoints.push(endLeft);
    }

    rightPoints.push(startRight);
    if (i === segments.length - 1 || (i + 1 < segments.length && segments[i + 1].next_lat_dec == null)) {
      rightPoints.push(endRight);
    }
  }

  if (leftPoints.length === 0 || rightPoints.length === 0) return [];

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

  return polygonCoords;
}
