# Military Training Route explorer: product requirements

## Purpose

The application helps an aviation data analyst inspect Military Training Route records, review route geometry and altitude limits, make controlled corrections, and produce several engineering export formats from one normalized route model.

The output is intended for analysis and review. ARINC XML and fixed records remain experimental until they pass a licensed, authoritative conformance process.

## Source data

The checked-in demo dataset contains 25 routes from AIRAC cycle 2609. `initial_routes.json` is the canonical source and `metadata.json` identifies its cycle and effective dates. The page and every export must display or embed the cycle supplied by metadata. The service must refuse export when cycle metadata is absent, malformed, or inconsistent.

## Main user flows

### Inspect a route

The user can search and filter routes by designator, type, agency, or ARTCC. Selecting a route updates the summary, map, altitude profile, XML preview, fixed records, operational brief, and leg table.

The map supports satellite and OpenStreetMap layers. Each external layer must retain its required attribution. OSM requests must identify the application according to the tile service policy. When OSM repeatedly fails, the app must switch to the satellite layer and explain what happened.

### Create or edit a route

The user can enter route metadata and two or more sequenced waypoints, or paste a compatible JSON or GeoJSON object. The backend validates the entire payload before saving it. It rejects unsupported identifiers, duplicate or invalid sequences, non-finite coordinates, out-of-range coordinates, invalid altitude envelopes, invalid widths, and invalid corridor topology.

Each successful edit must survive a process restart. The previous route must remain available as a rollback version, and the service must append an audit event without recording the secret token.

### Export a route

The user can download one route or all routes as:

- experimental ARINC 424-23 XML
- experimental 132-character fixed records
- GeoJSON
- a plain-language operational brief

Structural XML validation must report each route's own segment count. Fixed records must contain exactly 132 characters, with the configured AIRAC cycle in the final four positions.

## Layout requirements

The three dashboard panels must remain inside the browser viewport. Content in the center toolbar must not increase the grid's minimum width. The inspector tabs and leg table may scroll horizontally inside the right panel, but they must not create page-level horizontal overflow.

At narrower desktop sizes, secondary map labels may be hidden to preserve the working area. Core route selection, map controls, inspector tabs, and export controls must remain accessible.

## Security and operational requirements

- The service honors `PORT` and defaults to `0.0.0.0`, as required by Cloud Run.
- Local development can be restricted to loopback with `HOST=127.0.0.1`.
- Network deployments disable writes until `API_WRITE_TOKEN` is configured.
- The server accepts no more than 30 write requests per client address per minute.
- Request bodies are limited to one megabyte.
- CORS is disabled unless the operator supplies an exact allowlist.
- Dynamic route text is escaped before insertion into HTML.
- The service sends `nosniff`, `DENY` framing, and `strict-origin-when-cross-origin` response policies.

## Persistence and deployment

The default writable files are `.data/routes.json`, `.data/audit.jsonl`, and `.data/history/`. Operators can replace those paths with environment variables. A hosted instance must mount durable storage if edits need to survive instance replacement.

The committed SQLite database and the two small `enasr-mtr-routes.*` files are reference artifacts. They are covered by `data-manifest.json` checksums and are not runtime stores.

## Acceptance checks

The change is ready when all of these commands pass:

```bash
npm run lint
npm test
npm run build
npm run verify:data
npm audit --omit=dev
```

GitHub Actions must run the same checks for pushes and pull requests.
