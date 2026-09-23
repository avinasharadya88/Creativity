# MTR App — architecture

Version: 1.0  
Date: 2026-09-23  
Repo: https://github.com/avinasharadya88/Creativity  
Live app: https://mtrapp.ai.studio

---

## Overview

MTR App has three tiers: a static HTML/JS frontend, a Python HTTP server that handles routing and REST logic, and a TypeScript/Node API layer. Storage runs in parallel across Supabase (cloud PostgreSQL) and a local SQLite file. The two storage backends aren't a primary/replica pair — they're actively kept in sync. Writes go to both. Reads prefer Supabase when online; SQLite kicks in when offline or unconfigured.

There are no external Python package dependencies. The whole server stack runs on Python stdlib.

---

## Directory layout

```
Creativity/
├── src/                        # Python application modules
│   ├── mtr_app/                # Core app package
│   │   ├── import_nasr_csv.py  # FAA NASR CSV ingestion
│   │   ├── seed_supabase.py    # Supabase seed script
│   │   ├── arinc424.py         # ARINC 424-23 XML generator
│   │   ├── fixed_records.py    # 132-char fixed-length record generator
│   │   ├── geojson_export.py   # GeoJSON exporter
│   │   └── plain_brief.py      # Plain-English flight brief generator
│   └── tests/                  # Unit and integration tests
├── static/                     # Frontend static assets
│   ├── index.html              # Single-page app shell
│   ├── app.js                  # UI logic, Leaflet map, Canvas chart
│   └── style.css               # Dashboard styles
├── server.ts                   # TypeScript/Node API server
├── run.py                      # Python HTTP server entry point (port 8080)
├── mtr_cli.py                  # CLI tool for batch export and validation
├── enasr-geospatial.db         # Local SQLite database
├── enasr-mtr-routes.json       # Pre-seeded route data (JSON)
├── enasr-mtr-routes.geojson    # Pre-seeded route data (GeoJSON)
├── enasr-schema.sql            # SQLite schema definition
├── supabase-schema.sql         # Supabase PostgreSQL schema definition
├── initial_routes.json         # Bootstrap seed for first run
├── metadata.json               # App and cycle metadata
├── package.json                # Node dependencies for server.ts
├── tsconfig.json               # TypeScript config
└── .env.example                # Environment variable template
```

---

## Component breakdown

### Python HTTP server (`run.py`)

Entry point. Starts the web server on port 8080 using Python's built-in `http.server`. Handles static file serving and routes API requests to the appropriate handler in `src/mtr_app/`. No Flask, no FastAPI — stdlib only.

### TypeScript API server (`server.ts`)

Node/TypeScript layer compiled from `tsconfig.json`. Handles structured REST endpoints that the frontend calls for route CRUD operations and export generation. Runs alongside the Python server, with `run.py` acting as the outer shell that coordinates startup.

### Frontend (`static/`)

Single HTML file with embedded JS. No build step, no framework. Leaflet.js handles the map from a CDN script tag. The Canvas API draws altitude profiles. UI state (selected route, active tab, editor open/closed) lives entirely in JS variables — nothing is persisted to the browser.

Key frontend responsibilities:
- Rendering the three-panel layout (route list / map / inspector)
- Fetching route data from the API on selection
- Drawing the Leaflet map with centerline, corridor buffers, and waypoint markers
- Plotting the altitude envelope on a `<canvas>` element
- Opening the edit modal and POSTing changes back to the API
- Triggering single-route and bulk exports

### CLI (`mtr_cli.py`)

Standalone script. Imports from `src/mtr_app/` directly, no HTTP involved. Useful for batch processing and CI validation. Runs against the local SQLite database.

---

## Database architecture

### Schema

Two schemas — one for SQLite (`enasr-schema.sql`), one for Supabase (`supabase-schema.sql`). Both define the same 11 domain tables:

| Table | Contents |
|-------|----------|
| `airports` | Airport identifiers, coordinates, names |
| `runways` | Runway thresholds, headings, lengths |
| `navaids` | VOR, NDB, DME identifiers and frequencies |
| `fixes` | Named waypoints and intersections |
| `airways` | Airway route definitions |
| `airway_segments` | Individual legs within each airway, sequence-ordered |
| `airspace` | Airspace class, floor/ceiling, WKT polygon geometries |
| `frequencies` | Radio frequencies per airport (VHF, 108.0–137.0 MHz) |
| `procedures` | SID, STAR, approach procedure definitions |
| `procedure_legs` | Individual legs within procedures |
| `weather_stations` | Met station identifiers and coordinates |

