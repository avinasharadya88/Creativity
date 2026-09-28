# FAA eNASR MTR explorer

This TypeScript and Express application loads Military Training Route data from the bundled FAA eNASR demo dataset. The browser shows each route on a Leaflet map, draws its corridor and altitude profile, and exports XML, 132-character fixed records, GeoJSON, and a plain-language brief.

The ARINC outputs are experimental engineering mappings. The repository runs structural and fixed-width checks, but it does not include a licensed ARINC schema or an authoritative conformance suite. Do not treat an export as certified navigation data.

## Run locally

```bash
npm install
npm run lint
npm test
npm run build
API_WRITE_TOKEN='replace-with-a-long-random-secret' npm start
```

Open `http://127.0.0.1:3000`. Development mode is available through `npm run dev`.

The server honors `PORT` and defaults to `0.0.0.0`, which is required by Cloud Run and Google AI Studio deployments. Set `BIND_HOST=127.0.0.1` for a loopback-only local server. The generic `HOST` variable is deliberately ignored because Google AI Studio uses it as an application label rather than a network bind address. Configure `API_WRITE_TOKEN` for any network deployment; without one, write requests are accepted only from a loopback client.

## Data and persistence

`initial_routes.json` is the canonical bundled route source. `metadata.json` supplies the AIRAC cycle used by the API, page badge, XML, and fixed-width exports. Set `AIRAC_CYCLE` only when a deployment needs to override that file. Export generation stops if the cycle is missing, malformed, or inconsistent.

The service copies the loaded routes into memory and writes every user edit to `.data/routes.json` with an atomic rename. It reloads that file after a restart. Before an update or rollback, the current route is stored under `.data/history/<route-id>/`. An append-only audit log is written to `.data/audit.jsonl`.

These locations can be changed with:

```text
ROUTE_DATA_FILE=/durable/path/routes.json
ROUTE_HISTORY_DIR=/durable/path/history
AUDIT_LOG_FILE=/durable/path/audit.jsonl
```

Cloud Run's local filesystem is ephemeral. Mount durable storage or provide persistent paths if edits must survive a new instance.

The old `enasr-geospatial.db` and the two `enasr-mtr-routes.*` files remain as reference artifacts. The running Node service does not read them. `data-manifest.json` records their purpose and SHA-256 checksums. Run `npm run verify:data` to verify the checked-in files.

## API

Read endpoints:

```text
GET /api/health
GET /api/config
GET /api/routes
GET /api/routes/:routeId
GET /api/routes/:routeId/arinc424-xml
GET /api/routes/:routeId/arinc424-fixed
GET /api/routes/:routeId/geojson
GET /api/routes/:routeId/plain-english
GET /api/all/arinc424-xml
GET /api/all/arinc424-fixed
GET /api/all/geojson
```

Write and recovery endpoints:

```text
POST /api/routes
GET  /api/routes/:routeId/versions
POST /api/routes/:routeId/rollback   { "version": "<version-id>" }
```

Send the write token as `Authorization: Bearer <token>` or `X-API-Key`. Network deployments disable writes when `API_WRITE_TOKEN` is missing. Write requests are limited to 30 per minute per client address.

## Map services and privacy

The OpenStreetMap layer requests standard raster tiles directly from `tile.openstreetmap.org`. The app keeps the required OpenStreetMap attribution visible and uses `strict-origin-when-cross-origin`, which sends only the site origin as the request referrer. If several OSM tile requests fail, the page switches to the Esri satellite layer and shows a notice.

Leaflet, Google Fonts, OSM tiles, and Esri imagery are runtime network dependencies. Those providers receive the visitor's IP address and request metadata, and availability depends on their services. A deployment with stricter privacy or uptime requirements should self-host approved fonts and map assets or configure a contracted tile provider.

## Verification

```bash
npm run lint
npm test
npm run build
npm run verify:data
npm audit --omit=dev
```

GitHub Actions runs the same checks on pushes and pull requests. Tests cover route validation, per-route XML counts, AIRAC propagation, fixed-record length and cycle placement, joined corridor topology, durable edits, audit logging, and rollback snapshots.

See [architecture.md](architecture.md) for the component and data flow, and [defects.md](defects.md) for the review history and the fixes applied.
