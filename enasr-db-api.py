"""
FAA eNASR Geospatial Database Client API
AIRAC Cycle 2609 Application Integration Module
Including Military Training Routes (MTR) Access Functions
"""

import sqlite3
import math
import json

class ENASRGeospatialDB:
    def __init__(self, db_path="enasr_geospatial.db"):
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path)
        self.conn.execute("PRAGMA foreign_keys = ON;")
        self.conn.row_factory = sqlite3.Row

    def close(self):
        self.conn.close()

    def get_airport_profile(self, arpt_id):
        """Fetch complete airport profile including runways, frequencies, and weather."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM airports WHERE arpt_id = ? OR icao_id = ?", (arpt_id, arpt_id))
        arpt = cursor.fetchone()
        if not arpt:
            return None
        
        arpt_dict = dict(arpt)
        
        # Runways
        cursor.execute("SELECT * FROM runways WHERE arpt_id = ?", (arpt_dict['arpt_id'],))
        arpt_dict['runways'] = [dict(r) for r in cursor.fetchall()]
        
        # Frequencies
        cursor.execute("SELECT * FROM frequencies WHERE arpt_id = ?", (arpt_dict['arpt_id'],))
        arpt_dict['frequencies'] = [dict(f) for f in cursor.fetchall()]
        
        # Weather
        cursor.execute("SELECT * FROM weather_stations WHERE arpt_id = ?", (arpt_dict['arpt_id'],))
        arpt_dict['weather'] = [dict(w) for w in cursor.fetchall()]
        
        return arpt_dict

    def find_nearest_nodes(self, lat, lon, limit=5):
        """Perform spatial Haversine distance lookup for nearest Airports, Navaids, and Fixes."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT node_id, node_category, node_name, latitude_dec, longitude_dec FROM v_spatial_navigation_nodes")
        nodes = cursor.fetchall()
        
        results = []
        for n in nodes:
            # Haversine distance in Nautical Miles
            dlat = math.radians(n['latitude_dec'] - lat)
            dlon = math.radians(n['longitude_dec'] - lon)
            a = math.sin(dlat/2)**2 + math.cos(math.radians(lat)) * math.cos(math.radians(n['latitude_dec'])) * math.sin(dlon/2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
            dist_nm = 3440.065 * c  # Earth radius in NM
            
            results.append({
                'node_id': n['node_id'],
                'category': n['node_category'],
                'name': n['node_name'],
                'latitude': n['latitude_dec'],
                'longitude': n['longitude_dec'],
                'distance_nm': round(dist_nm, 2)
            })
            
        results.sort(key=lambda x: x['distance_nm'])
        return results[:limit]

    def resolve_airway_route(self, airway_id):
        """Reconstruct full ordered waypoints along an enroute airway."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM v_airway_routes WHERE airway_id = ? ORDER BY sequence_num", (airway_id,))
        segments = cursor.fetchall()
        return [dict(s) for s in segments]

    def get_terminal_procedure(self, arpt_id, procedure_type='STAR'):
        """Retrieve instrument arrival (STAR) or departure (SID) waypoint sequence."""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM v_terminal_procedures 
            WHERE arpt_id = ? AND procedure_type = ? 
            ORDER BY procedure_id, leg_sequence
        """, (arpt_id, procedure_type))
        return [dict(row) for row in cursor.fetchall()]

    def list_military_training_routes(self, route_type=None):
        """List all registered Military Training Routes (IR, VR, SR)."""
        cursor = self.conn.cursor()
        if route_type:
            cursor.execute("SELECT * FROM mtr_routes WHERE route_type = ? ORDER BY route_id", (route_type,))
        else:
            cursor.execute("SELECT * FROM mtr_routes ORDER BY route_id")
        return [dict(r) for r in cursor.fetchall()]

    def get_military_training_route(self, route_id):
        """Fetch complete Military Training Route details and segment sequences."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM mtr_routes WHERE route_id = ?", (route_id,))
        header = cursor.fetchone()
        if not header:
            return None
        
        mtr_dict = dict(header)
        cursor.execute("SELECT * FROM mtr_segments WHERE route_id = ? ORDER BY sequence_num", (route_id,))
        mtr_dict['segments'] = [dict(s) for s in cursor.fetchall()]
        return mtr_dict

# -------------------------------------------------------------
# Demo / Verification Execution
# -------------------------------------------------------------
if __name__ == "__main__":
    db = ENASRGeospatialDB("/workspace/artifacts/enasr-geospatial.db")
    print("\n--- 1. Airport Profile Lookup (KJFK) ---")
    jfk = db.get_airport_profile("KJFK")
    print(f"Airport: {jfk['facility_name']} ({jfk['icao_id']}) - Elevation: {jfk['elevation_ft']} ft")
    print(f"Runways ({len(jfk['runways'])}): {[r['rwy_identifier'] for r in jfk['runways']]}")
    print(f"Frequencies ({len(jfk['frequencies'])}): {[(f['facility_type'], f['frequency_mhz']) for f in jfk['frequencies']]}")

    print("\n--- 2. Spatial Nearest Navigation Nodes to Lat: 40.50, Lon: -73.60 ---")
    nearest = db.find_nearest_nodes(40.50, -73.60, limit=4)
    for n in nearest:
        print(f"  Node: {n['node_id']} ({n['category']}) - {n['name']} | Dist: {n['distance_nm']} NM")

    print("\n--- 3. Airway Route Sequence Resolution (J70) ---")
    j70_route = db.resolve_airway_route("J70")
    for seg in j70_route:
        print(f"  Seq {seg['sequence_num']}: {seg['from_node_id']} ({seg['from_node_type']}) -> {seg['to_node_id']} ({seg['to_node_type']}) | Dist: {seg['segment_distance_nm']} NM, MEA: {seg['min_enroute_alt_ft']} ft")

    print("\n--- 4. Military Training Routes Lookup (IR-102) ---")
    mtr = db.get_military_training_route("IR-102")
    print(f"MTR: {mtr['route_id']} ({mtr['route_type']}) - {mtr['route_name']}")
    print(f"  Agency: {mtr['originating_agency']} | ARTCC: {mtr['artcc_facility']}")
    print(f"  Altitudes: Floor {mtr['floor_alt_ft']} ft MSL / Ceiling {mtr['ceiling_alt_ft']} ft MSL | Width: {mtr['route_width_nm']} NM")
    for seg in mtr['segments']:
        print(f"  Segment {seg['sequence_num']}: {seg['point_name']} ({seg['point_type']}) -> Next: {seg['next_point_name']} | Distance: {seg['segment_distance_nm']} NM")

    db.close()
    print("\nAPI Integration module successfully verified!")