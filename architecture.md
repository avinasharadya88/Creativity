# MTR app architecture

## Runtime

One Node.js process serves the application:

```text
Browser
  |  static HTML, CSS, and JavaScript
  |  JSON, XML, text, and GeoJSON requests
  v
Express server (server.ts)
  |
  +-- MTRService
  |     +-- initial_routes.json
  |     +-- .data/routes.json
  |     +-- .data/history/<route-id>/*.json
  |     +-- .data/audit.jsonl
  |
  +-- XML and fixed-record generators
  +-- corridor and coordinate calculations
```

The earlier Python, Supabase, and dual SQLite design is not part of the current repository. `server.ts` is the only HTTP entry point. The reference SQLite and SQL files are retained for provenance and are not used at runtime.

## Startup and route loading

`MTRService` reads the four-digit AIRAC cycle from `AIRAC_CYCLE` or `metadata.json`. Startup fails if the value is missing or invalid.

The service then loads `initial_routes.json`, which is the canonical checked-in dataset. When `.data/routes.json` exists, its routes are loaded over the bundled data. This preserves edits and additions across process restarts.

## Writes, history, and rollback

`POST /api/routes` validates identifiers, route types, coordinates, altitude ranges, widths, sequence numbers, and waypoint counts. A successful write follows this order:

1. Save the previous route as a version when it already exists.
2. Enrich the submitted route with distances, bearings, coordinate formats, and corridor geometry.
3. Write the complete route collection to a temporary file.
4. Atomically rename the temporary file to `.data/routes.json`.
5. Append an audit event with the route, action, actor fingerprint, and timestamp.

`GET /api/routes/:routeId/versions` lists saved versions. `POST /api/routes/:routeId/rollback` restores one of them, saves the route being replaced as a new version, persists the result, and writes an audit event.

The actor value contains the client address and a short SHA-256 fingerprint of the supplied credential. The credential itself is never logged.

## Export generation

The XML and fixed-width generators receive the cycle from `MTRService`. Routes from different cycles cannot be combined. The XML validator checks the document shape, version, cycle, route count, and per-route segment counts. Fixed records are tested for their 132-character length and cycle field placement.

These checks detect application regressions. They are not a replacement for an authoritative ARINC 424-23 schema or licensed conformance tooling, so the UI and generated brief call the mapping experimental.

## Corridor geometry

The corridor generator builds geodesic offsets at each centerline vertex. Interior points use a capped miter join derived from the incoming and outgoing bearings, which closes the gaps created by independent leg offsets. The resulting ring must be closed, finite, free of zero-length edges, and free of non-adjacent edge intersections. Invalid geometry stops the save or conversion instead of reaching GeoJSON output.

## Browser layout and map behavior

The dashboard uses three CSS grid tracks with `minmax(0, 1fr)` and explicit `min-width: 0` constraints. This prevents the map toolbar from expanding the center track and pushing the inspector outside the viewport. Inspector tabs and the legs table scroll inside the right panel when their content is wider than the panel.

The OSM layer uses the standard tile URL with visible attribution. The response policy `strict-origin-when-cross-origin` lets the tile request identify the app without revealing its path. Repeated OSM tile failures switch the map to Esri satellite imagery and display an in-app warning.

## Security controls

Network deployments require `API_WRITE_TOKEN` for writes. Localhost development can write without a token. The server also applies a one-megabyte body limit, write rate limiting, exact-origin CORS configuration, constant-time token comparison, route field validation, HTML escaping, `nosniff`, `DENY` framing, and a restricted referrer policy.

## Build and deployment

`npm run build` bundles the server to `dist/server.js` as ESM. `npm start` runs that bundle. The server honors `PORT` and defaults to `0.0.0.0`, as required by Cloud Run. Operators can set `BIND_HOST=127.0.0.1` for loopback-only local development. The generic `HOST` variable is ignored because Google AI Studio supplies `HOST=MTRAPP` as an application label; attempting to bind to it causes a DNS lookup failure before the health probe can connect.

The runtime data directory must point to durable storage in deployments where edits must survive instance replacement.
