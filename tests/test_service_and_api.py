"""
Unit and Integration Tests for MTR Service and HTTP REST API.
"""

import unittest
import threading
import urllib.request
import json
from mtr_app.services.mtr_service import MTRService
from mtr_app.server.app import create_server


class TestServiceAndAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Start server on an ephemeral/test port
        cls.port = 8899
        cls.server = create_server(port=cls.port)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://localhost:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.service = MTRService()

    def test_service_list_and_details(self):
        routes = self.service.list_routes()
        self.assertGreaterEqual(len(routes), 3)

        ir_routes = self.service.list_routes(route_type="IR")
        self.assertTrue(all(r["route_type"] == "IR" for r in ir_routes))

        ir102 = self.service.get_route_details("IR-102")
        self.assertIsNotNone(ir102)
        self.assertEqual(ir102["route_id"], "IR-102")
        self.assertIn("corridor_polygon", ir102)
        self.assertGreater(len(ir102["corridor_polygon"]), 0)

    def test_service_geojson(self):
        geojson = self.service.get_route_geojson("IR-102")
        self.assertEqual(geojson["type"], "FeatureCollection")
        self.assertEqual(geojson["route_id"], "IR-102")
        
        feature_types = [f["properties"]["feature_type"] for f in geojson["features"]]
        self.assertIn("CENTERLINE", feature_types)
        self.assertIn("CORRIDOR_RIBBON", feature_types)
        self.assertIn("WAYPOINT", feature_types)

    def test_api_get_routes(self):
        url = f"{self.base_url}/api/routes"
        with urllib.request.urlopen(url) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertIn("count", data)
            self.assertGreaterEqual(data["count"], 3)

    def test_api_get_single_route(self):
        url = f"{self.base_url}/api/routes/IR-102"
        with urllib.request.urlopen(url) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertEqual(data["route_id"], "IR-102")
            self.assertIn("segments", data)

    def test_api_get_xml(self):
        url = f"{self.base_url}/api/routes/IR-102/arinc424-xml"
        with urllib.request.urlopen(url) as response:
            self.assertEqual(response.status, 200)
            content = response.read().decode("utf-8")
            self.assertIn("<MilitaryTrainingRoute", content)
            self.assertIn("IR-102", content)

    def test_api_get_fixed(self):
        url = f"{self.base_url}/api/routes/IR-102/arinc424-fixed"
        with urllib.request.urlopen(url) as response:
            self.assertEqual(response.status, 200)
            content = response.read().decode("utf-8")
            lines = content.strip().split("\n")
            for line in lines:
                self.assertEqual(len(line), 132)

    def test_api_convert_endpoint(self):
        url = f"{self.base_url}/api/convert"
        payload = {
            "route_id": "TEST-999",
            "route_type": "IR",
            "route_name": "Test Conversion Route",
            "originating_agency": "USAF Test",
            "artcc_facility": "ZLA",
            "floor_alt_ft": 500,
            "ceiling_alt_ft": 8000,
            "route_width_nm": 8.0,
            "segments": [
                {
                    "sequence_num": 1,
                    "point_name": "TEST_A",
                    "point_type": "ENTRY",
                    "latitude_dec": 35.0,
                    "longitude_dec": -118.0,
                    "next_point_name": "TEST_B",
                    "next_lat_dec": 35.5,
                    "next_lon_dec": -117.5,
                    "min_alt_ft": 500,
                    "max_alt_ft": 8000,
                    "width_left_nm": 4.0,
                    "width_right_nm": 4.0
                }
            ]
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))
            self.assertTrue(data["validation"]["valid"])
            self.assertIn("<MilitaryTrainingRoute", data["arinc424_xml"])
            self.assertIn("TEST-999", data["plain_english"])


if __name__ == "__main__":
    unittest.main()
