# PRD: MTR App — FAA eNASR Military Training Route Converter & Dashboard

**Version:** 1.0  
**Date:** 2026-09-23  
**Author:** Avinash Aradya  
**Repo:** https://github.com/avinasharadya88/Creativity  
**Live App:** https://mtrapp.ai.studio  

---

## 1. Overview

MTR App is a full-stack aviation web application that pulls FAA eNASR (Electronic National Airspace System Resource) data for Military Training Routes (MTRs) and makes it useful — both to humans and machines. It converts raw FAA route data into ARINC 424-23 compliant XML, renders interactive maps and altitude profiles, and lets users view, edit, and export route information without needing to touch raw data files.

The app targets aviation professionals, air traffic controllers, flight briefers, and defense sector developers who currently have to navigate sprawling FAA data sources to find MTR information.

---

## 2. Problem Statement

FAA MTR data lives in eNASR releases as flat CSV files (`MTR_BASE.csv`, `MTR_PTS.csv`) on a 28-day AIRAC cycle. Getting that data into a usable format for flight planning systems, avionics databases, or even basic situational awareness requires:

- Manually parsing fixed-width or CSV records
- Cross-referencing base route metadata with waypoint sequences
- Converting coordinates into ARINC DMS format
- Generating 132-character fixed-length ARINC 424 records by hand

No publicly available tool does all of this in one place. MTR App closes that gap.

---

## 3. Goals

- Parse and store the complete set of active FAA MTR routes from eNASR data
- Expose that data through an interactive, browser-based dashboard
- Generate ARINC 424-23 XML, 132-character fixed records, GeoJSON, and plain-English flight briefs from the same source
- Let authorized users edit route data and sync changes to both cloud (Supabase) and local (SQLite) storage
- Support bulk export for downstream avionics or FMS integration workflows
- Keep the server dependency footprint minimal — zero external Python packages required

---

## 4. Users

**Primary:** Flight operations staff, military airspace managers, and aviation data integrators who need MTR information in structured, machine-readable formats.

**Secondary:** Developers building flight planning tools or avionics databases who need a clean ARINC 424-23 data feed.

**Tertiary:** Pilots and controllers who want a plain-English briefing for a specific MTR before filing or working traffic.

---

## 5. Data Source

**Source:** FAA eNASR (Electronic NASR — National Airspace System Resource)  
**Cycle:** 28-day AIRAC releases  
**Current Cycle:** AIRAC 2609 (as of September 2026)  
**Key Files:** `MTR_BASE.csv`, `MTR_PTS.csv`

The app ships pre-populated with 25 authentic FAA AIRAC Cycle 2609 MTR routes across three categories:

- **IR (Instrument Routes):** IR-200, IR-211, IR-107, IR-120, IR-128, IR-135, IR-140, IR-160, IR-178, IR-300
- **VR (Visual Routes):** VR-1254, VR-1265, VR-1001, VR-1002, VR-1020, VR-1355, VR-1360, VR-1410, VR-1450, VR-1500
- **SR (Slow Speed Routes):** SR-101, SR-102, SR-103, SR-104, SR-105

New AIRAC releases can be imported via CLI: `python3 -m mtr_app.import_nasr_csv`.

---

## 6. Core Features

### 6.1 Route Browser & Directory

A left-panel route directory with filter tabs (ALL / IR / VR / SR) and a search field. Users can filter by route name or controlling ARTCC. Selecting a route loads its map, altitude profile, and inspector panel simultaneously.

### 6.2 Interactive Map

Center panel renders:
- Route centerline path
- Left/right corridor buffer polygons (ribbon visualization)
- Waypoint markers labeled by type: `ENTRY`, `TURN`, `EXIT`
- Click-to-popup with exact coordinates (ARINC DMS + decimal degrees), altitude limits, and leg distance

Basemap: OpenStreetMap standard layer via Leaflet. No watermarks, no external API keys required.

### 6.3 Altitude Envelope Profile

Canvas chart below the map plots floor and ceiling altitudes (in feet MSL) against cumulative route distance in nautical miles. For example, IR-200 plots 100 ft MSL floor to 18,000 ft MSL ceiling across its full corridor.

### 6.4 Multi-Format Inspector

Right panel with four tabs:

| Tab | Output |
|-----|--------|
| ARINC 424-23 XML | Supplement 23 compliant XML, schema-validated |
| Plain-English Brief | Human-readable operational brief for pilots/controllers |
| 132-Char Fixed Records | `PF` header + `PG` segment fixed-length ARINC 424 records |
| Leg Sequence Table | Tabular view of all waypoints with sequence, coordinates, types |

Each tab has a copy button. XML and `.dat` formats have individual download buttons.

