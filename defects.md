# Defect status

Updated 2026-09-28 on branch `codex/fix-map-layout-defects`.

## Fixes in this change

| Priority | Defect | Fix and verification |
| --- | --- | --- |
| P1 | OpenStreetMap returned repeated 403 policy tiles. | The server had set `Referrer-Policy: no-referrer`, which removed the application identity required by the OSM tile policy. The policy is now `strict-origin-when-cross-origin`, Leaflet attribution is visible, and three tile failures trigger a satellite fallback with an in-app warning. |
| P1 | The Google AI Studio Cloud Run revision failed its startup probe because the listener's `0.0.0.0` binding depended on the optional `K_SERVICE` variable. | The server now honors `PORT` and defaults to `0.0.0.0` without relying on platform-identification variables. Port values are validated before startup, and network writes remain disabled without `API_WRITE_TOKEN` because the exception now checks the request's actual loopback address. A production-bundle smoke test verifies `/api/health` on `PORT=3000`. |
| P1 | The center controls forced the CSS grid wider than the viewport, pushing the inspector and Legs Table outside the page. | Grid tracks now use constrained `minmax` sizing, every panel can shrink with `min-width: 0`, inspector tabs scroll within the panel, and the table uses its own horizontal scroller. Narrow desktop breakpoints hide secondary labels before they can expand the page. |
| P1 | Route edits existed only in an in-memory `Map` and disappeared on restart. The documentation described a Python, Supabase, and SQLite runtime that was not present. | The Node service now writes `.data/routes.json` atomically and reloads it at startup. `README.md`, `architecture.md`, and `MTR_PRD.md` now describe the code and deployment model in this repository. |
| P1 | AIRAC cycle `2609` was hard-coded in generators and HTML. | `metadata.json` is the source of the cycle, with an optional `AIRAC_CYCLE` override. The API supplies the page badge and passes the cycle to all exports. Missing, malformed, or mixed cycle metadata stops generation. Regression tests verify XML propagation and fixed-record positions 129 through 132. |
| P1 | The UI described the ARINC output as compliant even though validation used application-level checks and no authoritative schema was available. | The UI, brief, README, architecture, and product requirements now call the output experimental. Structural checks remain in place and fixed-field regression tests were added. Final certification still requires a licensed ARINC schema or conformance suite supplied by the operator. |
| P2 | There was no rate limiting, audit trail, write history, or rollback. | Write endpoints are limited to 30 requests per client address per minute. Updates save the previous route under `.data/history/`, audit events go to `.data/audit.jsonl`, and version listing and rollback endpoints are available. Audit identities use a short credential fingerprint and never store the credential. |
| P2 | Corridor legs were offset independently, which left gaps at turns and allowed invalid polygon output. | The generator now computes capped geodesic miter joins at centerline vertices. It validates closure, finite coordinates, zero-length edges, and non-adjacent edge intersections before a route can be saved or exported. |
| P2 | The repository had no CI workflow, and `package.json` no longer exposed the test or lint commands named in the documentation. | The scripts were restored, eight Node regression tests run through `npm test`, and `.github/workflows/ci.yml` runs install, type checking, tests, build, data verification, and a production dependency audit. |
| P3 | Runtime map, font, and Leaflet dependencies were undocumented, and the map hid required provider attribution. | Attribution is visible again. The README explains client IP and availability implications, the providers in use, and the self-hosting or contracted-provider option for stricter deployments. |
| P3 | Search crawlers received `404` for `/robots.txt`, producing a Cloud Run warning. | The app now serves an explicit plain-text crawler policy at `/robots.txt`; the same policy is present in the static assets for hosting environments that serve the frontend directly. |
| P3 | Duplicate sample files and the committed SQLite database had no declared source of truth or checksum process. | `initial_routes.json` is now declared canonical. `data-manifest.json` records the role and SHA-256 hash of each reference artifact, and `npm run verify:data` checks them locally and in CI. |

## Earlier security fixes retained

| Severity | Finding | Current state |
| --- | --- | --- |
| Critical | Anonymous network writes and permissive cross-origin access. | Network writes require `API_WRITE_TOKEN`; local development stays on loopback by default; CORS uses an explicit allowlist. |
| High | Stored DOM XSS through route and waypoint fields. | Dynamic text is escaped and waypoint identifiers use a restricted aviation-safe character set. |
| High | Anonymous Supabase table writes in the reference schema. | Public write policies are removed from `supabase-schema.sql`; Supabase is not used by the running service. |
| High | Missing bounds checks for coordinates, altitudes, widths, and segment structure. | Server-side validation covers all values and collection limits. |
| Medium | XML validation reported a document-wide segment count for every route. | Each route body is counted separately and covered by a regression test. |
| Medium | Request bodies allowed 10 MB. | JSON and form bodies are limited to 1 MB. |
| Low | The production build mixed ESM and CommonJS behavior. | esbuild emits an ESM bundle and `npm start` runs `dist/server.js`. |
| Low | Basic response protections were missing or had regressed. | Responses send `nosniff`, `DENY` framing, and a referrer policy that is compatible with OSM identification. |

## Verification completed

- `npm run lint`
- `npm test` with 8 passing tests
- `npm run build`
- `npm run verify:data`
- `npm audit --omit=dev` with zero known vulnerabilities at the time of this update

The authoritative ARINC certification dependency is intentionally recorded as an external requirement. The application no longer claims that its internal structural checks provide that certification.
