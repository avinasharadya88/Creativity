"""
Unit Tests for ARINC 424-23 XML Generation and Validation.
"""

import unittest
import xml.etree.ElementTree as ET
from mtr_app.services.mtr_service import MTRService
from mtr_app.generators.arinc424_xml import (
    generate_arinc424_xml,
    generate_single_route_xml,
    validate_arinc424_xml,
    decode_to_plain_english
)


class TestARINC424XML(unittest.TestCase):
    def setUp(self):
        self.service = MTRService()

    def test_generate_single_route_xml(self):
        route = self.service.get_route_details("IR-102")
        self.assertIsNotNone(route)

        xml_str = generate_single_route_xml(route)
        self.assertIn("<Arinc424Data", xml_str)
        self.assertIn('version="424-23"', xml_str)
        self.assertIn("<MilitaryTrainingRoute", xml_str)
        self.assertIn("<RouteDesignator>IR-102</RouteDesignator>", xml_str)
        self.assertIn("<RouteType>IFR_MILITARY_TRAINING_ROUTE</RouteType>", xml_str)
        self.assertIn("<PointIdentifier>PT_A_ENTRY</PointIdentifier>", xml_str)
        self.assertIn("<PathTerminator>IF</PathTerminator>", xml_str)
        self.assertIn("<CorridorDimensions>", xml_str)
        self.assertIn("<LeftWidth unit=\"NM\">5.0</LeftWidth>", xml_str)

        # Parse with standard ElementTree
        root = ET.fromstring(xml_str)
        self.assertEqual(root.get("version"), "424-23")
        self.assertEqual(root.get("cycle"), "2609")

        route_node = root.find(".//MilitaryTrainingRoute")
        self.assertIsNotNone(route_node)
        self.assertEqual(route_node.get("id"), "IR-102")

        segments = route_node.findall(".//Segment")
        self.assertGreaterEqual(len(segments), 2)

    def test_xml_validation_helper(self):
        route = self.service.get_route_details("VR-223")
        self.assertIsNotNone(route)

        xml_str = generate_single_route_xml(route)
        val_res = validate_arinc424_xml(xml_str)

        self.assertTrue(val_res["valid"])
        self.assertEqual(val_res["version"], "424-23")
        self.assertEqual(val_res["route_count"], 1)
        self.assertEqual(val_res["routes"][0]["route_id"], "VR-223")

    def test_all_routes_xml(self):
        xml_str = self.service.get_arinc424_xml()
        val_res = validate_arinc424_xml(xml_str)

        self.assertTrue(val_res["valid"])
        self.assertGreaterEqual(val_res["route_count"], 3)

    def test_decode_to_plain_english(self):
        route = self.service.get_route_details("IR-102")
        brief = decode_to_plain_english(route)

        self.assertIn("MILITARY TRAINING ROUTE OPERATIONAL BRIEF: IR-102", brief)
        self.assertIn("Altitude Envelope", brief)
        self.assertIn("Corridor Width", brief)
        self.assertIn("PT_A_ENTRY", brief)
        self.assertIn("Total Route Distance", brief)


if __name__ == "__main__":
    unittest.main()
