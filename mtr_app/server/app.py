"""
Lightweight REST API Server and Static Asset Handler for MTR Application.
Built on Python's native http.server BaseHTTPRequestHandler.
"""

import http.server
import socketserver
import json
import os
import urllib.parse
from typing import Optional, Any
from mtr_app.services.mtr_service import MTRService
from mtr_app.generators.arinc424_xml import validate_arinc424_xml

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")


class MTRRequestHandler(http.server.BaseHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.service = MTRService()
        super().__init__(*args, **kwargs)

    def do_OPTIONS(self):
        """Handle CORS pre-flight requests."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _send_json(self, data: Any, status: int = 200):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text: str, content_type: str = "text/plain; charset=utf-8", status: int = 200, filename: Optional[str] = None):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_static(self, rel_path: str):
        if rel_path == "" or rel_path == "/":
            rel_path = "/index.html"
        
        safe_path = os.path.normpath(rel_path.lstrip("/"))
        file_path = os.path.join(STATIC_DIR, safe_path)
        
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            self._send_json({"error": f"File '{rel_path}' not found"}, status=404)
            return

        mime_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml",
            ".json": "application/json"
        }
        ext = os.path.splitext(file_path)[1].lower()
        content_type = mime_types.get(ext, "application/octet-stream")

        try:
            with open(file_path, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self._send_json({"error": f"Failed to read file: {str(e)}"}, status=500)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path.rstrip("/")
        query = urllib.parse.parse_qs(parsed_url.query)

        # 1. API: List all routes
        if path == "/api/routes":
            route_type = query.get("type", [None])[0]
            routes = self.service.list_routes(route_type=route_type)
            self._send_json({"count": len(routes), "routes": routes})
            return

        # 2. API: Unified GeoJSON of all routes
        if path == "/api/all/geojson":
            geojson = self.service.get_all_routes_geojson()
            self._send_json(geojson)
            return

        # 3. API: Unified ARINC 424-23 XML of all routes
        if path == "/api/all/arinc424-xml":
            as_download = query.get("download", ["false"])[0].lower() == "true"
            filename = "ARINC424-23-MTR-ALL.xml" if as_download else None
            xml_str = self.service.get_arinc424_xml()
            self._send_text(xml_str, content_type="application/xml; charset=utf-8", filename=filename)
            return

        # 4. API: Unified ARINC 424 Fixed Records of all routes
        if path == "/api/all/arinc424-fixed":
            as_download = query.get("download", ["false"])[0].lower() == "true"
            filename = "ARINC424-MTR-ALL.dat" if as_download else None
            fixed_str = self.service.get_arinc424_fixed()
            self._send_text(fixed_str, content_type="text/plain; charset=utf-8", filename=filename)
            return

        # 5. API: Single route operations: /api/routes/<route_id>[/...]
        if path.startswith("/api/routes/"):
            parts = path.split("/")[3:]
            if len(parts) >= 1:
                route_id = urllib.parse.unquote(parts[0]).upper()
                sub_action = parts[1] if len(parts) > 1 else None

                # /api/routes/<route_id>
                if sub_action is None:
                    route = self.service.get_route_details(route_id)
                    if not route:
                        self._send_json({"error": f"Route '{route_id}' not found"}, status=404)
                    else:
                        self._send_json(route)
                    return

                # /api/routes/<route_id>/arinc424-xml
                if sub_action == "arinc424-xml":
                    as_download = query.get("download", ["false"])[0].lower() == "true"
                    filename = f"ARINC424-23-{route_id}.xml" if as_download else None
                    xml_str = self.service.get_arinc424_xml(route_id=route_id)
                    self._send_text(xml_str, content_type="application/xml; charset=utf-8", filename=filename)
                    return

                # /api/routes/<route_id>/arinc424-fixed
                if sub_action == "arinc424-fixed":
                    as_download = query.get("download", ["false"])[0].lower() == "true"
                    filename = f"ARINC424-{route_id}.dat" if as_download else None
                    fixed_str = self.service.get_arinc424_fixed(route_id=route_id)
                    self._send_text(fixed_str, content_type="text/plain; charset=utf-8", filename=filename)
                    return

                # /api/routes/<route_id>/geojson
                if sub_action == "geojson":
                    geojson = self.service.get_route_geojson(route_id)
                    if not geojson:
                        self._send_json({"error": f"Route '{route_id}' not found"}, status=404)
                    else:
                        self._send_json(geojson)
                    return

                # /api/routes/<route_id>/plain-english
                if sub_action == "plain-english":
                    brief = self.service.get_plain_english(route_id)
                    self._send_text(brief, content_type="text/plain; charset=utf-8")
                    return

        # 6. Serve static assets or index.html
        self._serve_static(parsed_url.path)

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path.rstrip("/")

        content_len = int(self.headers.get("Content-Length", 0))
        post_body = self.rfile.read(content_len)

        try:
            payload = json.loads(post_body.decode("utf-8")) if post_body else {}
        except json.JSONDecodeError:
            self._send_json({"error": "Malformed JSON payload"}, status=400)
            return

        # 1. API: Create or update route
        if path == "/api/routes":
            try:
                created = self.service.create_or_update_route(payload)
                self._send_json({"status": "success", "route": created}, status=201)
            except ValueError as ve:
                self._send_json({"error": str(ve)}, status=400)
            except Exception as e:
                self._send_json({"error": f"Failed to save route: {str(e)}"}, status=500)
            return

        # 2. API: Convert payload on-the-fly without database modification
        if path == "/api/convert":
            try:
                from mtr_app.generators.arinc424_xml import generate_single_route_xml, decode_to_plain_english
                from mtr_app.generators.arinc424_fixed import generate_mtr_fixed_records
                from mtr_app.generators.corridor_calc import generate_corridor_polygon

                xml_out = generate_single_route_xml(payload)
                fixed_lines = generate_mtr_fixed_records(payload)
                validation = validate_arinc424_xml(xml_out)
                plain_text = decode_to_plain_english(payload)
                corridor = generate_corridor_polygon(payload.get("segments", []))

                self._send_json({
                    "status": "success",
                    "validation": validation,
                    "arinc424_xml": xml_out,
                    "arinc424_fixed": "\n".join(fixed_lines),
                    "plain_english": plain_text,
                    "corridor_polygon": corridor
                })
            except Exception as e:
                self._send_json({"error": f"Conversion error: {str(e)}"}, status=400)
            return

        self._send_json({"error": "Endpoint not found"}, status=404)


def create_server(host: str = "127.0.0.1", port: int = 8080) -> socketserver.TCPServer:
    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.TCPServer((host, port), MTRRequestHandler)
    return server


def run_server(host: str = "127.0.0.1", port: int = 8080):
    server = create_server(host=host, port=port)
    print(f"🚀 MTR ARINC 424-23 Application Server listening on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()
