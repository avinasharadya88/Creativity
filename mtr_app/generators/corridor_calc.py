"""
Geospatial Corridor and Geodesy Calculation Module for Military Training Routes.
Computes bearings, distances, perpendicular corridor boundary polygons, and coordinate conversions.
"""

import math
from typing import List, Tuple, Dict, Any

EARTH_RADIUS_NM = 3440.065  # WGS-84 mean radius in Nautical Miles


def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates initial great-circle bearing from (lat1, lon1) to (lat2, lon2) in degrees (0-360).
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    theta = math.atan2(y, x)
    bearing = (math.degrees(theta) + 360.0) % 360.0
    return round(bearing, 2)


def calculate_distance_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates great-circle distance between two points in Nautical Miles using Haversine formula.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    distance = EARTH_RADIUS_NM * c
    return round(distance, 2)


def destination_point(lat: float, lon: float, distance_nm: float, bearing_deg: float) -> Tuple[float, float]:
    """
    Calculates destination point given start point, distance (NM), and bearing (degrees).
    Returns (lat, lon) in decimal degrees.
    """
    delta = distance_nm / EARTH_RADIUS_NM
    theta = math.radians(bearing_deg)
    phi1 = math.radians(lat)
    lambda1 = math.radians(lon)

    phi2 = math.asin(
        math.sin(phi1) * math.cos(delta) +
        math.cos(phi1) * math.sin(delta) * math.cos(theta)
    )
    lambda2 = lambda1 + math.atan2(
        math.sin(theta) * math.sin(delta) * math.cos(phi1),
        math.cos(delta) - math.sin(phi1) * math.sin(phi2)
    )

    # Normalize longitude to -180..+180
    lon_deg = (math.degrees(lambda2) + 540.0) % 360.0 - 180.0
    lat_deg = math.degrees(phi2)
    return (round(lat_deg, 6), round(lon_deg, 6))


def to_arinc_dms(lat: float, lon: float) -> Tuple[str, str]:
    """
    Converts decimal lat/lon into ARINC 424 standard coordinate representations:
    Latitude: DDMMSSss[N|S] e.g. '34542016N' (34 deg, 54 min, 20.16 sec N)
    Longitude: DDDMMSSss[E|W] e.g. '117525556W' (117 deg, 52 min, 55.56 sec W)
    """
    # Latitude
    lat_hem = "N" if lat >= 0 else "S"
    lat_abs = abs(lat)
    lat_deg = int(lat_abs)
    lat_rem = (lat_abs - lat_deg) * 60.0
    lat_min = int(lat_rem)
    lat_sec = (lat_rem - lat_min) * 60.0
    lat_sec_int = int(round(lat_sec * 100))
    if lat_sec_int >= 6000:
        lat_sec_int = 0
        lat_min += 1
    lat_str = f"{lat_deg:02d}{lat_min:02d}{lat_sec_int:04d}{lat_hem}"

    # Longitude
    lon_hem = "E" if lon >= 0 else "W"
    lon_abs = abs(lon)
    lon_deg = int(lon_abs)
    lon_rem = (lon_abs - lon_deg) * 60.0
    lon_min = int(lon_rem)
    lon_sec = (lon_rem - lon_min) * 60.0
    lon_sec_int = int(round(lon_sec * 100))
    if lon_sec_int >= 6000:
        lon_sec_int = 0
        lon_min += 1
    lon_str = f"{lon_deg:03d}{lon_min:02d}{lon_sec_int:04d}{lon_hem}"

    return (lat_str, lon_str)


def to_human_dms(lat: float, lon: float) -> Tuple[str, str]:
    """
    Converts decimal lat/lon into human-readable DMS string:
    e.g. 34° 54' 20.16\" N, 117° 52' 55.56\" W
    """
    lat_hem = "N" if lat >= 0 else "S"
    lat_abs = abs(lat)
    lat_deg = int(lat_abs)
    lat_rem = (lat_abs - lat_deg) * 60.0
    lat_min = int(lat_rem)
    lat_sec = round((lat_rem - lat_min) * 60.0, 2)
    lat_str = f"{lat_deg:02d}° {lat_min:02d}' {lat_sec:05.2f}\" {lat_hem}"

    lon_hem = "E" if lon >= 0 else "W"
    lon_abs = abs(lon)
    lon_deg = int(lon_abs)
    lon_rem = (lon_abs - lon_deg) * 60.0
    lon_min = int(lon_rem)
    lon_sec = round((lon_rem - lon_min) * 60.0, 2)
    lon_str = f"{lon_deg:03d}° {lon_min:02d}' {lon_sec:05.2f}\" {lon_hem}"

    return (lat_str, lon_str)


def generate_corridor_polygon(segments: List[Dict[str, Any]]) -> List[List[float]]:
    """
    Generates a closed polygon ring [ [lon, lat], ... ] representing the corridor
    ribbon around the route centerline based on left/right widths in NM.
    """
    if not segments:
        return []

    # Build sequence of ordered waypoints and segment widths
    # For N segments, we have N+1 waypoints (or N legs)
    left_points = []
    right_points = []

    for i, seg in enumerate(segments):
        lat1 = seg.get("latitude_dec")
        lon1 = seg.get("longitude_dec")
        lat2 = seg.get("next_lat_dec")
        lon2 = seg.get("next_lon_dec")

        # If next point is not in segment row, check next segment or use course
        if lat2 is None or lon2 is None:
            if i + 1 < len(segments):
                lat2 = segments[i + 1].get("latitude_dec")
                lon2 = segments[i + 1].get("longitude_dec")
            else:
                # Last segment with no next coords, continue with previous bearing
                break

        width_left = seg.get("width_left_nm", 5.0) or 5.0
        width_right = seg.get("width_right_nm", 5.0) or 5.0

        course = calculate_bearing(lat1, lon1, lat2, lon2)
        bearing_left = (course - 90.0) % 360.0
        bearing_right = (course + 90.0) % 360.0

        # Start of segment offsets
        start_left = destination_point(lat1, lon1, width_left, bearing_left)
        start_right = destination_point(lat1, lon1, width_right, bearing_right)

        # End of segment offsets
        end_left = destination_point(lat2, lon2, width_left, bearing_left)
        end_right = destination_point(lat2, lon2, width_right, bearing_right)

        left_points.append(start_left)
        if i == len(segments) - 1 or (i + 1 < len(segments) and segments[i + 1].get("next_lat_dec") is None):
            left_points.append(end_left)

        right_points.append(start_right)
        if i == len(segments) - 1 or (i + 1 < len(segments) and segments[i + 1].get("next_lat_dec") is None):
            right_points.append(end_right)

    if not left_points or not right_points:
        return []

    # Form closed polygon: left boundary forward, then right boundary in reverse, closing at start
    polygon_coords = []
    for lat, lon in left_points:
        polygon_coords.append([lon, lat])

    for lat, lon in reversed(right_points):
        polygon_coords.append([lon, lat])

    # Close ring
    if polygon_coords:
        polygon_coords.append(polygon_coords[0])

    return polygon_coords