### 6.5 Route Editor

Accessible via the `✎ Edit Route` button on any active route. Opens a modal pre-filled with the route's current data. Editable fields:

- Route designator, managing base, controlling ARTCC
- Floor/ceiling altitudes, corridor width
- Individual waypoint names, types, lat/lon, sequence order
- Add or remove waypoints

Saving pushes changes to both Supabase and local SQLite, then refreshes the map, altitude profile, XML, and brief in real time.

### 6.6 New Route Import

`＋ New / Import MTR` in the header. Two input modes:
- Manual form entry
- Paste JSON / GeoJSON (standard GeoJSON Feature or eNASR route JSON)

On save, the app translates input to ARINC 424-23 format and stores it.

### 6.7 Bulk Export

`Export All ▾` dropdown in the header. Generates:
- ARINC 424-23 XML file (all 25+ routes)
- Fixed-width `.dat` file (all routes)
- GeoJSON FeatureCollection (all routes)

### 6.8 CLI Tooling

`mtr_cli.py` supports:

```
python3 mtr_cli.py --list
python3 mtr_cli.py --route IR-200 --format xml --output IR-200.xml
python3 mtr_cli.py --route VR-1254 --format fixed --output VR-1254.arinc
python3 mtr_cli.py --route SR-101 --format plain
python3 mtr_cli.py --route IR-211 --format geojson --output IR-211.geojson
python3 mtr_cli.py --validate
```

---

## 7. Data Architecture

### Storage

**Dual storage** — Supabase (PostgreSQL via REST) + local SQLite (`enasr-geospatial.db`):

- Supabase is primary when online and configured
- SQLite is automatic fallback when offline or unconfigured
- No external Python packages required — Supabase REST calls use `urllib.request` from stdlib

### Database

11 domain tables covering airports, runways, NAVAIDs, fixes, airways, airway segments, airspace, radio frequencies, procedures, procedure legs, and weather stations.

**Data quality:** 100% integrity across all 8 automated test suites (as of 2026-09-15 audit):
- Zero unexpected NULLs across 50 mandatory column rules
- Zero foreign key violations
- 37 coordinate pairs validated against WGS84 bounds
- 31 WKT geometries (POINT, LINESTRING, POLYGON) fully valid
- 2 airway routes with contiguous, gap-free sequence topology

### Standards Compliance

- ARINC 424-23 (XML — Supplement 23 for Government Aviation Data)
- ARINC 424 132-character fixed-length record format
- WGS84 coordinate system
- FAA AIRAC 28-day cycle data cadence
- ICAO/FAA 3-4 character location identifiers
- VHF aeronautical frequency band validation (108.0–137.0 MHz)

---

## 8. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML/CSS/JS, Leaflet.js (mapping), Canvas API (altitude chart) |
| Backend | Python 3, `run.py` server on port 8080 |
| API Server | `server.ts` (TypeScript/Node) |
| Cloud DB | Supabase (PostgreSQL) via REST API |
| Local DB | SQLite (`enasr-geospatial.db`) |
| Data | GeoJSON, eNASR CSV, ARINC 424-23 XML |
| Deployment | Google AI Studio (`mtrapp.ai.studio`) |

---

## 9. Local Setup

```bash
git clone https://github.com/avinasharadya88/Creativity.git
cd Creativity
python3 run.py --server 8080
# Open http://localhost:8080
```

No `pip install` required. Zero external Python package dependencies.

To share locally with reviewers:
```bash
# Option A: Cloudflare tunnel
cloudflared tunnel --url http://localhost:8080

# Option B: SSH tunnel (no install)
ssh -p 443 -R 80:localhost:8080 a.pinggy.io
```

---

## 10. What's Not in Scope (v1)

- Real-time FAA NOTAM overlay on MTR corridors
- User authentication / role-based access control for the editor
- Mobile-optimized responsive layout
- Automated AIRAC cycle update scheduler (currently manual CLI import)
- Integration with EFB (Electronic Flight Bag) platforms
- ATC clearance workflow or CPDLC integration

---

## 11. Success Metrics

- All 25 pre-seeded MTR routes load, render, and export correctly
- ARINC 424-23 XML output passes schema validation for all routes
- Route edits persist correctly to both Supabase and SQLite
- CLI export commands complete without errors across all formats
- 13/13 automated unit and integration tests pass

---

## 12. Open Questions

- Should the app support direct FAA NASR ZIP download and auto-import on a schedule, or keep the 28-day manual import via CLI?
- Is there a requirement to support ARINC 424-18 or earlier fixed-record formats for legacy FMS compatibility?
- What's the target user permission model — single owner, team with roles, or public read access?
- Any plans to open-source or publish the app beyond the current GitHub repo?
