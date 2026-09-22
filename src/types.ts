export interface MTRSegment {
  segment_id?: number;
  route_id?: string;
  sequence_num: number;
  point_name: string;
  point_type: string;
  latitude_dec: number;
  longitude_dec: number;
  min_alt_ft?: number;
  max_alt_ft?: number;
  width_left_nm?: number;
  width_right_nm?: number;
  next_point_name?: string | null;
  next_lat_dec?: number | null;
  next_lon_dec?: number | null;
  segment_distance_nm?: number | null;
  cumulative_distance_nm?: number;
  bearing_deg?: number;
  arinc_lat?: string;
  arinc_lon?: string;
  human_lat?: string;
  human_lon?: string;
  geometry_wkt?: string | null;
}

export interface MTRRoute {
  route_id: string;
  route_type: string;
  route_name: string;
  originating_agency: string;
  artcc_facility: string;
  operating_hours?: string;
  floor_alt_ft: number;
  ceiling_alt_ft: number;
  route_width_nm: number;
  status?: string;
  waypoint_count?: number;
  total_distance_nm?: number;
  geometry_wkt?: string | null;
  geometry_geojson?: any;
  segments: MTRSegment[];
  corridor_polygon?: number[][];
}

export interface MTRRouteSummary {
  route_id: string;
  route_type: string;
  route_name: string;
  originating_agency: string;
  artcc_facility: string;
  floor_alt_ft: number;
  ceiling_alt_ft: number;
  route_width_nm: number;
  status: string;
  waypoint_count: number;
}
