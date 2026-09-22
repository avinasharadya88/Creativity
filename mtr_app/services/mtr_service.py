"""
MTR Service Layer.
Connects to enasr-geospatial.db SQLite database, enriches MTR data,
computes corridor geometry, and provides format conversions (XML, Fixed, GeoJSON, Plain-English).
"""

import sqlite3
import json
import os
from typing import List, Dict, Any, Optional
from mtr_app.generators.corridor_calc import (
    calculate_bearing,
    calculate_distance_nm,
    to_arinc_dms,
    to_human_dms,
    generate_corridor_polygon
)
from mtr_app.generators.arinc424_xml import (
    generate_arinc424_xml,
    generate_single_route_xml,
    validate_arinc424_xml,
    decode_to_plain_english
)
from mtr_app.generators.arinc424_fixed import (
    generate_mtr_fixed_records,
    generate_all_fixed_records
)

from mtr_app.services.supabase_service import SupabaseService, load_env_file

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "enasr-geospatial.db")


class MTRService:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or DEFAULT_DB_PATH
        self._ensure_db_initialized()
        self.supabase = SupabaseService()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_db_initialized(self):
        """Verify MTR tables exist in the database."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='mtr_routes'")
            if not cursor.fetchone():
                # Read schema from enasr-schema.sql if needed
                schema_path = os.path.join(os.path.dirname(self.db_path), "enasr-schema.sql")
                if os.path.exists(schema_path):
                    with open(schema_path, "r", encoding="utf-8") as f:
                        conn.executescript(f.read())
        finally:
            conn.close()

    def list_routes(self, route_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all MTR routes with summary statistics (Supabase if configured, SQLite fallback)."""
        if self.supabase.is_configured():
            try:
                sb_routes = self.supabase.list_routes(route_type=route_type)
                if sb_routes:
                    return sb_routes
            except Exception as e:
                print(f"[Warning] Supabase fetch failed: {e}. Falling back to SQLite.")

        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if route_type:
                cursor.execute("""
                    SELECT r.*, COUNT(s.segment_id) as waypoint_count 
                    FROM mtr_routes r 
                    LEFT JOIN mtr_segments s ON r.route_id = s.route_id
                    WHERE r.route_type = ?
                    GROUP BY r.route_id
                    ORDER BY r.route_id
                """, (route_type.upper(),))
            else:
                cursor.execute("""
                    SELECT r.*, COUNT(s.segment_id) as waypoint_count 
                    FROM mtr_routes r 
                    LEFT JOIN mtr_segments s ON r.route_id = s.route_id
                    GROUP BY r.route_id
                    ORDER BY r.route_id
                """)
            routes = [dict(row) for row in cursor.fetchall()]
            return routes
        finally:
            conn.close()

    def get_route_details(self, route_id: str) -> Optional[Dict[str, Any]]:
        """Fetch full details for an MTR route, enriched with segment bearings and corridor polygon."""
        route = None
        raw_segments = []

        if self.supabase.is_configured():
            try:
                sb_route = self.supabase.get_route_details(route_id)
                if sb_route:
                    route = sb_route
                    raw_segments = route.get("segments", [])
            except Exception as e:
                print(f"[Warning] Supabase route fetch failed: {e}. Falling back to SQLite.")

        if not route:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM mtr_routes WHERE route_id = ?", (route_id,))
                row = cursor.fetchone()
                if not row:
                    return None
                
                route = dict(row)
                cursor.execute("SELECT * FROM mtr_segments WHERE route_id = ? ORDER BY sequence_num", (route_id,))
                raw_segments = [dict(s) for s in cursor.fetchall()]
            finally:
                conn.close()

        # Enrich segments
        enriched_segments = []
        cumulative_nm = 0.0

        for i, seg in enumerate(raw_segments):
            seg_dict = dict(seg)
            lat1 = seg_dict.get("latitude_dec", 0.0)
            lon1 = seg_dict.get("longitude_dec", 0.0)

            # Determine next coordinates if missing
            lat2 = seg_dict.get("next_lat_dec")
            lon2 = seg_dict.get("next_lon_dec")
            if (lat2 is None or lon2 is None) and i + 1 < len(raw_segments):
                lat2 = raw_segments[i + 1].get("latitude_dec")
                lon2 = raw_segments[i + 1].get("longitude_dec")
                seg_dict["next_lat_dec"] = lat2
                seg_dict["next_lon_dec"] = lon2
                if not seg_dict.get("next_point_name"):
                    seg_dict["next_point_name"] = raw_segments[i + 1].get("point_name")

            # Distance and Bearing
            dist = seg_dict.get("segment_distance_nm")
            if lat2 is not None and lon2 is not None:
                bearing = calculate_bearing(lat1, lon1, lat2, lon2)
                seg_dict["bearing_deg"] = bearing
                if dist is None:
                    dist = calculate_distance_nm(lat1, lon1, lat2, lon2)
                    seg_dict["segment_distance_nm"] = dist

            dist_val = dist if dist is not None else 0.0
            seg_dict["cumulative_distance_nm"] = round(cumulative_nm, 1)
            cumulative_nm += dist_val

            # Coordinate strings
            arinc_lat, arinc_lon = to_arinc_dms(lat1, lon1)
            human_lat, human_lon = to_human_dms(lat1, lon1)
            seg_dict["arinc_lat"] = arinc_lat
            seg_dict["arinc_lon"] = arinc_lon
            seg_dict["human_lat"] = human_lat
            seg_dict["human_lon"] = human_lon

            enriched_segments.append(seg_dict)

        route["segments"] = enriched_segments
        route["total_distance_nm"] = round(cumulative_nm, 1)

        # Generate corridor polygon
        corridor_poly = generate_corridor_polygon(enriched_segments)
        route["corridor_polygon"] = corridor_poly

        return route

    def get_route_geojson(self, route_id: str) -> Optional[Dict[str, Any]]:
        """Returns a GeoJSON FeatureCollection for a single MTR route with Centerline, Corridor, and Waypoints."""
        route = self.get_route_details(route_id)
        if not route:
            return None

        features = []
        segments = route.get("segments", [])

        # 1. Centerline LineString
        coords = []
        for s in segments:
            coords.append([s["longitude_dec"], s["latitude_dec"]])
        if segments and segments[-1].get("next_lon_dec") is not None:
            coords.append([segments[-1]["next_lon_dec"], segments[-1]["next_lat_dec"]])

        features.append({
            "type": "Feature",
            "id": f"{route_id}-centerline",
            "properties": {
                "feature_type": "CENTERLINE",
                "route_id": route_id,
                "route_type": route.get("route_type"),
                "route_name": route.get("route_name"),
                "agency": route.get("originating_agency"),
                "floor_alt_ft": route.get("floor_alt_ft"),
                "ceiling_alt_ft": route.get("ceiling_alt_ft"),
                "width_nm": route.get("route_width_nm"),
                "total_distance_nm": route.get("total_distance_nm")
            },
            "geometry": {
                "type": "LineString",
                "coordinates": coords
            }
        })

        # 2. Corridor Ribbon Polygon
        corridor_coords = route.get("corridor_polygon", [])
        if corridor_coords:
            features.append({
                "type": "Feature",
                "id": f"{route_id}-corridor",
                "properties": {
                    "feature_type": "CORRIDOR_RIBBON",
                    "route_id": route_id,
                    "width_nm": route.get("route_width_nm"),
                    "floor_alt_ft": route.get("floor_alt_ft"),
                    "ceiling_alt_ft": route.get("ceiling_alt_ft")
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [corridor_coords]
                }
            })

        # 3. Waypoint Points
        for s in segments:
            features.append({
                "type": "Feature",
                "id": f"{route_id}-{s['point_name']}",
                "properties": {
                    "feature_type": "WAYPOINT",
                    "route_id": route_id,
                    "point_name": s["point_name"],
                    "point_type": s["point_type"],
                    "sequence_num": s["sequence_num"],
                    "min_alt_ft": s.get("min_alt_ft"),
                    "max_alt_ft": s.get("max_alt_ft"),
                    "human_coords": f"{s['human_lat']}, {s['human_lon']}",
                    "arinc_coords": f"{s['arinc_lat']}, {s['arinc_lon']}"
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [s["longitude_dec"], s["latitude_dec"]]
                }
            })

        return {
            "type": "FeatureCollection",
            "name": f"MTR_{route_id}",
            "route_id": route_id,
            "features": features
        }

    def get_all_routes_geojson(self) -> Dict[str, Any]:
        """Returns a unified GeoJSON FeatureCollection of all MTR routes."""
        all_routes = self.list_routes()
        unified_features = []
        for r_summary in all_routes:
            r_geo = self.get_route_geojson(r_summary["route_id"])
            if r_geo:
                unified_features.extend(r_geo.get("features", []))

        return {
            "type": "FeatureCollection",
            "name": "eNASR_All_Military_Training_Routes",
            "features": unified_features
        }

    def get_arinc424_xml(self, route_id: Optional[str] = None, pretty: bool = True) -> str:
        """Returns ARINC 424-23 compliant XML for a single route or all routes."""
        if route_id:
            route = self.get_route_details(route_id)
            if not route:
                return f"<!-- Route '{route_id}' not found -->"
            return generate_single_route_xml(route, pretty=pretty)
        else:
            routes = [self.get_route_details(r["route_id"]) for r in self.list_routes()]
            routes = [r for r in routes if r is not None]
            return generate_arinc424_xml(routes, pretty=pretty)

    def get_arinc424_fixed(self, route_id: Optional[str] = None) -> str:
        """Returns ARINC 424 132-character fixed records."""
        if route_id:
            route = self.get_route_details(route_id)
            if not route:
                return f"// Route '{route_id}' not found\n"
            records = generate_mtr_fixed_records(route)
            return "\n".join(records)
        else:
            routes = [self.get_route_details(r["route_id"]) for r in self.list_routes()]
            routes = [r for r in routes if r is not None]
            return generate_all_fixed_records(routes)

    def get_plain_english(self, route_id: str) -> str:
        """Returns human-readable plain-English operational flight brief."""
        route = self.get_route_details(route_id)
        if not route:
            return f"Route '{route_id}' not found."
        return decode_to_plain_english(route)

    def create_or_update_route(self, route_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Creates or updates an MTR route and its segments in the SQLite database.
        """
        route_id = route_data.get("route_id", "").strip().upper()
        if not route_id:
            raise ValueError("route_id is required")

        route_type = route_data.get("route_type", "IR").strip().upper()
        route_name = route_data.get("route_name", f"{route_id} Training Route")
        originating_agency = route_data.get("originating_agency", "USAF / Command")
        artcc_facility = route_data.get("artcc_facility", "ARTCC")
        operating_hours = route_data.get("operating_hours", "CONTINUOUS")
        floor_alt_ft = int(route_data.get("floor_alt_ft", 100))
        ceiling_alt_ft = int(route_data.get("ceiling_alt_ft", 15000))
        route_width_nm = float(route_data.get("route_width_nm", 10.0))
        status = route_data.get("status", "ACTIVE")
        segments = route_data.get("segments", [])

        # Build WKT LineString
        wkt_coords = []
        for s in segments:
            wkt_coords.append(f"{s['longitude_dec']} {s['latitude_dec']}")
        wkt = f"LINESTRING({', '.join(wkt_coords)})" if wkt_coords else None

        if self.supabase.is_configured():
            try:
                self.supabase.create_or_update_route(route_data)
            except Exception as e:
                print(f"[Warning] Supabase sync failed: {e}")

        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO mtr_routes (
                    route_id, route_type, route_name, originating_agency, artcc_facility,
                    floor_alt_ft, ceiling_alt_ft, route_width_nm, status, geometry_wkt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(route_id) DO UPDATE SET
                    route_type = excluded.route_type,
                    route_name = excluded.route_name,
                    originating_agency = excluded.originating_agency,
                    artcc_facility = excluded.artcc_facility,
                    floor_alt_ft = excluded.floor_alt_ft,
                    ceiling_alt_ft = excluded.ceiling_alt_ft,
                    route_width_nm = excluded.route_width_nm,
                    status = excluded.status,
                    geometry_wkt = excluded.geometry_wkt
            """, (
                route_id, route_type, route_name, originating_agency, artcc_facility,
                floor_alt_ft, ceiling_alt_ft, route_width_nm, status, wkt
            ))

            # Delete old segments and insert new ones
            cursor.execute("DELETE FROM mtr_segments WHERE route_id = ?", (route_id,))
            for i, s in enumerate(segments):
                seq_num = s.get("sequence_num", i + 1)
                pt_name = s.get("point_name", f"PT_{seq_num}")
                pt_type = s.get("point_type", "ENTRY" if seq_num == 1 else "WAYPOINT")
                lat1 = float(s.get("latitude_dec", 0.0))
                lon1 = float(s.get("longitude_dec", 0.0))
                min_alt = int(s.get("min_alt_ft", floor_alt_ft))
                max_alt = int(s.get("max_alt_ft", ceiling_alt_ft))
                w_left = float(s.get("width_left_nm", route_width_nm / 2.0))
                w_right = float(s.get("width_right_nm", route_width_nm / 2.0))
                next_pt = s.get("next_point_name")
                next_lat = s.get("next_lat_dec")
                next_lon = s.get("next_lon_dec")
                seg_dist = s.get("segment_distance_nm")

                seg_wkt = None
                if next_lat is not None and next_lon is not None:
                    seg_wkt = f"LINESTRING({lon1} {lat1}, {next_lon} {next_lat})"

                cursor.execute("""
                    INSERT INTO mtr_segments (
                        route_id, sequence_num, point_name, point_type,
                        latitude_dec, longitude_dec, min_alt_ft, max_alt_ft,
                        width_left_nm, width_right_nm, next_point_name,
                        segment_distance_nm, geometry_wkt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    route_id, seq_num, pt_name, pt_type,
                    lat1, lon1, min_alt, max_alt,
                    w_left, w_right, next_pt,
                    seg_dist, seg_wkt
                ))

            conn.commit()
            return self.get_route_details(route_id) or {}
        finally:
            conn.close()
