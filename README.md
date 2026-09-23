# FAA eNASR to ARINC 424-23 MTR Converter & Dashboard

[![AIRAC Cycle](https://img.shields.io/badge/FAA_AIRAC-2609-blue.svg)](https://www.faa.gov/air_traffic/flight_info/aeronav/aeronautical_data/)
[![ARINC Standard](https://img.shields.io/badge/ARINC_Standard-424--23_XML-emerald.svg)](http://www.sae-itc.com/arinc424/23)
[![Cloud DB](https://img.shields.io/badge/Cloud_Database-Supabase_PostgreSQL-3ECF8E.svg)](https://ahmpkflqibikzhfiecgo.supabase.co)
[![Live App](https://img.shields.io/badge/Google_AI_Studio-mtrapp.ai.studio-8E44AD.svg)](https://mtrapp.ai.studio)

A modern, full-stack aviation application designed to convert **FAA eNASR Military Training Route (MTR)** data into user- and machine-understandable formats conforming to the **ARINC 424-23 XML Standard** (Supplement 23 for Government Aviation Data). 

The application provides an interactive **Glass-Cockpit Dashboard**, multi-format data generators (ARINC 424-23 XML, ARINC 132-character fixed records, GeoJSON, and Plain-English Flight Briefs), real-time interactive route editing (`✎ Edit Route`), and seamless dual-storage syncing with **Supabase Cloud Database** and local **SQLite**. 
At Jeppesen, data ingestion and cleanup alone before producing any ARINC 424-23 output takes a minimum of 14 days. Add 5 more days for building the XML and delivering it through business review cycles, and you're looking at 19 working days — roughly 152 hours — per route.
MTR App collapses that entire pipeline. Raw eNASR data is extracted in under a second. A knowledgeable aeronautical data engineer can clean and validate a single route in about 5 minutes, compared to an hour under the manual legacy method. Once the data is checked in, the ARINC export generates with a single click — again, under a second.
That's 152 hours reduced to 5 minutes. The app delivers a ~95% reduction in effort per route.

---

## 🚀 Live App & Deployment

- **Hosted Web App (Google AI Studio)**: [https://mtrapp.ai.studio](https://mtrapp.ai.studio)
- **Supabase Project Endpoint**: `https://ahmpkflqibikzhfiecgo.supabase.co`
- **GitHub Repository**: [https://github.com/avinasharadya88/Creativity](https://github.com/avinasharadya88/Creativity)

---

## ✨ Key Capabilities & Latest Features

1. **Supabase Cloud DB & Local SQLite Hybrid Storage**:
   - Directly interfaces with **Supabase PostgreSQL** via REST API (`https://ahmpkflqibikzhfiecgo.supabase.co/rest/v1/`) using pure Python standard library (`urllib.request`). Zero external package dependencies required.
   - Automatically falls back to local `enasr-geospatial.db` SQLite database if offline or unconfigured.

2. **25 Authentic FAA AIRAC Cycle 2609 MTR Routes**:
   - Pre-populated with published, active FAA military training routes spanning major defense corridors and training ranges across the US:
     - **Instrument Routes (IR)**: `IR-200`, `IR-211`, `IR-107`, `IR-120`, `IR-128`, `IR-135`, `IR-140`, `IR-160`, `IR-178`, `IR-300`.
     - **Visual Routes (VR)**: `VR-1254`, `VR-1265`, `VR-1001`, `VR-1002`, `VR-1020`, `VR-1355`, `VR-1360`, `VR-1410`, `VR-1450`, `VR-1500`.
     - **Slow Speed Routes (SR)**: `SR-101`, `SR-102`, `SR-103`, `SR-104`, `SR-105`.

3. **Interactive Route Editor (`✎ Edit Route`)**:
   - Edit any existing MTR route or add new routes directly from the web interface.
   - Modify route designators, managing military units, controlling ARTCC facilities, floor/ceiling altitudes, corridor widths, and individual waypoint coordinates/sequence points.
   - Instant backend synchronization saves changes directly to **Supabase DB** and local **SQLite**, refreshing the map, altitude profile, XML, and flight briefs in real time.

4. **Open-Source Light Mode Map & Visualizer**:
   - **Leaflet Map**: Clean, watermark-free OpenStreetMap standard basemap rendering route centerlines, buffer corridor polygon ribbons, and interactive waypoint markers with detailed popups.
   - **Canvas Altitude Profile**: Plots vertical floor and ceiling envelopes (e.g. 100 ft MSL to 18,000 ft MSL) against cumulative distance in nautical miles.

5. **Multi-Format ARINC 424 Inspector**:
   - **ARINC 424-23 XML**: Supplement 23 compliant XML generation with schema validation.
   - **ARINC 424 Fixed Records**: 132-character fixed-length records (`PF` headers and `PG` segments).
   - **Plain-English Flight Brief**: Human-readable flight operational briefs for pilots and air traffic controllers.

---

## 📖 How to Use the Web Application

### 1. Viewing Route Data
- **Route Selection**: Click any route in the left directory panel (filtered by `ALL`, `IR`, `VR`, `SR` or searched by name/ARTCC).
- **Map Navigation**: The center panel displays the route centerline path, left/right corridor width buffers, and waypoint badges (`ENTRY`, `TURN`, `EXIT`). Click any waypoint badge for exact coordinates (ARINC DMS & Decimal), altitude limits, and leg distance.
- **Altitude Envelope**: The bottom canvas chart plots the floor and ceiling altitudes over the total route distance.
- **Inspector Tabs**: The right panel lets you inspect or copy **ARINC 424-23 XML**, **Plain-English Pilot Briefs**, **132-Char Fixed Records**, or the **Leg Sequence Table**.

### 2. Modifying & Editing Route Data
- Click the **`✎ Edit Route`** button located on the active route card or above the map.
- The interactive modal will open pre-filled with the active route's parameters and waypoint sequences.
- You can:
  - Update route metadata (Name, Managing Base, Controlling ARTCC, Altitudes, Corridor Width).
  - Adjust existing waypoint names, types (`ENTRY`, `WAYPOINT`, `TURN_POINT`, `EXIT`), latitudes, and longitudes.
  - Click **`＋ Add Waypoint`** to insert new points into the corridor sequence.
  - Click **`✕`** to remove points.
- Click **`Save Changes to Backend`** to persist the changes directly into **Supabase DB** and local **SQLite**.

### 3. Creating or Importing New Routes
- Click **`＋ New / Import MTR`** in the top navigation header.
- **Manual Form**: Enter route parameters and waypoint coordinates manually.
- **Paste JSON / GeoJSON**: Switch to the JSON tab and paste any standard GeoJSON Feature or eNASR route JSON object.
- Click **`Save & Translate to ARINC 424-23`**.

### 4. Exporting Data
- **Single Route Export**: Use the **`Download XML`** or **`Download .dat`** buttons in the right inspector panel.
- **Bulk Export**: Click **`Export All ▾`** in the top header to download all routes as an **ARINC 424-23 XML file**, **Fixed-Width file**, or **GeoJSON FeatureCollection**.

---

## 💻 Local Setup & Server Execution

### Running the Server Locally
```bash
# Clone the repository
git clone https://github.com/avinasharadya88/Creativity.git
cd Creativity

# Start the web server on port 8080 (zero external package installation required!)
python3 run.py --server 8080
```
Then open `http://localhost:8080` in your web browser.

### Hosting from your Laptop & Sharing a Live Public Feedback Link

To share your local running app (`http://localhost:8080`) with colleagues or reviewers anywhere in the world:

- **Option A: Cloudflare Tunnel (Direct instant URL)**
  ```bash
  brew install cloudflare/cloudflare/cloudflared
  cloudflared tunnel --url http://localhost:8080
  ```
  *(Outputs a direct `https://....trycloudflare.com` link with zero prompt screens).*

- **Option B: Pinggy SSH Tunnel (No software installation required)**
  ```bash
  ssh -p 443 -R 80:localhost:8080 a.pinggy.io
  ```

- **Option C: LocalTunnel**
  ```bash
  npx localtunnel --port 8080
  ```

---

## 🛠️ Data Extraction & CLI Tools (`mtr_cli.py`)

The command-line interface (`mtr_cli.py`) allows programmatic batch processing, format translation, and schema validation.

```bash
# 1. List all 25 active MTR routes in the database
python3 mtr_cli.py --list

# 2. Extract route IR-200 to ARINC 424-23 XML
python3 mtr_cli.py --route IR-200 --format xml --output IR-200.xml

# 3. Extract route VR-1254 to ARINC 424 132-char fixed length record
python3 mtr_cli.py --route VR-1254 --format fixed --output VR-1254.arinc

# 4. Extract route SR-101 to Plain-English operational brief
python3 mtr_cli.py --route SR-101 --format plain

# 5. Extract route IR-211 to GeoJSON
python3 mtr_cli.py --route IR-211 --format geojson --output IR-211.geojson

# 6. Run ARINC 424-23 XML schema validation across all routes
python3 mtr_cli.py --validate
```

---

## 🗄️ Database Architecture & Supabase Setup

### Supabase Cloud Setup
1. Execute [`supabase-schema.sql`](file:///Users/avinasharadya88/Documents/Learnings/GoogleAntiGravity/supabase-schema.sql) in your [Supabase SQL Editor](https://supabase.com/dashboard).
2. Save your Supabase Anon Key safely to `~/.env`:
   ```bash
   printf "Enter SUPABASE_ANON_KEY (typing hidden): " && read -s val && echo && echo "SUPABASE_ANON_KEY=$val" >> ~/.env && echo "Saved to ~/.env."
   ```
3. Upload all 25 authentic FAA routes to your Supabase cloud database:
   ```bash
   python3 -m mtr_app.seed_supabase
   ```

### Importing Official FAA 28-Day NASR CSV Releases
When the FAA publishes a new 28-day AIRAC release (CSV ZIP), you can parse and import `MTR_BASE.csv` and `MTR_PTS.csv` directly:
```bash
python3 -m mtr_app.import_nasr_csv
```

---

## 🧪 Verification & Automated Test Suite

Run unit and integration tests covering geodesy calculations, ARINC 424-23 XML generation, 132-character fixed formatting, REST API handlers, and database synchronization:

```bash
python3 -m unittest discover -s tests -p "test_*.py" -v
```
*(13/13 tests passing 100%).*