MTR-specific data maps primarily to `airways` (one row per MTR route) and `airway_segments` (one row per waypoint/leg). The `airspace` table holds corridor polygon geometries as WKT.

### Geometry

All coordinates are WGS84. Spatial data is stored as Well-Known Text (WKT) strings in `geometry_wkt` columns — `POINT`, `LINESTRING`, `POLYGON`, and `MULTIPOLYGON`. No PostGIS or SpatiaLite extension required; the app parses WKT directly in Python.

Corridor buffer polygons are computed at runtime from the centerline + corridor width, not stored as pre-built geometries.

### Dual storage

```
Write path:
  API handler → write to Supabase (urllib.request → REST POST/PATCH)
              → write to SQLite (sqlite3, stdlib)

Read path:
  API handler → try Supabase (urllib.request → REST GET)
              → on failure or no config → fall back to SQLite
```

The Supabase REST endpoint is `https://ahmpkflqibikzhfiecgo.supabase.co/rest/v1/`. Authentication uses the Supabase anon key loaded from `~/.env` or the environment. The SQLite path defaults to `enasr-geospatial.db` in the repo root.

---

## Data flow

### 1. Initial data load (first run)

```
FAA eNASR ZIP release
  └── MTR_BASE.csv  ──┐
  └── MTR_PTS.csv   ──┴──► import_nasr_csv.py
                              │
                              ├── parse base route metadata (designator, managing base,
                              │   controlling ARTCC, floor/ceiling altitudes, corridor width)
                              │
                              ├── parse waypoint sequences (lat/lon, type, sequence number)
                              │
                              ├── INSERT → enasr-geospatial.db (SQLite)
                              │
                              └── INSERT → Supabase via REST API
```

The app ships pre-seeded with 25 AIRAC 2609 routes via `initial_routes.json`. On first run `seed_supabase.py` pushes these to Supabase if the cloud DB is empty.

### 2. User selects a route in the browser

```
Browser: click route in left panel
  │
  └──► GET /api/routes/{id}
         │
         └──► server.ts handler
                │
                ├── query Supabase REST: /rest/v1/airways?id=eq.{id}
                │   (falls back to SQLite if offline)
                │
                ├── query waypoints: /rest/v1/airway_segments?airway_id=eq.{id}
                │   ordered by sequence_num ASC
                │
                └──► return JSON payload:
                       { route_meta, waypoints[], geometry_wkt }
                         │
                         ▼
                    Browser receives JSON
                         │
                         ├── Leaflet: draw centerline LINESTRING
                         │           compute + draw corridor buffer polygons
                         │           place ENTRY/TURN/EXIT markers
                         │
                         ├── Canvas: plot floor/ceiling vs. cumulative distance
                         │
                         └── Inspector tabs: pass JSON to format generators
                               ├── arinc424.js → ARINC 424-23 XML string
                               ├── fixed_records.js → 132-char fixed records
                               ├── plain_brief.js → plain-English text
                               └── leg_table.js → waypoint table HTML
```

### 3. Route edit and save

```
User edits route in modal → clicks "Save Changes to Backend"
  │
  └──► POST /api/routes/{id}
         body: { updated route_meta, updated waypoints[] }
         │
         └──► server.ts handler
                │
                ├── PATCH Supabase /rest/v1/airways?id=eq.{id}
                │
                ├── DELETE + INSERT airway_segments for updated waypoints
                │   (sequence numbers re-assigned)
                │
                ├── UPDATE enasr-geospatial.db (same operations, sqlite3)
                │
                └──► 200 OK → browser refreshes map + inspector
```

### 4. New route import

```
User pastes GeoJSON or fills manual form → clicks "Save & Translate"
  │
  └──► POST /api/routes
         body: { raw GeoJSON Feature } or { manual form fields }
         │
         └──► server.ts handler
                │
                ├── parse input → normalize to internal route schema
                │
                ├── run arinc424.py translation
                │   (assign designator, DMS coordinates, PF/PG record structure)
                │
                ├── INSERT → Supabase airways + airway_segments
                │
                ├── INSERT → SQLite airways + airway_segments
                │
                └──► 201 Created → new route appears in left panel
```

### 5. Export

**Single route (browser):**
```
User clicks "Download XML" or "Download .dat"
  │
  └──► GET /api/routes/{id}/export?format={xml|fixed|geojson|plain}
         │
         └──► server.ts calls the matching Python module:
                arinc424.py     → ARINC 424-23 XML string
                fixed_records.py → 132-char PF + PG records
                geojson_export.py → GeoJSON Feature
                plain_brief.py   → plain-English text
         │
         └──► response with Content-Disposition: attachment header
```

