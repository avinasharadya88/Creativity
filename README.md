# eNASR Aeronautical Geospatial Database & Application Toolkit

[![AIRAC Cycle](https://img.shields.io/badge/AIRAC_Cycle-2609-blue.svg)](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/2026-09-03)
[![Data Standard](https://img.shields.io/badge/Data_Standard-AIXM_5.1_%2F_ARINC_424-green.svg)](https://aixm.aero/)
[![Database](https://img.shields.io/badge/Database-SQLite_Spatial-orange.svg)](https://www.sqlite.org/)
[![Audit Status](https://img.shields.io/badge/Data_Audit-100%25_PASSED-brightgreen.svg)](./enasr-data-test-report.md)

A high-performance, fully relational geospatial database system built on the Federal Aviation Administration (FAA) **National Airspace System Resources (eNASR)** and **Aeronautical Information Services (AIS)** specifications. 

This repository provides a complete database schema, automated multi-agent test suite, Python API client, spatial data reference guide, Military Training Routes (MTR) storage specifications, and a publication-quality 4-panel aeronautical visualization dashboard.

---

## 📌 Project Overview & Features

- **Unambiguous Relational Model**: Enforces strict primary keys, foreign key constraints (`PRAGMA foreign_keys = ON;`), and junction tables across 13 domain tables to eliminate entity ambiguity.
- **2D Spatial Geometries**: Integrates Well-Known Text (`WKT`) and `GeoJSON` columns (`POINT`, `LINESTRING`, `POLYGON`) for fast spatial lookups and seamless integration with WebGIS frameworks (Leaflet, Mapbox, QGIS, PostGIS).
- **Enroute, Terminal & Military Airspace Routing**: Resolves airway leg sequences (`J70`, `V16`), terminal instrument procedures (SIDs/STARs like `CAMRN4.KJFK`), and Military Training Routes (`IR-102`, `VR-223`, `SR-301`) with floor/ceiling altitude and corridor width constraints.
- **Multi-Agent Quality Assurance**: Audited by two automated testing agents (`DataIntegrityAgent` and `RelationalSpatialAgent`) achieving 100% compliance across data integrity, coordinate bounds, radio frequency bands, foreign keys, and topological continuity.

---

## 🗄️ Relational Architecture & Entity Mapping

The database structure models complex relationships across National Airspace System (NAS) entities without ambiguity:

```
                     ┌────────────────────────────────┐
                     │         AIRPORTS (APT)         │
                     │  PK: arpt_id / icao_id         │
                     └───────────────┬────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │ (1:N)                     │ (1:N)                     │ (1:N)
         ▼                           ▼                           ▼
┌─────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  RUNWAYS (RWY)  │        │ FREQUENCIES(COM) │        │ PROCEDURES (DP)  │
│  FK: arpt_id    │        │  FK: arpt_id     │        │  FK: arpt_id     │
└─────────────────┘        └──────────────────┘        └─────────┬────────┘
                                                                 │ (1:N)
                                                                 ▼
┌─────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│   NAVAIDS (NAV) │        │   FIXES (FIX)    │◄───────┤  PROCEDURE LEGS  │
│  PK: nav_id     │        │  PK: fix_id      │        │  FK: proc_id,fix │
└────────┬────────┘        └────────┬─────────┘        └──────────────────┘
         │                          │
         └────────────┬─────────────┘
                      │ (N:M Sequence Junction)
                      ▼
          ┌───────────────────────┐                    ┌──────────────────┐
          │    AIRWAY SEGMENTS    │                    │  MTR ROUTES      │
          │ FK: airway_id         │                    │  PK: route_id    │
          │ FK: from_node,to_node │                    └─────────┬────────┘
          └───────────────────────┘                              │ (1:N)
                                                                 ▼
                                                       ┌──────────────────┐
                                                       │   MTR SEGMENTS   │
                                                       │  FK: route_id    │
                                                       └──────────────────┘
```

### Table Definitions

| Table | Entity Description | Primary Key | Key Foreign Keys & Spatial Columns |
| :--- | :--- | :--- | :--- |
| `airports` | Master airport facility records | `arpt_id` | `geometry_wkt` (POINT), `geometry_geojson` |
| `runways` | Physical runway thresholds & dimensions | (`arpt_id`, `rwy_identifier`) | `arpt_id` → `airports`, `geometry_wkt` (LINESTRING) |
| `navaids` | Radio navigation aids (VOR, VORTAC, DME) | `nav_id` | `associated_arpt_id` → `airports`, `geometry_wkt` (POINT) |
| `fixes` | Reporting points and RNAV waypoints | `fix_id` | `geometry_wkt` (POINT) |
| `airways` | Enroute airway route identifiers | `airway_id` | Metadata (`JET_ROUTE`, `VICTOR_ROUTE`, `Q_ROUTE`) |
| `airway_segments` | Sequential legs connecting nav nodes | `segment_id` | `airway_id` → `airways`, `from_node_id`, `to_node_id` |
| `airspace` | Controlled airspace boundary polygons | `airspace_id` | `geometry_wkt` (POLYGON), `geometry_geojson` |
| `frequencies` | Tower, Ground, and ATIS frequencies | `freq_id` | `arpt_id` → `airports` |
| `procedures` | Terminal procedures (SIDs / STARs) | `procedure_id` | `arpt_id` → `airports` |
| `procedure_legs` | Ordered waypoints for terminal transitions | `leg_id` | `procedure_id` → `procedures`, `fix_id` → `fixes` |
| `weather_stations`| Surface weather reporting (ASOS/AWOS) | `station_id` | `arpt_id` → `airports`, `geometry_wkt` (POINT) |
| `mtr_routes` | Military Training Route Master Headers | `route_id` | `route_type` (`IR`, `VR`, `SR`), `geometry_wkt` |
| `mtr_segments` | MTR Corridor Waypoints & Sequence | `segment_id` | `route_id` → `mtr_routes`, `geometry_wkt` (LINESTRING) |

---

## 🎖️ Military Training Routes (MTR) Specification

The database stores low-altitude Military Training Routes adhering to FAA eNASR CSV/TXT standards:
- **IFR Military Training Routes (`IR`)**: Conducted under IFR above 1,500 ft AGL.
- **VFR Military Training Routes (`VR`)**: Conducted under VFR below 1,500 ft AGL.
- **Slow Speed Low Altitude Routes (`SR`)**: Low altitude military flight training corridors.

Each route defines:
- **Originating Agency / ARTCC**: Military base owner and controlling air traffic center.
- **Altitude Corridors**: Segment floor and ceiling MSL/AGL boundaries.
- **Lateral Corridor Widths**: Left and right buffer distances from route centerline in nautical miles.
- **Sequence Junctions**: Waypoint entry, turn point, and exit coordinates.

---

## 🧪 Automated Data Quality & Multi-Agent Audit

Prior to application deployment, `enasr-geospatial.db` underwent automated testing by two specialized agents:

1. **`DataIntegrityAgent`**: Verified non-null constraints, coordinate WGS84 geographic limits (`[-90, +90]` / `[-180, +180]`), radio frequency VHF allocations (`108.0 - 137.0 MHz`), and location identifier syntax.
2. **`RelationalSpatialAgent`**: Checked native SQLite foreign keys (`PRAGMA foreign_key_check`), scanned for parentless child records, validated WKT geometry syntax, and confirmed contiguous airway and MTR leg sequencing.

### Audit Summary

| Test Category | Test Suites | Results |
| :--- | :---: | :---: |
| **Mandatory Field Constraints** | 50+ Columns Audited | 🟢 0 Unexpected NULLs |
| **Geographic Coordinates** | 37+ Coordinate Pairs | 🟢 100% Within Bounds |
| **Radio Frequencies** | 6 VHF Frequencies | 🟢 100% Valid Aeronautical Band |
| **Foreign Key Integrity** | Native Engine Audit | 🟢 0 Foreign Key Violations |
| **Orphaned Record Scan** | Child Domain Tables | 🟢 0 Parentless Records |
| **Spatial Geometries** | WKT Geometries | 🟢 100% Syntactically Valid |
| **Network Continuity** | Enroute Airways & MTRs | 🟢 0 Leg Sequence Gaps |

*For complete test logs and metrics, see [enasr-data-test-report.md](./enasr-data-test-report.md).*

---

## 🚀 Quick Start & Python API Usage

### Prerequisites

Ensure you have Python 3.8+ installed along with SQLite:

```bash
pip install shapely geopandas matplotlib
```

### 1. Execute Client API Demonstration

Run `enasr-db-api.py` to test airport profile lookups, spatial radius queries, airway leg resolution, and Military Training Route extraction:

```bash
python enasr-db-api.py
```

### 2. Code Example: Querying Military Training Routes

```python
import sqlite3

conn = sqlite3.connect("enasr-geospatial.db")
conn.execute("PRAGMA foreign_keys = ON;")
cursor = conn.cursor()

# Query MTR Route Profile and Waypoint Sequence
cursor.execute("SELECT r.route_id, r.route_type, r.route_name, r.originating_agency, r.floor_alt_ft, r.ceiling_alt_ft FROM mtr_routes r WHERE r.route_id = 'IR-102'")

route = cursor.fetchone()
print(f"MTR Route: {route[0]} ({route[1]}) - {route[2]}")
print(f"  Managing Unit: {route[3]} | Floor: {route[4]} ft | Ceiling: {route[5]} ft")

cursor.execute("SELECT sequence_num, point_name, point_type, segment_distance_nm, min_alt_ft, max_alt_ft FROM mtr_segments WHERE route_id = 'IR-102' ORDER BY sequence_num")

for seg in cursor.fetchall():
    print(f"  Leg {seg[0]}: {seg[1]} ({seg[2]}) | Distance: {seg[3]} NM | Alt: {seg[4]}-{seg[5]} ft")
```

---

## 📊 Visual Dashboard & Interactive Reference

The repository includes visual and tabular reference artifacts:

- **`enasr-airspace-dashboard.png`**: A 4-panel aeronautical chart graphic featuring National Airspace System Hubs, KJFK STAR waypoints, vertical profile, and database entity volumes.
- **`enasr-airspace-browser-guide.md`**: Detailed spatial data tables covering hubs, runway thresholds, VOR/VORTAC frequencies, and leg sequences.

---

## 📜 Source Grounding & Standards

Data structure and content are grounded in official aeronautical data releases:
- **FAA 28-Day NASR Subscription**: AIRAC Cycle 2609 (Effective September 03, 2026).
- **FAA Coded Instrument Flight Procedures (CIFP)**: ARINC 424 Version 18.
- **EUROCONTROL EAD & AIXM Community**: Aeronautical Information Exchange Model (AIXM 5.1).

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.