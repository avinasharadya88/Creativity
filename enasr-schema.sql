-- =====================================================================
-- FAA eNASR Geospatial Relational Database Schema (AIRAC Cycle 2609)
-- Designed for Application Creation, Flight Planning, GIS & ATC Systems
-- Including Military Training Routes (MTR - IR, VR, SR) Specification
-- =====================================================================

PRAGMA foreign_keys = ON;

-- 1. AIRPORTS & LANDING FACILITIES (APT)
CREATE TABLE IF NOT EXISTS airports (
    arpt_id TEXT PRIMARY KEY,               -- Unique Identifier (e.g., 'KJFK', 'KLAX', '04A')
    icao_id TEXT UNIQUE,                    -- 4-letter ICAO code
    facility_name TEXT NOT NULL,            -- Name of the airport/facility
    facility_type TEXT NOT NULL,            -- 'AIRPORT', 'HELIPORT', 'SEAPLANE_BASE'
    city TEXT NOT NULL,                     -- Associated city
    state_code TEXT NOT NULL,               -- US State code (e.g., 'NY', 'CA')
    country_code TEXT DEFAULT 'USA',        -- Country code
    latitude_dec REAL NOT NULL,             -- Decimal Latitude (WGS84)
    longitude_dec REAL NOT NULL,            -- Decimal Longitude (WGS84)
    elevation_ft REAL,                      -- Airport elevation above MSL in feet
    control_tower_flag INTEGER DEFAULT 0,   -- 1 = Has ATCT, 0 = Non-towered
    status TEXT DEFAULT 'OPEN',             -- 'OPEN', 'CLOSED', 'PRIVATE'
    geometry_wkt TEXT,                      -- WKT representation: POINT(lon lat)
    geometry_geojson TEXT                   -- GeoJSON Geometry object
);

