"""
Supabase Database Service Layer for eNASR MTR Application.
Interfaces directly with Supabase REST API (https://ahmpkflqibikzhfiecgo.supabase.co/rest/v1/).
Supports zero external Python dependencies using standard library urllib.request.
"""

import os
import json
import urllib.request
import urllib.parse
from typing import List, Dict, Any, Optional

DEFAULT_SUPABASE_URL = "https://ahmpkflqibikzhfiecgo.supabase.co"


def load_env_file(filepath: str):
    """Simple parser for .env files without requiring python-dotenv."""
    try:
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        key = key.strip()
                        value = value.strip().strip("'").strip('"')
                        if key not in os.environ:
                            os.environ[key] = value
    except Exception:
        pass


# Attempt to load credentials from ~/.env and local .env
load_env_file(os.path.expanduser("~/.env"))
load_env_file(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))


class SupabaseService:
    def __init__(self, url: Optional[str] = None, api_key: Optional[str] = None):
        self.url = (url or os.environ.get("SUPABASE_URL") or DEFAULT_SUPABASE_URL).rstrip("/")
        self.api_key = api_key or os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    def is_configured(self) -> bool:
        """Returns True if Supabase API URL and Key are available."""
        return bool(self.url and self.api_key)

    def _request(self, endpoint: str, method: str = "GET", payload: Optional[Any] = None, headers_extra: Optional[Dict[str, str]] = None) -> Any:
        if not self.is_configured():
            raise ValueError("Supabase API key is missing. Set SUPABASE_ANON_KEY or SUPABASE_KEY in ~/.env")

        full_url = f"{self.url}/rest/v1/{endpoint.lstrip('/')}"
        req = urllib.request.Request(full_url, method=method.upper())
        req.add_header("apikey", self.api_key)
        req.add_header("Authorization", f"Bearer {self.api_key}")
        req.add_header("Content-Type", "application/json")

        if headers_extra:
            for k, v in headers_extra.items():
                req.add_header(k, v)

        data_bytes = None
        if payload is not None:
            data_bytes = json.dumps(payload).encode("utf-8")

        try:
            with urllib.request.urlopen(req, data=data_bytes, timeout=10) as resp:
                resp_text = resp.read().decode("utf-8")
                if resp_text:
                    return json.loads(resp_text)
                return None
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8") if e.fp else str(e)
            raise RuntimeError(f"Supabase HTTP {e.code} Error ({endpoint}): {err_body}")
        except Exception as e:
            raise RuntimeError(f"Supabase request failed ({endpoint}): {str(e)}")

    def list_routes(self, route_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch all routes from Supabase mtr_routes table."""
        endpoint = "mtr_routes?select=*,mtr_segments(count)&order=route_id.asc"
        if route_type:
            endpoint += f"&route_type=eq.{route_type.upper()}"
        
        data = self._request(endpoint, method="GET") or []
        routes = []
        for r in data:
            waypoint_count = 0
            if "mtr_segments" in r and isinstance(r["mtr_segments"], list) and len(r["mtr_segments"]) > 0:
                waypoint_count = r["mtr_segments"][0].get("count", 0)
            
            route_dict = dict(r)
            route_dict["waypoint_count"] = waypoint_count
            if "mtr_segments" in route_dict:
                del route_dict["mtr_segments"]
            routes.append(route_dict)

        return routes

    def get_route_details(self, route_id: str) -> Optional[Dict[str, Any]]:
        """Fetch route and joined segments from Supabase."""
        endpoint = f"mtr_routes?route_id=eq.{route_id}&select=*,mtr_segments(*)"
        data = self._request(endpoint, method="GET") or []
        if not data:
            return None

        route = dict(data[0])
        raw_segments = route.pop("mtr_segments", []) or []
        raw_segments.sort(key=lambda x: x.get("sequence_num", 0))

        route["segments"] = raw_segments
        return route

    def create_or_update_route(self, route_data: Dict[str, Any]) -> Dict[str, Any]:
        """Upsert a route and its segments into Supabase."""
        route_id = route_data.get("route_id")
        if not route_id:
            raise ValueError("route_id is required")

        route_record = {
            "route_id": route_id,
            "route_type": route_data.get("route_type", route_id[:2].upper()),
            "route_name": route_data.get("route_name", f"{route_id} Route"),
            "originating_agency": route_data.get("originating_agency", "USAF"),
            "artcc_facility": route_data.get("artcc_facility", "ZLA"),
            "floor_alt_ft": int(route_data.get("floor_alt_ft", 100)),
            "ceiling_alt_ft": int(route_data.get("ceiling_alt_ft", 10000)),
            "route_width_nm": float(route_data.get("route_width_nm", 10.0)),
            "status": route_data.get("status", "ACTIVE"),
            "geometry_wkt": route_data.get("geometry_wkt")
        }

        # 1. Upsert route header
        headers = {"Prefer": "resolution=merge-duplicates,return=representation"}
        self._request("mtr_routes", method="POST", payload=[route_record], headers_extra=headers)

        # 2. Delete existing segments and insert new ones
        self._request(f"mtr_segments?route_id=eq.{route_id}", method="DELETE")

        segments = route_data.get("segments", [])
        if segments:
            seg_records = []
            for i, s in enumerate(segments):
                seq_num = s.get("sequence_num", i + 1)
                lat1 = float(s.get("latitude_dec", 0.0))
                lon1 = float(s.get("longitude_dec", 0.0))
                next_lat = s.get("next_lat_dec")
                next_lon = s.get("next_lon_dec")
                seg_wkt = f"LINESTRING({lon1} {lat1}, {next_lon} {next_lat})" if (next_lat and next_lon) else None

                seg_records.append({
                    "route_id": route_id,
                    "sequence_num": seq_num,
                    "point_name": s.get("point_name", f"PT_{seq_num}"),
                    "point_type": s.get("point_type", "ENTRY" if seq_num == 1 else "WAYPOINT"),
                    "latitude_dec": lat1,
                    "longitude_dec": lon1,
                    "min_alt_ft": int(s.get("min_alt_ft", route_record["floor_alt_ft"])),
                    "max_alt_ft": int(s.get("max_alt_ft", route_record["ceiling_alt_ft"])),
                    "width_left_nm": float(s.get("width_left_nm", route_record["route_width_nm"] / 2.0)),
                    "width_right_nm": float(s.get("width_right_nm", route_record["route_width_nm"] / 2.0)),
                    "next_point_name": s.get("next_point_name"),
                    "segment_distance_nm": float(s.get("segment_distance_nm")) if s.get("segment_distance_nm") else None,
                    "geometry_wkt": seg_wkt
                })
            self._request("mtr_segments", method="POST", payload=seg_records, headers_extra=headers)

        return self.get_route_details(route_id) or {}
