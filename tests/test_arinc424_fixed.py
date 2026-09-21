"""
Unit Tests for ARINC 424 Fixed-Width (132-character) Records.
"""

import unittest
from mtr_app.services.mtr_service import MTRService
from mtr_app.generators.arinc424_fixed import (
    generate_mtr_fixed_records,
    RECORD_LENGTH
)


class TestARINC424Fixed(unittest.TestCase):
    def setUp(self):
        self.service = MTRService()

    def test_record_length_exactly_132_bytes(self):
        routes = ["IR-102", "VR-223", "SR-301"]
        for r_id in routes:
            route = self.service.get_route_details(r_id)
            self.assertIsNotNone(route)

            records = generate_mtr_fixed_records(route)
            self.assertGreater(len(records), 0)

            for idx, line in enumerate(records):
                self.assertEqual(
                    len(line),
                    RECORD_LENGTH,
                    f"Route {r_id} record #{idx} length is {len(line)}, expected {RECORD_LENGTH}: '{line}'"
                )
                # Check record type 'S' (Standard)
                self.assertEqual(line[0], "S")
                # Check section code 'U' (Col 5)
                self.assertEqual(line[4], "U")
                # Check subsection code 'R' (Col 6)
                self.assertEqual(line[5], "R")
                # Check cycle '2609' at end
                self.assertTrue(line.endswith("2609"))


if __name__ == "__main__":
    unittest.main()
