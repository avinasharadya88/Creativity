# Code Review Findings

Reviewed 2026-09-25 against commit `9788a75` (`main`). Severity reflects impact if the server is exposed using the public-tunnel instructions in the repository.

## Addressed immediately

| Severity | Finding | Resolution |
| --- | --- | --- |
| Critical | `POST /api/routes` accepted anonymous writes from any origin while the server listened on every interface. An attacker could replace route data and persist browser-executed markup for the lifetime of the process. | Writes now require `API_WRITE_TOKEN`, CORS is opt-in by allowlist, and the default bind address is localhost. |
| High | Route and waypoint fields were interpolated into `innerHTML` and Leaflet popup HTML, enabling stored DOM XSS. | Dynamic text is escaped and waypoint identifiers are constrained to an aviation-safe character set. |
| High | The supplied Supabase schema granted anonymous `INSERT`, `UPDATE`, and `DELETE` access to both route tables. | The migration now drops those public-write policies; writes must pass through a trusted backend. Existing deployments must rerun the policy-removal statements. |
| High | The conversion and save endpoints accepted missing, non-finite, or out-of-range coordinates, altitudes, widths, and segment structures. Invalid values could silently produce `NaN` geometry and corrupt ARINC/GeoJSON output. | Added bounded server-side validation, unique positive sequence checks, and payload/segment limits. |
| Medium | XML validation assigned the document-wide segment count to every route. | Counts are now calculated within each matched route element and covered by a regression test. |
| Medium | Request bodies were accepted up to 10 MB without a demonstrated need. | Reduced JSON and form limits to 1 MB. |
| Low | The production build mixed `import.meta` with CommonJS output and emitted compatibility warnings. | Standardized the bundle and start command on ESM. |
| High | A local-only `HOST=127.0.0.1` value propagated into Google AI Studio, preventing Cloud Run's startup probe from reaching port 3000. | Cloud Run is now detected through `K_SERVICE`, `HOST` is omitted from the example environment, and `gcp-build` produces the startup bundle. |
| Low | Responses lacked basic anti-sniffing/framing/referrer protections. | Added `nosniff`, `DENY` framing, and `no-referrer` headers. |

## Deferred / follow-up work

| Priority | Finding | Recommended action |
| --- | --- | --- |
| P1 | The implementation is now TypeScript/Express and stores edits only in an in-memory `Map`, but the README, PRD, and architecture documents describe a missing Python server/CLI/test suite plus Supabase + SQLite persistence. Restarting the current server loses all edits. | Decide which architecture is authoritative. Implement durable storage in the Node service or restore the documented Python components, then rewrite the docs and deployment steps. |
| P1 | The ARINC output is described as “424-23 compliant,” but validation is string/regex checking rather than validation against an authoritative XSD or conformance suite. Fixed-width field positions also lack specification-backed tests. | Add licensed/authoritative schema and record-layout conformance tests; label current output as experimental until verified. |
| P1 | AIRAC cycle `2609` is hard-coded in code and UI. It will become stale and may mislabel exports. | Load cycle metadata from the imported dataset/config and reject exports when the cycle is absent or inconsistent. |
| P2 | There is no rate limiting, audit log, write history, or durable rollback for route changes. | Add authenticated identities/roles, per-route audit records, request throttling, and versioned persistence before multi-user deployment. |
| P2 | Corridor polygons offset each leg independently and join the offsets directly. Sharp turns can create gaps, overlaps, or self-intersections; there is no geometry-validity check. | Use a geodesic buffer/join algorithm and validate polygon topology before export. |
| P2 | The repository has no CI workflow and originally had no executable tests despite documentation claiming 13 passing tests. | Add CI for type checking, tests, build, dependency audit, and generated-output fixtures. |
| P3 | External map tiles, fonts, and Leaflet are runtime CDN dependencies. Only Leaflet has SRI; fonts/tiles reveal client IP and availability is external. | Document the privacy/availability tradeoff or self-host approved assets. |
| P3 | `enasr-mtr-routes.json` and `.geojson` are duplicate content, and a binary SQLite database is committed without a reproducible provenance/checksum workflow. | Choose canonical source data, generate derivatives in CI, and publish provenance plus checksums. |

## Verification performed

- TypeScript strict type check (`npm run lint`)
- Production ESM bundle (`npm run build`)
- Node regression tests (`npm test`)
- Production dependency audit (`npm audit --omit=dev`; zero known vulnerabilities at review time)