**Bulk export (browser):**
```
User clicks "Export All ▾" → picks format
  │
  └──► GET /api/routes/export/all?format={xml|fixed|geojson}
         │
         └──► server.ts: fetch all routes from DB
                         → run format generator for each route
                         → wrap in XML document / fixed-width file / GeoJSON FeatureCollection
         │
         └──► single file download response
```

**CLI export:**
```
mtr_cli.py --route IR-200 --format xml --output IR-200.xml
  │
  └──► reads directly from enasr-geospatial.db (sqlite3, no HTTP)
         │
         └──► calls arinc424.py → writes IR-200.xml to disk
```

### 6. AIRAC cycle update

```
FAA publishes new 28-day release (ZIP)
  │
  └──► python3 -m mtr_app.import_nasr_csv
         │
         ├── download + extract MTR_BASE.csv, MTR_PTS.csv
         ├── parse new/updated/removed routes
         ├── UPSERT → SQLite (keyed on route designator)
         └── UPSERT → Supabase (keyed on route designator)
```

---

## ARINC 424-23 translation

This is the core data transformation in the app. Every MTR route goes through it before any output is generated.

**Input:** eNASR route record — designator, managing base, ARTCC, floor/ceiling MSL, corridor width, waypoint sequence (lat/lon pairs with type and sequence number)

**Output:** ARINC 424-23 XML with two record types:
- `PF` — route header record (designator, owning region, ARTCC, record type)
- `PG` — segment record (one per waypoint leg: sequence number, fix identifier, lat/lon in ARINC DMS format, altitude, distance)

DMS conversion: decimal degrees → degrees + minutes + decimal seconds, formatted to ARINC spec (e.g., `N385412.0` for 38°54'12.0"N).

The same route data also drives:
- 132-character fixed-length records (same PF/PG structure, space-padded to exactly 132 chars per line)
- GeoJSON FeatureCollection (coordinates in decimal degrees, properties from route metadata)
- Plain-English brief (narrative paragraph + waypoint table in readable format)

---

## Standards

| Standard | Where used |
|----------|-----------|
| ARINC 424-23 XML | Primary export format, schema-validated |
| ARINC 424 132-char fixed | Secondary export, legacy FMS compatibility |
| WGS84 | All coordinates at rest and in transit |
| FAA AIRAC 28-day cycle | Data versioning and update cadence |
| ICAO/FAA location identifiers | 3-4 char alphanumeric, uppercase |
| VHF aeronautical frequencies | 108.0–137.0 MHz, validated on import |
| GeoJSON (RFC 7946) | Map rendering and bulk export |
| WKT (ISO 19125) | Spatial geometry storage in SQLite and Supabase |

---

## Deployment

**Production:** Google AI Studio at `mtrapp.ai.studio`. Runs the Python server; the TypeScript API layer compiles and runs alongside it.

**Local dev:**
```bash
git clone https://github.com/avinasharadya88/Creativity.git
cd Creativity
python3 run.py --server 8080
# http://localhost:8080
```

**Exposing local to reviewers:**
```bash
# Cloudflare tunnel (outputs a trycloudflare.com URL)
cloudflared tunnel --url http://localhost:8080

# SSH tunnel (no install)
ssh -p 443 -R 80:localhost:8080 a.pinggy.io

# npx
npx localtunnel --port 8080
```

**Supabase setup:**
```bash
# Run supabase-schema.sql in the Supabase SQL Editor
# Save the anon key:
printf "Enter SUPABASE_ANON_KEY: " && read -s val && echo && echo "SUPABASE_ANON_KEY=$val" >> ~/.env

# Seed 25 routes to cloud DB:
python3 -m mtr_app.seed_supabase
```

---

## Testing

Tests live in `src/tests/` and cover geodesy calculations, ARINC 424-23 XML generation, 132-character fixed formatting, REST API handlers, and database sync.

```bash
python3 -m unittest discover -s tests -p "test_*.py" -v
```

13/13 tests pass. The database audit run on 2026-09-15 against `enasr-geospatial.db` confirmed 100% integrity across all 8 test suites — zero NULLs, zero FK violations, all 31 WKT geometries valid, all 37 coordinate pairs within WGS84 bounds.

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `SUPABASE_ANON_KEY` | Authenticates REST calls to Supabase |
| `SUPABASE_URL` | Supabase project endpoint (default: `https://ahmpkflqibikzhfiecgo.supabase.co`) |

Loaded from `~/.env` or the process environment. If neither is set, the app falls back to SQLite silently.

See `.env.example` in the repo root for the full template.
