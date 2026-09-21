"""
Unit Tests for Geospatial Calculations and Corridor Ribbon Generation.
"""

import unittest
from mtr_app.generators.corridor_calc import (
    calculate_bearing,
    calculate_distance_nm,
    destination_point,
    to_arinc_dms,
    to_human_dms,
    generate_corridor_polygon
)


class TestCorridorCalc(unittest.TestCase):
    def test_distance_and_bearing(self):
        # Edwards AFB (approx 34.9056, -117.8821) to Point B (35.1211, -117.3811)
        lat1, lon1 = 34.9056, -117.8821
        lat2, lon2 = 35.1211, -117.3811

        dist = calculate_distance_nm(lat1, lon1, lat2, lon2)
        bearing = calculate_bearing(lat1, lon1, lat2, lon2)

        self.assertGreater(dist, 25.0)
        self.assertLess(dist, 40.0)
        # Bearing should be northeast (between 30 and 80 degrees)
        self.assertGreater(bearing, 30.0)
        self.assertLess(bearing, 80.0)

    def test_destination_point(self):
        lat1, lon1 = 35.0, -118.0
        # Offset 10 NM due East (90 deg)
        dest_lat, dest_lon = destination_point(lat1, lon1, 10.0, 90.0)
        self.assertAlmostEqual(dest_lat, 35.0, places=1)
        self.assertGreater(dest_lon, lon1)

    def test_arinc_and_human_dms(self):
        lat = 34.9056
        lon = -117.8821

        arinc_lat, arinc_lon = to_arinc_dms(lat, lon)
        # Latitude should end with N and be 9 chars (DDMMSSssH or 8 digits + N)
        self.assertTrue(arinc_lat.endswith("N"))
        self.assertEqual(len(arinc_lat), 9)

        # Longitude should end with W and be 10 chars (DDDMMSSssH)
        self.assertTrue(arinc_lon.endswith("W"))
        self.assertEqual(len(arinc_lon), 10)

        human_lat, human_lon = to_human_dms(lat, lon)
        self.assertIn("°", human_lat)
        self.assertIn("N", human_lat)
        self.assertIn("W", human_lon)

    def test_corridor_polygon_generation(self):
        segments = [
            {
                "latitude_dec": 34.9056,
                "longitude_dec": -117.8821,
                "next_lat_dec": 35.1211,
                "next_lon_dec": -117.3811,
                "width_left_nm": 5.0,
                "width_right_nm": 5.0
            },
            {
                "latitude_dec": 35.1211,
                "longitude_dec": -117.3811,
                "next_lat_dec": 35.4512,
                "next_lon_dec": -116.8912,
                "width_left_nm": 5.0,
                "width_right_nm": 5.0
            }
        ]

        polygon = generate_corridor_polygon(segments)
        self.assertGreater(len(polygon), 4)
        # Closed ring check: first and last point must match
        self.assertEqual(polygon[0], polygon[-1])


if __name__ == "__main__":
    unittest.main()
