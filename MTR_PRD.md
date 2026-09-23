# MTR App — product requirements

Version: 1.0  
Date: 2026-09-23  
Author: Avinash Aradya  
Repo: https://github.com/avinasharadya88/Creativity  
Live app: https://mtrapp.ai.studio

---

## Overview

MTR App is a full-stack aviation web application built around FAA eNASR Military Training Route data. It takes raw FAA route files and turns them into something actually usable: ARINC 424-23 XML, interactive maps with altitude profiles, plain-English flight briefs, and 132-character fixed-length ARINC 424 records — all from the same source, all in one place.

The people who need this are flight operations staff, military airspace managers, aviation data integrators, and developers building flight planning tools. Right now they're manually cross-referencing eNASR CSV files, converting coordinates by hand, and writing ARINC records from scratch. MTR App replaces that workflow.

---

## The problem

FAA MTR data comes as flat CSV files — `MTR_BASE.csv` and `MTR_PTS.csv` — published on a 28-day AIRAC cycle. To get anything useful out of them, you have to parse fixed-width or CSV records, cross-reference base route metadata against waypoint sequences, convert coordinates to ARINC DMS format, and generate 132-character fixed-length ARINC 424 records by hand. No existing tool handles all of this in one place.

---

## Goals

- Parse and store the full set of active FAA MTR routes from eNASR data
- Render that data through an interactive, browser-based dashboard
- Generate ARINC 424-23 XML, 132-character fixed records, GeoJSON, and plain-English flight briefs from the same source
- Let users edit route data and sync changes to both Supabase and local SQLite
- Support bulk export for downstream avionics or FMS workflows
- Run with zero external Python package dependencies

---

## Users

Flight operations staff, military airspace managers, and aviation data integrators are the primary audience — people who need MTR information in structured, machine-readable formats for operational use.

Developers building flight planning tools or avionics databases need a clean ARINC 424-23 data feed and will likely hit the CLI and bulk export features most.

Pilots and controllers rounding out the user base mostly want the plain-English briefing for a specific MTR before filing or working traffic.

---

## Data source

Source: FAA eNASR (Electronic NASR — National Airspace System Resource)  
Cycle: 28-day AIRAC releases  
Current cycle: AIRAC 2609 (September 2026)  
Key files: `MTR_BASE.csv`, `MTR_PTS.csv`

The app ships with 25 active FAA AIRAC 2609 routes across three categories:

- IR (Instrument Routes): IR-200, IR-211, IR-107, IR-120, IR-128, IR-135, IR-140, IR-160, IR-178, IR-300
- VR (Visual Routes): VR-1254, VR-1265, VR-1001, VR-1002, VR-1020, VR-1355, VR-1360, VR-1410, VR-1450, VR-1500
- SR (Slow Speed Routes): SR-101, SR-102, SR-103, SR-104, SR-105

New AIRAC releases import via CLI: `python3 -m mtr_app.import_nasr_csv`

---

## Features

### Route browser

Left panel with filter tabs (ALL / IR / VR / SR) and a search field. Filter by route name or controlling ARTCC. Selecting a route loads the map, altitude profile, and inspector panel together.

### Map

Center panel shows the route centerline, left/right corridor buffer polygons, and waypoint markers typed as `ENTRY`, `TURN`, or `EXIT`. Click any waypoint for exact coordinates (ARINC DMS and decimal degrees), altitude limits, and leg distance.

Basemap is OpenStreetMap standard via Leaflet. No external API keys, no watermarks.

### Altitude profile

Canvas chart below the map. Plots floor and ceiling altitudes in feet MSL against cumulative route distance in nautical miles. IR-200, for example, runs 100 ft MSL floor to 18,000 ft MSL ceiling across its full corridor length.

### Inspector

Right panel with four tabs:

| Tab | Output |
|-----|--------|
| ARINC 424-23 XML | Supplement 23 compliant XML, schema-validated |
| Plain-English brief | Operational brief for pilots and controllers |
| 132-char fixed records | `PF` header + `PG` segment fixed-length ARINC 424 records |
| Leg sequence table | All waypoints with sequence, coordinates, and types |

Each tab has a copy button. XML and `.dat` formats have individual download buttons.

### Route editor