-- 2. RUNWAYS (RWY)
CREATE TABLE IF NOT EXISTS runways (
    arpt_id TEXT NOT NULL,                  -- Foreign Key to Airports
    rwy_identifier TEXT NOT NULL,           -- e.g., '13L/31R', '04/22'
    rwy_length_ft INTEGER NOT NULL,         -- Length in feet
    rwy_width_ft INTEGER NOT NULL,          -- Width in feet
    surface_type TEXT,                      -- 'ASPHALT', 'CONCRETE', 'TURF'
    base_end_id TEXT NOT NULL,              -- e.g., '13L'
    recip_end_id TEXT NOT NULL,             -- e.g., '31R'
    base_lat_dec REAL,                      -- Base threshold latitude
    base_lon_dec REAL,                      -- Base threshold longitude
    recip_lat_dec REAL,                     -- Reciprocal threshold latitude
    recip_lon_dec REAL,                     -- Reciprocal threshold longitude
    geometry_wkt TEXT,                      -- WKT LINESTRING(base_lon base_lat, recip_lon recip_lat)
    PRIMARY KEY (arpt_id, rwy_identifier),
    FOREIGN KEY (arpt_id) REFERENCES airports(arpt_id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. NAVIGATION AIDS (NAV)
CREATE TABLE IF NOT EXISTS navaids (
    nav_id TEXT NOT NULL,                   -- Identification Code (e.g., 'JFK', 'LAX')
    nav_type TEXT NOT NULL,                 -- 'VOR/DME', 'VORTAC', 'NDB', 'TACAN'
    nav_name TEXT NOT NULL,                 -- Facility Name
    city TEXT,                              -- Associated City
    state_code TEXT,                        -- State Code
    frequency_mhz REAL,                     -- Frequency in MHz (or kHz for NDB)
    channel TEXT,                           -- TACAN channel (e.g., '112X')
    latitude_dec REAL NOT NULL,             -- Decimal Latitude
    longitude_dec REAL NOT NULL,            -- Decimal Longitude
    elevation_ft REAL,                      -- Antenna elevation in feet
    associated_arpt_id TEXT,               -- Optional FK to nearby airport
    geometry_wkt TEXT,                      -- WKT POINT(lon lat)
    PRIMARY KEY (nav_id, nav_type),
    FOREIGN KEY (associated_arpt_id) REFERENCES airports(arpt_id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 4. WAYPOINTS & REPORTING POINTS (FIX)
CREATE TABLE IF NOT EXISTS fixes (
    fix_id TEXT PRIMARY KEY,                -- 5-letter Identifier (e.g., 'CAMRN', 'DEER PARK')
    fix_name TEXT NOT NULL,                 -- Full Fix Name
    fix_type TEXT NOT NULL,                 -- 'WAYPOINT', 'REPORTING_POINT', 'RNAV_FIX'
    state_code TEXT,                        -- State or Region Code
    country_code TEXT DEFAULT 'USA',        -- Country
    latitude_dec REAL NOT NULL,             -- Decimal Latitude
    longitude_dec REAL NOT NULL,            -- Decimal Longitude
    icao_region TEXT,                       -- ICAO Region Code (e.g., 'K2')
    geometry_wkt TEXT                       -- WKT POINT(lon lat)
);

-- 5. AIRWAYS / ROUTE NETWORK (AWY)
CREATE TABLE IF NOT EXISTS airways (
    airway_id TEXT PRIMARY KEY,             -- Airway Identifier (e.g., 'J70', 'V16', 'Q102')
    airway_type TEXT NOT NULL,              -- 'JET_ROUTE', 'VICTOR_ROUTE', 'Q_ROUTE', 'T_ROUTE'
    direction TEXT DEFAULT 'BOTH'           -- 'BOTH', 'NORTHBOUND', 'SOUTHBOUND', etc.
);

-- 6. AIRWAY SEGMENTS (Junction table linking Waypoints/Navaids in sequence)
CREATE TABLE IF NOT EXISTS airway_segments (
    segment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    airway_id TEXT NOT NULL,                -- Foreign Key to Airways
    sequence_num INTEGER NOT NULL,          -- Sequence order along airway (1, 2, 3...)
    from_node_id TEXT NOT NULL,             -- Fix or Navaid ID
    from_node_type TEXT NOT NULL,           -- 'FIX' or 'NAV'
    from_lat_dec REAL NOT NULL,
    from_lon_dec REAL NOT NULL,
    to_node_id TEXT NOT NULL,               -- Next Fix or Navaid ID
    to_node_type TEXT NOT NULL,             -- 'FIX' or 'NAV'
    to_lat_dec REAL NOT NULL,
    to_lon_dec REAL NOT NULL,
    min_enroute_alt_ft INTEGER,             -- MEA (Minimum Enroute Altitude)
    max_auth_alt_ft INTEGER,                -- MAA (Maximum Authorized Altitude)
    segment_distance_nm REAL,               -- Distance in Nautical Miles
    geometry_wkt TEXT,                      -- WKT LINESTRING(from_lon from_lat, to_lon to_lat)
    FOREIGN KEY (airway_id) REFERENCES airways(airway_id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE(airway_id, sequence_num)
);

-- 7. CONTROLLED AIRSPACE & SPECIAL ACTIVITY AIRSPACE (CLS_ARSP / SAA)
CREATE TABLE IF NOT EXISTS airspace (
    airspace_id TEXT PRIMARY KEY,          -- Identifier (e.g., 'CLASS_B_KJFK', 'R-2508')
    airspace_name TEXT NOT NULL,            -- Name of Airspace
    airspace_class TEXT NOT NULL,           -- 'CLASS_B', 'CLASS_C', 'CLASS_D', 'CLASS_E', 'RESTRICTED', 'MOA'
    lower_alt_ft INTEGER,                   -- Floor altitude in feet (0 = Surface)
    upper_alt_ft INTEGER,                   -- Ceiling altitude in feet MSL
    controlling_agency TEXT,               -- Controlling ATC Facility (e.g., 'NEW YORK APPROACH')
    geometry_wkt TEXT,                      -- WKT POLYGON or MULTIPOLYGON
    geometry_geojson TEXT                   -- GeoJSON representation
);

-- 8. ATC & AIRPORT COMMUNICATION FREQUENCIES (COM / TWR)
CREATE TABLE IF NOT EXISTS frequencies (
    freq_id INTEGER PRIMARY KEY AUTOINCREMENT,
    arpt_id TEXT NOT NULL,                  -- Foreign Key to Airports
    facility_type TEXT NOT NULL,            -- 'TOWER', 'GROUND', 'APPROACH', 'DEPARTURE', 'ATIS', 'CLEARANCE'
    frequency_mhz REAL NOT NULL,            -- VHF Frequency in MHz
    sector_description TEXT,                -- Sector coverage or notes
    FOREIGN KEY (arpt_id) REFERENCES airports(arpt_id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 9. INSTRUMENT PROCEDURES (DP / STAR / IAP)
CREATE TABLE IF NOT EXISTS procedures (
    procedure_id TEXT PRIMARY KEY,          -- Unique ID (e.g., 'KJFK_CAMRN4_STAR')
    arpt_id TEXT NOT NULL,                  -- Foreign Key to Airports
    procedure_name TEXT NOT NULL,           -- Procedure Name (e.g., 'CAMRN FOUR ARRIVAL')
    procedure_type TEXT NOT NULL,           -- 'SID', 'STAR', 'APPROACH'
    computer_code TEXT,                     -- FAA / ARINC computer code
    FOREIGN KEY (arpt_id) REFERENCES airports(arpt_id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 10. PROCEDURE LEGS / WAYPOINT SEQUENCES
CREATE TABLE IF NOT EXISTS procedure_legs (
    leg_id INTEGER PRIMARY KEY AUTOINCREMENT,
    procedure_id TEXT NOT NULL,             -- Foreign Key to Procedures
    leg_sequence INTEGER NOT NULL,          -- Sequence number (1, 2, 3...)
    fix_id TEXT NOT NULL,                   -- Foreign Key to Fixes
    leg_type TEXT DEFAULT 'TF',             -- ARINC 424 Leg type ('IF', 'TF', 'CF', 'DF')
    altitude_constraint_ft INTEGER,         -- Altitude requirement in feet MSL
    speed_limit_kts INTEGER,                -- Speed constraint in knots
    FOREIGN KEY (procedure_id) REFERENCES procedures(procedure_id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (fix_id) REFERENCES fixes(fix_id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE(procedure_id, leg_sequence)
);

-- 11. WEATHER REPORTING STATIONS (AWOS / ASOS / WXL)
CREATE TABLE IF NOT EXISTS weather_stations (
    station_id TEXT PRIMARY KEY,            -- Identifier (e.g., 'KJFK', 'KLAX')
    arpt_id TEXT,                           -- Optional Foreign Key to Airport
    station_type TEXT NOT NULL,             -- 'ASOS', 'AWOS-3', 'AWOS-3PT'
    frequency_mhz REAL,                     -- VHF Broadcast frequency
    phone_number TEXT,                      -- Dial-in audio number
    latitude_dec REAL NOT NULL,
    longitude_dec REAL NOT NULL,
    geometry_wkt TEXT,
    FOREIGN KEY (arpt_id) REFERENCES airports(arpt_id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 12. MILITARY TRAINING ROUTES - MASTER HEADER (MTR)
CREATE TABLE IF NOT EXISTS mtr_routes (
    route_id TEXT PRIMARY KEY,               -- Route ID (e.g., 'IR-102', 'VR-223', 'SR-301')
    route_type TEXT NOT NULL,               -- 'IR' (IFR), 'VR' (VFR), 'SR' (Slow Speed)
    route_name TEXT NOT NULL,               -- Full MTR Name / Description
    originating_agency TEXT NOT NULL,       -- Managing Military Unit / Air Base
    artcc_facility TEXT NOT NULL,           -- Controlling ARTCC Center
    operating_hours TEXT DEFAULT 'CONTINUOUS', -- Operating hours / Schedule
    floor_alt_ft INTEGER NOT NULL,          -- Floor altitude MSL/AGL
    ceiling_alt_ft INTEGER NOT NULL,        -- Ceiling altitude MSL
    route_width_nm REAL DEFAULT 10.0,       -- Total corridor width in nautical miles
    status TEXT DEFAULT 'ACTIVE',           -- Status flag ('ACTIVE', 'INACTIVE')
    geometry_wkt TEXT,                      -- WKT LINESTRING of route centerline
    geometry_geojson TEXT                   -- GeoJSON LineString
);

-- 13. MILITARY TRAINING ROUTES - WAYPOINT & SEGMENT SEQUENCES
CREATE TABLE IF NOT EXISTS mtr_segments (
    segment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id TEXT NOT NULL,                 -- Foreign Key to mtr_routes
    sequence_num INTEGER NOT NULL,          -- Order along MTR (1, 2, 3...)
    point_name TEXT NOT NULL,               -- Point Name (e.g., 'PT_A_ENTRY', 'PT_B_TURN')
    point_type TEXT NOT NULL,               -- Point Type ('ENTRY', 'WAYPOINT', 'TURN_POINT', 'EXIT')
    latitude_dec REAL NOT NULL,             -- Decimal Latitude
    longitude_dec REAL NOT NULL,            -- Decimal Longitude
    min_alt_ft INTEGER,                     -- Segment floor altitude
    max_alt_ft INTEGER,                     -- Segment ceiling altitude
    width_left_nm REAL DEFAULT 5.0,         -- Corridor width left from centerline (NM)
    width_right_nm REAL DEFAULT 5.0,        -- Corridor width right from centerline (NM)
    next_point_name TEXT,                   -- Next waypoint name
    next_lat_dec REAL,                      -- Next point latitude
    next_lon_dec REAL,                      -- Next point longitude
    segment_distance_nm REAL,               -- Leg distance in NM
    geometry_wkt TEXT,                      -- WKT LINESTRING(from, to)
    FOREIGN KEY (route_id) REFERENCES mtr_routes(route_id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE(route_id, sequence_num)
);

-- =====================================================================
-- PERFORMANCE INDEXES & SPATIAL LOOKUP INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_airports_spatial ON airports(latitude_dec, longitude_dec);
CREATE INDEX IF NOT EXISTS idx_airports_state ON airports(state_code);
CREATE INDEX IF NOT EXISTS idx_runways_arpt ON runways(arpt_id);
CREATE INDEX IF NOT EXISTS idx_navaids_spatial ON navaids(latitude_dec, longitude_dec);
CREATE INDEX IF NOT EXISTS idx_fixes_spatial ON fixes(latitude_dec, longitude_dec);
CREATE INDEX IF NOT EXISTS idx_airway_segments_airway ON airway_segments(airway_id, sequence_num);
CREATE INDEX IF NOT EXISTS idx_airway_segments_from ON airway_segments(from_node_id);
CREATE INDEX IF NOT EXISTS idx_airway_segments_to ON airway_segments(to_node_id);
CREATE INDEX IF NOT EXISTS idx_airspace_class ON airspace(airspace_class);
CREATE INDEX IF NOT EXISTS idx_frequencies_arpt ON frequencies(arpt_id);
CREATE INDEX IF NOT EXISTS idx_procedures_arpt ON procedures(arpt_id);
CREATE INDEX IF NOT EXISTS idx_procedure_legs_proc ON procedure_legs(procedure_id, leg_sequence);
CREATE INDEX IF NOT EXISTS idx_mtr_routes_agency ON mtr_routes(originating_agency);
CREATE INDEX IF NOT EXISTS idx_mtr_segments_route ON mtr_segments(route_id, sequence_num);

-- =====================================================================
-- APPLICATION DEVELOPER VIEWS
-- =====================================================================

-- View 1: Complete Airport Master Profile
CREATE VIEW IF NOT EXISTS v_airport_facilities AS
SELECT 
    a.arpt_id,
    a.icao_id,
    a.facility_name,
    a.city,
    a.state_code,
    a.latitude_dec,
    a.longitude_dec,
    a.elevation_ft,
    a.control_tower_flag,
    COUNT(DISTINCT r.rwy_identifier) AS num_runways,
    MAX(r.rwy_length_ft) AS longest_runway_ft,
    w.station_type AS weather_type,
    w.frequency_mhz AS weather_freq_mhz
FROM airports a
LEFT JOIN runways r ON a.arpt_id = r.arpt_id
LEFT JOIN weather_stations w ON a.arpt_id = w.arpt_id
GROUP BY a.arpt_id;

-- View 2: Complete Enroute Airway Route Resolver
CREATE VIEW IF NOT EXISTS v_airway_routes AS
SELECT 
    aw.airway_id,
    aw.airway_type,
    seg.sequence_num,
    seg.from_node_id,
    seg.from_node_type,
    seg.from_lat_dec,
    seg.from_lon_dec,
    seg.to_node_id,
    seg.to_node_type,
    seg.to_lat_dec,
    seg.to_lon_dec,
    seg.min_enroute_alt_ft,
    seg.segment_distance_nm,
    seg.geometry_wkt
FROM airways aw
JOIN airway_segments seg ON aw.airway_id = seg.airway_id
ORDER BY aw.airway_id, seg.sequence_num;

-- View 3: Combined Navigation Node Spatial Directory (Airports + Navaids + Fixes)
CREATE VIEW IF NOT EXISTS v_spatial_navigation_nodes AS
SELECT arpt_id AS node_id, 'AIRPORT' AS node_category, facility_name AS node_name, latitude_dec, longitude_dec, geometry_wkt FROM airports
UNION ALL
SELECT nav_id AS node_id, 'NAVAID' AS node_category, nav_name AS node_name, latitude_dec, longitude_dec, geometry_wkt FROM navaids
UNION ALL
SELECT fix_id AS node_id, 'WAYPOINT' AS node_category, fix_name AS node_name, latitude_dec, longitude_dec, geometry_wkt FROM fixes;

-- View 4: Terminal Procedure Sequences with Waypoint Geometries
CREATE VIEW IF NOT EXISTS v_terminal_procedures AS
SELECT 
    p.arpt_id,
    p.procedure_id,
    p.procedure_name,
    p.procedure_type,
    pl.leg_sequence,
    pl.fix_id,
    f.latitude_dec AS fix_lat,
    f.longitude_dec AS fix_lon,
    pl.leg_type,
    pl.altitude_constraint_ft,
    pl.speed_limit_kts
FROM procedures p
JOIN procedure_legs pl ON p.procedure_id = pl.procedure_id
JOIN fixes f ON pl.fix_id = f.fix_id
ORDER BY p.procedure_id, pl.leg_sequence;

-- View 5: Military Training Route (MTR) Corridor & Segment Sequence Resolver
CREATE VIEW IF NOT EXISTS v_mtr_routes AS
SELECT 
    r.route_id,
    r.route_type,
    r.route_name,
    r.originating_agency,
    r.artcc_facility,
    r.operating_hours,
    r.floor_alt_ft,
    r.ceiling_alt_ft,
    r.route_width_nm,
    s.sequence_num,
    s.point_name,
    s.point_type,
    s.latitude_dec,
    s.longitude_dec,
    s.min_alt_ft AS segment_min_alt,
    s.max_alt_ft AS segment_max_alt,
    s.next_point_name,
    s.segment_distance_nm,
    s.geometry_wkt AS segment_wkt
FROM mtr_routes r
JOIN mtr_segments s ON r.route_id = s.route_id
ORDER BY r.route_id, s.sequence_num;