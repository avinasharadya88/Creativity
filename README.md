# FAA eNASR to ARINC 424-23 MTR Converter & Dashboard

This application converts FAA eNASR Military Training Route (MTR) data into a user- and machine-understandable format conforming to the **ARINC 424-23 XML Standard** (Supplement 23 for Government Aviation Data). It also supports exporting to legacy 132-character fixed-length ARINC records, GeoJSON, and plain-English flight briefs.

## 🌟 Features

1. **ARINC 424-23 XML Engine**: Generates schema-valid ARINC 424 Supplement 23 XML, including XML headers, AIRAC cycle tags, controlling agencies, operational parameters, route vertical envelopes, and segment-by-segment corridor width geometry.
2. **Legacy ARINC 424 Fixed-Length Generator**: Produces standard 132-character fixed-width MTR records (`PF` route header records and `PG` route segment records).
3. **Glass-Cockpit Interactive Visualizer**: An interactive web dashboard featuring a Leaflet Map with route centerlines, buffer corridor polygon ribbons, and interactive waypoint tooltips, alongside a Canvas Altitude Profile.
4. **Geodesy & Corridor Calculations**: Precise Vincenty/Haversine spherical trigonometry for segment distances and true/magnetic initial bearings.

---

## 🚀 Getting Started

### Prerequisites

- Python 3.8+
- No external library dependencies (uses only Python standard library: `sqlite3`, `http.server`, `xml.etree.ElementTree`, `math`, `urllib`).

### Running the Web Application Dashboard

To start the interactive web application, run the included `run.py` server:

```bash
python3 run.py --server 8080
```
Then open `http://localhost:8080` in your web browser. From the dashboard, you can view routes on a map, see their altitude profiles, and inspect the data in various formats (XML, Fixed, Plain English).

---

## 🛠️ Extracting Data via Command Line (CLI)

The application provides a robust command-line interface (`mtr_cli.py`) for batch processing and data extraction.

### 1. List Available Routes
List all MTR routes currently stored in the SQLite database:
```bash
python3 mtr_cli.py --list
```

### 2. Export to ARINC 424-23 XML
Extract a route directly into the modern ARINC 424-23 XML format:
```bash
python3 mtr_cli.py --route IR-102 --format xml
```
*To save to a file:*
```bash
python3 mtr_cli.py --route IR-102 --format xml --output IR-102.xml
```

### 3. Export to Legacy ARINC 424 Fixed-Length
Extract a route to the legacy 132-character fixed-length ARINC 424 format:
```bash
python3 mtr_cli.py --route VR-223 --format fixed --output VR-223.arinc
```

### 4. Export to Plain-English Flight Brief
Generate a human-readable flight brief suitable for pilots and dispatchers:
```bash
python3 mtr_cli.py --route SR-301 --format plain
```

### 5. Export to GeoJSON
Generate standard GeoJSON for use in GIS applications (e.g., QGIS, ArcGIS):
```bash
python3 mtr_cli.py --route IR-102 --format geojson --output IR-102.geojson
```

### 6. Validate XML Output
Validate all routes against the ARINC 424-23 XML schema rules:
```bash
python3 mtr_cli.py --validate
```

---

## 🏗️ Architecture

- **`mtr_app/services/mtr_service.py`**: Service layer interfacing with `enasr-geospatial.db`.
- **`mtr_app/generators/arinc424_xml.py`**: XML generation and validation logic.
- **`mtr_app/generators/arinc424_fixed.py`**: 132-character fixed-length record generation logic.
- **`mtr_app/generators/corridor_calc.py`**: Geodesy math, distances, bearings, and corridor buffer polygon generation.
- **`mtr_app/server/app.py`**: Native Python HTTP server for the REST API and static web assets.
- **`mtr_app/static/`**: Client-side HTML, CSS, and JS for the web dashboard.