Click `✎ Edit Route` on any active route. A modal opens pre-filled with the route's current data. You can change the route designator, managing base, controlling ARTCC, floor/ceiling altitudes, corridor width, and individual waypoints (name, type, lat/lon, sequence). Add or remove waypoints from the sequence. Saving writes to both Supabase and local SQLite and refreshes the map, altitude profile, XML, and brief immediately.

### New route import

`＋ New / Import MTR` in the header. Manual form or paste JSON/GeoJSON (standard GeoJSON Feature or eNASR route JSON). On save, translates to ARINC 424-23 and stores it.

### Bulk export

`Export All ▾` in the header generates an ARINC 424-23 XML file, a fixed-width `.dat` file, or a GeoJSON FeatureCollection covering all routes.

### CLI

`mtr_cli.py` for batch processing:

```
python3 mtr_cli.py --list
python3 mtr_cli.py --route IR-200 --format xml --output IR-200.xml
python3 mtr_cli.py --route VR-1254 --format fixed --output VR-1254.arinc
python3 mtr_cli.py --route SR-101 --format plain
python3 mtr_cli.py --route IR-211 --format geojson --output IR-211.geojson
python3 mtr_cli.py --validate
```

---

## Data architecture

### Storage

Supabase (PostgreSQL via REST) is the primary store when the app is online and configured. SQLite (`enasr-geospatial.db`) is the automatic fallback. Supabase calls use `urllib.request` from Python stdlib — no `pip install` required.

### Database

11 domain tables: airports, runways, NAVAIDs, fixes, airways, airway segments, airspace, radio frequencies, procedures, procedure legs, and weather stations.

Data quality audit run 2026-09-15 against all 8 automated test suites — 100% pass rate:

- 0 unexpected NULLs across 50 mandatory column rules
- 0 foreign key violations
- 37 coordinate pairs within WGS84 bounds
- 31 WKT geometries (POINT, LINESTRING, POLYGON) valid
- 2 airway routes with contiguous, gap-free sequence topology

### Standards

- ARINC 424-23 XML (Supplement 23 for Government Aviation Data)
- ARINC 424 132-character fixed-length record format
- WGS84 coordinate system
- FAA AIRAC 28-day cycle cadence
- ICAO/FAA 3-4 character location identifiers
- VHF aeronautical frequency band validation (108.0–137.0 MHz)

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML/CSS/JS, Leaflet.js, Canvas API |
| Backend | Python 3, `run.py` on port 8080 |
| API server | `server.ts` (TypeScript/Node) |
| Cloud DB | Supabase PostgreSQL via REST |
| Local DB | SQLite (`enasr-geospatial.db`) |
| Data formats | GeoJSON, eNASR CSV, ARINC 424-23 XML |
| Deployment | Google AI Studio (`mtrapp.ai.studio`) |

---

## Local setup

```bash
git clone https://github.com/avinasharadya88/Creativity.git
cd Creativity
python3 run.py --server 8080
# Open http://localhost:8080
```

No `pip install`. To share with reviewers without deploying:

```bash
# Cloudflare tunnel
cloudflared tunnel --url http://localhost:8080

# SSH tunnel (no install needed)
ssh -p 443 -R 80:localhost:8080 a.pinggy.io
```

---

## Out of scope for v1

- Real-time FAA NOTAM overlay on MTR corridors
- User authentication and role-based access for the editor
- Mobile-optimized responsive layout
- Automated AIRAC cycle update scheduling (currently manual CLI import)
- EFB (Electronic Flight Bag) platform integration
- ATC clearance workflows or CPDLC

---

## Success criteria

- All 25 pre-seeded MTR routes load, render, and export correctly
- ARINC 424-23 XML passes schema validation for all routes
- Route edits persist to both Supabase and SQLite
- CLI export works across all formats without errors
- 13/13 automated unit and integration tests pass

---

## Open questions

- Should the app fetch and auto-import new FAA NASR ZIP releases on a schedule, or stay with the current manual CLI approach?
- Is there a requirement for ARINC 424-18 or earlier fixed-record formats for legacy FMS compatibility?
- What's the intended permission model — single owner, team with roles, or public read access?
- Any plans to list this as a standalone open-source project rather than a folder inside the Creativity repo?
