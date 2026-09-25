import fs from "fs";
import path from "path";
import { MTRRoute, MTRRouteSummary, MTRSegment } from "../types.js";
import {
  calculateBearing,
  calculateDistanceNm,
  destinationPoint,
  toArincDms,
  toHumanDms,
  generateCorridorPolygon,
} from "../generators/corridorCalc.js";
import {
  generateArinc424Xml,
  generateSingleRouteXml,
  decodeToPlainEnglish,
} from "../generators/arinc424Xml.js";
import {
  generateMtrFixedRecords,
  generateAllFixedRecords,
} from "../generators/arinc424Fixed.js";

export class MTRService {
  private routes: Map<string, MTRRoute> = new Map();

  constructor() {
    this.loadInitialData();
  }

  private loadInitialData() {
    try {
      const candidates = [
        path.join(process.cwd(), "initial_routes.json"),
        path.join(process.cwd(), "enasr-mtr-routes.json"),
      ];
      let loaded = false;

      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, "utf-8");
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const r of parsed) {
              this.enrichAndSaveRoute(r);
            }
            loaded = true;
            console.log(`Loaded ${this.routes.size} routes from ${path.basename(p)}`);
            break;
          } else if (parsed.features && Array.isArray(parsed.features)) {
            // GeoJSON feature collection
            for (const f of parsed.features) {
              const props = f.properties || {};
              const coords = f.geometry?.coordinates || [];
              const segments: MTRSegment[] = coords.map((c: number[], idx: number) => ({
                sequence_num: idx + 1,
                point_name: `PT_${idx + 1}`,
                point_type: idx === 0 ? "ENTRY" : idx === coords.length - 1 ? "EXIT" : "WAYPOINT",
                latitude_dec: c[1],
                longitude_dec: c[0],
                min_alt_ft: props.floor_alt_ft_msl || 200,
                max_alt_ft: props.ceiling_alt_ft_msl || 10000,
                width_left_nm: (props.route_width_nm || 10.0) / 2.0,
                width_right_nm: (props.route_width_nm || 10.0) / 2.0,
              }));
              this.enrichAndSaveRoute({
                route_id: props.route_id,
                route_type: props.route_type,
                route_name: props.route_name,
                originating_agency: props.originating_agency,
                artcc_facility: props.artcc_facility,
                floor_alt_ft: props.floor_alt_ft_msl || 200,
                ceiling_alt_ft: props.ceiling_alt_ft_msl || 10000,
                route_width_nm: props.route_width_nm || 10.0,
                status: props.status || "ACTIVE",
                segments,
              });
            }
            loaded = true;
            console.log(`Loaded ${this.routes.size} routes from ${path.basename(p)} GeoJSON`);
            break;
          }
        }
      }

      if (!loaded || this.routes.size === 0) {
        console.warn("No initial routes loaded. Seeding default demo route.");
        this.enrichAndSaveRoute({
          route_id: "IR-102",
          route_type: "IR",
          route_name: "IR-102 Mojave Desert Low Altitude Corridor",
          originating_agency: "USAF / Edwards AFB",
          artcc_facility: "ZLA - Los Angeles ARTCC",
          floor_alt_ft: 100,
          ceiling_alt_ft: 15000,
          route_width_nm: 10.0,
          status: "ACTIVE",
          segments: [
            {
              sequence_num: 1,
              point_name: "PT_A_ENTRY",
              point_type: "ENTRY",
              latitude_dec: 34.9056,
              longitude_dec: -117.8821,
              min_alt_ft: 100,
              max_alt_ft: 15000,
              width_left_nm: 5.0,
              width_right_nm: 5.0,
            },
            {
              sequence_num: 2,
              point_name: "PT_B_TURN",
              point_type: "TURN_POINT",
              latitude_dec: 35.1211,
              longitude_dec: -117.3811,
              min_alt_ft: 200,
              max_alt_ft: 15000,
              width_left_nm: 5.0,
              width_right_nm: 5.0,
            },
            {
              sequence_num: 3,
              point_name: "PT_C_EXIT",
              point_type: "EXIT",
              latitude_dec: 35.4512,
              longitude_dec: -116.8912,
              min_alt_ft: 500,
              max_alt_ft: 15000,
              width_left_nm: 5.0,
              width_right_nm: 5.0,
            },
          ],
        });
      }
    } catch (err) {
      console.error("Failed to load initial data:", err);
    }
  }

  private enrichAndSaveRoute(rawRoute: any): MTRRoute {
    const routeId = String(rawRoute.route_id || "MTR").trim().toUpperCase();
    const rawSegments = rawRoute.segments || [];

    const enrichedSegments: MTRSegment[] = [];
    let cumulativeNm = 0.0;

    for (let i = 0; i < rawSegments.length; i++) {
      const seg: MTRSegment = { ...rawSegments[i] };
      const lat1 = seg.latitude_dec;
      const lon1 = seg.longitude_dec;

      let lat2 = seg.next_lat_dec;
      let lon2 = seg.next_lon_dec;
      if ((lat2 == null || lon2 == null) && i + 1 < rawSegments.length) {
        lat2 = rawSegments[i + 1].latitude_dec;
        lon2 = rawSegments[i + 1].longitude_dec;
        seg.next_lat_dec = lat2;
        seg.next_lon_dec = lon2;
        if (!seg.next_point_name) {
          seg.next_point_name = rawSegments[i + 1].point_name;
        }
      }

      let dist = seg.segment_distance_nm;
      if (lat2 != null && lon2 != null) {
        const bearing = calculateBearing(lat1, lon1, lat2, lon2);
        seg.bearing_deg = bearing;
        if (dist == null) {
          dist = calculateDistanceNm(lat1, lon1, lat2, lon2);
          seg.segment_distance_nm = dist;
        }
      }

      const distVal = dist != null ? dist : 0.0;
      seg.cumulative_distance_nm = Math.round(cumulativeNm * 10) / 10;
      cumulativeNm += distVal;

      const [arincLat, arincLon] = toArincDms(lat1, lon1);
      const [humanLat, humanLon] = toHumanDms(lat1, lon1);
      seg.arinc_lat = arincLat;
      seg.arinc_lon = arincLon;
      seg.human_lat = humanLat;
      seg.human_lon = humanLon;

      enrichedSegments.push(seg);
    }

    const corridorPoly = generateCorridorPolygon(enrichedSegments);

    const fullRoute: MTRRoute = {
      ...rawRoute,
      route_id: routeId,
      route_type: (rawRoute.route_type || "IR").toUpperCase(),
      route_name: rawRoute.route_name || `${routeId} Training Route`,
      originating_agency: rawRoute.originating_agency || "USAF / Command",
      artcc_facility: rawRoute.artcc_facility || "ARTCC",
      operating_hours: rawRoute.operating_hours || "CONTINUOUS",
      floor_alt_ft: Number(rawRoute.floor_alt_ft ?? 100),
      ceiling_alt_ft: Number(rawRoute.ceiling_alt_ft ?? 15000),
      route_width_nm: Number(rawRoute.route_width_nm ?? 10.0),
      status: rawRoute.status || "ACTIVE",
      segments: enrichedSegments,
      waypoint_count: enrichedSegments.length,
      total_distance_nm: Math.round(cumulativeNm * 10) / 10,
      corridor_polygon: corridorPoly,
    };

    this.routes.set(routeId, fullRoute);
    return fullRoute;
  }

  private validateRoute(routeData: any): void {
    if (!routeData || typeof routeData !== "object" || Array.isArray(routeData)) {
      throw new Error("Route payload must be a JSON object");
    }

    const routeId = String(routeData.route_id || "").trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(routeId)) {
      throw new Error("route_id must be 1-32 characters using only letters, numbers, '_' or '-'");
    }

    const routeType = String(routeData.route_type || "").toUpperCase();
    if (!new Set(["IR", "VR", "SR"]).has(routeType)) {
      throw new Error("route_type must be IR, VR, or SR");
    }

    const requiredText = ["route_name", "originating_agency", "artcc_facility"];
    for (const field of requiredText) {
      if (typeof routeData[field] !== "string" || routeData[field].trim().length === 0 || routeData[field].length > 200) {
        throw new Error(`${field} must be a non-empty string of at most 200 characters`);
      }
    }

    const finiteInRange = (value: unknown, min: number, max: number) =>
      typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
    if (!finiteInRange(routeData.floor_alt_ft, 0, 99999) || !finiteInRange(routeData.ceiling_alt_ft, 0, 99999)) {
      throw new Error("Route altitudes must be finite numbers between 0 and 99,999 feet");
    }
    if (routeData.floor_alt_ft > routeData.ceiling_alt_ft) {
      throw new Error("floor_alt_ft cannot exceed ceiling_alt_ft");
    }
    if (!finiteInRange(routeData.route_width_nm, 0.1, 99.9)) {
      throw new Error("route_width_nm must be between 0.1 and 99.9 NM");
    }
    if (!Array.isArray(routeData.segments) || routeData.segments.length < 2 || routeData.segments.length > 1000) {
      throw new Error("segments must contain between 2 and 1,000 waypoints");
    }

    const sequences = new Set<number>();
    routeData.segments.forEach((segment: any, index: number) => {
      if (!segment || typeof segment !== "object" || Array.isArray(segment)) {
        throw new Error(`segments[${index}] must be an object`);
      }
      if (!Number.isInteger(segment.sequence_num) || segment.sequence_num < 1 || sequences.has(segment.sequence_num)) {
        throw new Error(`segments[${index}].sequence_num must be a unique positive integer`);
      }
      sequences.add(segment.sequence_num);
      if (typeof segment.point_name !== "string" || !/^[A-Za-z0-9_.-]{1,40}$/.test(segment.point_name)) {
        throw new Error(`segments[${index}].point_name contains unsupported characters`);
      }
      if (!new Set(["ENTRY", "WAYPOINT", "TURN_POINT", "EXIT"]).has(String(segment.point_type).toUpperCase())) {
        throw new Error(`segments[${index}].point_type is invalid`);
      }
      if (!finiteInRange(segment.latitude_dec, -90, 90) || !finiteInRange(segment.longitude_dec, -180, 180)) {
        throw new Error(`segments[${index}] coordinates are outside WGS84 bounds`);
      }
      for (const widthField of ["width_left_nm", "width_right_nm"] as const) {
        if (segment[widthField] != null && !finiteInRange(segment[widthField], 0, 99.9)) {
          throw new Error(`segments[${index}].${widthField} must be between 0 and 99.9 NM`);
        }
      }
      for (const altitudeField of ["min_alt_ft", "max_alt_ft"] as const) {
        if (segment[altitudeField] != null && !finiteInRange(segment[altitudeField], 0, 99999)) {
          throw new Error(`segments[${index}].${altitudeField} must be between 0 and 99,999 feet`);
        }
      }
      if (segment.min_alt_ft != null && segment.max_alt_ft != null && segment.min_alt_ft > segment.max_alt_ft) {
        throw new Error(`segments[${index}] minimum altitude cannot exceed maximum altitude`);
      }
    });
  }

  public listRoutes(routeType?: string): MTRRouteSummary[] {
    const list: MTRRouteSummary[] = [];
    const filterType = routeType ? routeType.trim().toUpperCase() : null;

    for (const r of this.routes.values()) {
      if (filterType && r.route_type !== filterType) continue;
      list.push({
        route_id: r.route_id,
        route_type: r.route_type,
        route_name: r.route_name,
        originating_agency: r.originating_agency,
        artcc_facility: r.artcc_facility,
        floor_alt_ft: r.floor_alt_ft,
        ceiling_alt_ft: r.ceiling_alt_ft,
        route_width_nm: r.route_width_nm,
        status: r.status || "ACTIVE",
        waypoint_count: r.segments.length,
      });
    }

    // Sort alphabetically by route_id
    list.sort((a, b) => a.route_id.localeCompare(b.route_id, undefined, { numeric: true }));
    return list;
  }

  public getRouteDetails(routeId: string): MTRRoute | null {
    return this.routes.get(routeId.trim().toUpperCase()) || null;
  }

  public getRouteGeojson(routeId: string): any | null {
    const route = this.getRouteDetails(routeId);
    if (!route) return null;

    const features: any[] = [];
    const segments = route.segments || [];

    // 1. Centerline LineString
    const coords: number[][] = [];
    for (const s of segments) {
      coords.push([s.longitude_dec, s.latitude_dec]);
    }
    if (segments.length > 0 && segments[segments.length - 1].next_lon_dec != null) {
      coords.push([
        segments[segments.length - 1].next_lon_dec!,
        segments[segments.length - 1].next_lat_dec!,
      ]);
    }

    features.push({
      type: "Feature",
      id: `${route.route_id}-centerline`,
      properties: {
        feature_type: "CENTERLINE",
        route_id: route.route_id,
        route_type: route.route_type,
        route_name: route.route_name,
        agency: route.originating_agency,
        floor_alt_ft: route.floor_alt_ft,
        ceiling_alt_ft: route.ceiling_alt_ft,
        width_nm: route.route_width_nm,
        total_distance_nm: route.total_distance_nm,
      },
      geometry: {
        type: "LineString",
        coordinates: coords,
      },
    });

    // 2. Corridor Ribbon Polygon
    const corridorCoords = route.corridor_polygon || [];
    if (corridorCoords.length > 0) {
      features.push({
        type: "Feature",
        id: `${route.route_id}-corridor`,
        properties: {
          feature_type: "CORRIDOR_RIBBON",
          route_id: route.route_id,
          width_nm: route.route_width_nm,
          floor_alt_ft: route.floor_alt_ft,
          ceiling_alt_ft: route.ceiling_alt_ft,
        },
        geometry: {
          type: "Polygon",
          coordinates: [corridorCoords],
        },
      });
    }

    // 3. Waypoint Points
    for (const s of segments) {
      features.push({
        type: "Feature",
        id: `${route.route_id}-${s.point_name}`,
        properties: {
          feature_type: "WAYPOINT",
          route_id: route.route_id,
          point_name: s.point_name,
          point_type: s.point_type,
          sequence_num: s.sequence_num,
          min_alt_ft: s.min_alt_ft,
          max_alt_ft: s.max_alt_ft,
          human_coords: `${s.human_lat}, ${s.human_lon}`,
          arinc_coords: `${s.arinc_lat}, ${s.arinc_lon}`,
        },
        geometry: {
          type: "Point",
          coordinates: [s.longitude_dec, s.latitude_dec],
        },
      });
    }

    return {
      type: "FeatureCollection",
      name: `MTR_${route.route_id}`,
      route_id: route.route_id,
      features,
    };
  }

  public getAllRoutesGeojson(): any {
    const allRoutes = this.listRoutes();
    const unifiedFeatures: any[] = [];
    for (const rSummary of allRoutes) {
      const rGeo = this.getRouteGeojson(rSummary.route_id);
      if (rGeo && Array.isArray(rGeo.features)) {
        unifiedFeatures.push(...rGeo.features);
      }
    }
    return {
      type: "FeatureCollection",
      name: "eNASR_All_Military_Training_Routes",
      features: unifiedFeatures,
    };
  }

  public getArinc424Xml(routeId?: string): string {
    if (routeId) {
      const route = this.getRouteDetails(routeId);
      if (!route) return `<!-- Route '${routeId}' not found -->`;
      return generateSingleRouteXml(route);
    } else {
      const routes = Array.from(this.routes.values());
      return generateArinc424Xml(routes);
    }
  }

  public getArinc424Fixed(routeId?: string): string {
    if (routeId) {
      const route = this.getRouteDetails(routeId);
      if (!route) return `// Route '${routeId}' not found\n`;
      return generateMtrFixedRecords(route).join("\n");
    } else {
      const routes = Array.from(this.routes.values());
      return generateAllFixedRecords(routes);
    }
  }

  public getPlainEnglish(routeId: string): string {
    const route = this.getRouteDetails(routeId);
    if (!route) return `Route '${routeId}' not found.`;
    return decodeToPlainEnglish(route);
  }

  public createOrUpdateRoute(routeData: any): MTRRoute {
    this.validateRoute(routeData);
    return this.enrichAndSaveRoute(routeData);
  }
}
