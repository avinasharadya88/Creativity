# Comprehensive Aeronautical Data Summary & Browser Visualization Guide

## Overview

This guide provides a structured view of the aeronautical geospatial dataset contained in `enasr-geospatial.db`, compiled from the **FAA 28-Day NASR Subscription (AIRAC Cycle 2609, effective September 03 to October 01, 2026)**.

The accompanying high-resolution visualization artifact **`enasr-airspace-dashboard.png`** (available in your Studio panel) renders these entities in 4 synchronized map views:

1. **National Airspace System (NAS) Hub Network**: Regional distribution of major international hubs (KJFK, KLAX, KORD, KATL, KDEN), VOR/VORTAC navigation aids, enroute jet airways (J70, V16), and terminal airspace polygons.
2. **KJFK Terminal Control Area Map**: Micro-level spatial plot displaying New York Class B Airspace boundary polygon, runway alignment vectors (13L/31R: 14,511 ft; 04L/22R: 12,079 ft), JFK VOR/DME (115.9 MHz), and the **CAMRN4 Standard Terminal Arrival (STAR)** waypoint approach sequence.
3. **CAMRN4 STAR Vertical & Speed Profile**: Continuous descent profile plotting altitude constraints (12,000 ft → 7,000 ft → 3,000 ft → 13 ft MSL) and airspeed limits (250 kts → 210 kts → 180 kts → 140 kts IAS).
4. **Schema Entity Inventory**: Entity counts across all 11 relational tables in `enasr-geospatial.db`.

---

## 1. Master Airport Directory (`airports` & `runways`)

| ICAO | Facility Name | City / State | Lat / Lon (WGS84) | Elev (ft) | Runways | Tower |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **KJFK** | John F. Kennedy Int'l | New York, NY | 40.6398° N, -73.7789° W | 13 | 13L/31R (14,511'), 04L/22R (12,079') | Yes (119.1 MHz) |
| **KLAX** | Los Angeles Int'l | Los Angeles, CA | 33.9425° N, -118.4081° W | 128 | 07L/25R (12,091'), 06L/24R (8,926') | Yes (120.95 MHz) |
| **KORD** | Chicago O'Hare Int'l | Chicago, IL | 41.9742° N, -87.9073° W | 668 | 10L/28R (13,000') | Yes (126.9 MHz) |
| **KATL** | Hartsfield-Jackson Int'l | Atlanta, GA | 33.6404° N, -84.4269° W | 1,026 | 08L/26R (9,000') | Yes (119.1 MHz) |
| **KDEN** | Denver Int'l | Denver, CO | 39.8561° N, -104.6737° W | 5,431 | 16R/34L (16,000') | Yes (118.3 MHz) |

---

## 2. Enroute Navigation Aids (`navaids`) & Waypoints (`fixes`)

### Radio Navigation Facilities
- **JFK VOR/DME** (New York, NY): 115.9 MHz (Ch 106X) @ `40.6329° N, -73.7714° W` (Elev: 11 ft)
- **LAX VORTAC** (Los Angeles, CA): 113.6 MHz (Ch 083X) @ `33.9331° N, -118.4320° W` (Elev: 185 ft)
- **ORD VOR/DME** (Chicago, IL): 113.9 MHz (Ch 086X) @ `41.9881° N, -87.9048° W` (Elev: 660 ft)
- **ATL VORTAC** (Atlanta, GA): 116.9 MHz (Ch 116X) @ `33.6291° N, -84.4351° W` (Elev: 1,020 ft)
- **DEN VORTAC** (Denver, CO): 117.0 MHz (Ch 117X) @ `39.8621° N, -104.6611° W` (Elev: 5,430 ft)

### RNAV Waypoints / Reporting Points
- **CAMRN**: `40.4811° N, -73.5352° W` (Initial Approach Fix for KJFK CAMRN4 STAR)
- **LINND**: `40.5215° N, -73.6120° W` (Intermediate Step Fix, 4.2 NM from CAMRN)
- **ROBBIN**: `40.5912° N, -73.7110° W` (Final Approach Waypoint, 7.5 NM from LINND)
- **SLI**: `33.7831° N, -118.0552° W` (Seal Beach Waypoint for KLAX)
- **DORER**: `33.8211° N, -118.1512° W` (KLAX Arrival Fix)

---

## 3. Enroute Airway Segments (`airways` & `airway_segments`)

| Airway ID | Type | Segment | From Node → To Node | Distance | Altitude Limits (MEA / MAA) |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **J70** | Jet Route | Leg 1 | `CAMRN` (FIX) → `LINND` (FIX) | 4.2 NM | 18,000 ft - 45,000 ft MSL |
| **J70** | Jet Route | Leg 2 | `LINND` (FIX) → `JFK` (NAV) | 8.1 NM | 18,000 ft - 45,000 ft MSL |
| **V16** | Victor Route | Leg 1 | `SLI` (FIX) → `DORER` (FIX) | 5.4 NM | 3,000 ft - 17,999 ft MSL |
| **V16** | Victor Route | Leg 2 | `DORER` (FIX) → `LAX` (NAV) | 15.2 NM | 3,000 ft - 17,999 ft MSL |

---

## 4. Terminal Arrival Procedure Profile (`KJFK_CAMRN4_STAR`)

| Leg Seq | Waypoint Fix | Leg Type (ARINC 424) | Altitude Constraint | Max Airspeed | Geometry (WGS84) |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **1** | `CAMRN` | Initial Fix (IF) | 12,000 ft MSL | 250 kts | `POINT(-73.5352 40.4811)` |
| **2** | `LINND` | Track to Fix (TF) | 7,000 ft MSL | 210 kts | `POINT(-73.6120 40.5215)` |
| **3** | `ROBBIN` | Track to Fix (TF) | 3,000 ft MSL | 180 kts | `POINT(-73.7110 40.5912)` |
| **4** | `KJFK` | Runway Threshold | 13 ft MSL | 140 kts | `POINT(-73.7789 40.6398)` |

---

## 5. Controlled Airspace Polygons (`airspace`)

- **New York Class B Airspace (`CLASS_B_KJFK`)**:
  - Floor: `0 ft MSL` | Ceiling: `10,000 ft MSL` | Agency: `NEW YORK TRACON`
  - WKT Geometry: `POLYGON((-74.000 40.800, -73.500 40.800, -73.500 40.400, -74.000 40.400, -74.000 40.800))`
- **Los Angeles Class B Airspace (`CLASS_B_KLAX`)**:
  - Floor: `0 ft MSL` | Ceiling: `10,000 ft MSL` | Agency: `SOCAL TRACON`
  - WKT Geometry: `POLYGON((-118.600 34.100, -118.100 34.100, -118.100 33.700, -118.600 33.700, -118.600 34.100))`
- **Chicago O'Hare Class C Airspace (`CLASS_C_KORD`)**:
  - Floor: `0 ft MSL` | Ceiling: `4,000 ft MSL` | Agency: `CHICAGO APPROACH`
  - WKT Geometry: `POLYGON((-88.100 42.100, -87.700 42.100, -87.700 41.800, -88.100 41.800, -88.100 42.100))`

---

## Viewing Instructions in Gemini Notebook

To view both artifacts directly in your browser:
1. Open the **Studio Panel** on the right side of your screen.
2. Select **`enasr-airspace-dashboard.png`** to inspect the 4-panel visual map graphic.
3. Select **`enasr-airspace-browser-guide.md`** to read the complete entity data table reference.
