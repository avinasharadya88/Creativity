#!/usr/bin/env python3
"""
MTR Command Line Interface (CLI).
Translates eNASR Military Training Route data into ARINC 424-23 XML,
ARINC 424 132-character fixed records, GeoJSON, and plain-English briefs.
"""

import argparse
import sys
import os
import json
from mtr_app.services.mtr_service import MTRService
from mtr_app.generators.arinc424_xml import validate_arinc424_xml


def main():
    parser = argparse.ArgumentParser(
        description="eNASR to ARINC 424-23 Military Training Route (MTR) Converter CLI"
    )
    parser.add_argument(
        "--db",
        type=str,
        default=None,
        help="Path to eNASR SQLite database (defaults to enasr-geospatial.db)"
    )
    parser.add_argument(
        "--route",
        type=str,
        default=None,
        help="Specific Route ID (e.g., IR-102, VR-223, SR-301). If omitted, processes all routes."
    )
    parser.add_argument(
        "--format",
        choices=["xml", "fixed", "geojson", "text", "all"],
        default="xml",
        help="Target output format: xml (ARINC 424-23 XML), fixed (ARINC 424 132-column), geojson, text (brief), or all"
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help="Output file or directory path. If omitted, outputs to stdout."
    )
    parser.add_argument(
        "--validate",
        type=str,
        default=None,
        help="Validate an ARINC 424-23 XML file against specification schema."
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all MTR routes in the database."
    )

    args = parser.parse_args()

    # Mode 1: Validation
    if args.validate:
        if not os.path.exists(args.validate):
            print(f"Error: File '{args.validate}' not found.", file=sys.stderr)
            sys.exit(1)
        with open(args.validate, "r", encoding="utf-8") as f:
            content = f.read()
        res = validate_arinc424_xml(content)
        if res["valid"]:
            print(f"✓ Valid ARINC 424-23 XML!")
            print(f"  Version: {res.get('version')} | Cycle: {res.get('cycle')}")
            print(f"  Total Routes: {res.get('route_count')}")
            for r in res.get("routes", []):
                print(f"    - {r['route_id']} ({r['status']}): {r['segment_count']} segments")
            sys.exit(0)
        else:
            print(f"✗ Validation Failed: {res.get('error')}", file=sys.stderr)
            sys.exit(1)

    service = MTRService(db_path=args.db)

    # Mode 2: List Routes
    if args.list:
        routes = service.list_routes()
        print(f"\nFound {len(routes)} Military Training Routes in eNASR database:\n")
        print(f"{'ROUTE ID':<10} {'TYPE':<6} {'STATUS':<8} {'WAYPOINTS':<10} {'ALTITUDE SPAN':<22} {'MANAGING UNIT'}")
        print("-" * 80)
        for r in routes:
            alt_span = f"{r.get('floor_alt_ft', 0):,} - {r.get('ceiling_alt_ft', 0):,} ft"
            print(f"{r.get('route_id'):<10} {r.get('route_type'):<6} {r.get('status', 'ACTIVE'):<8} {r.get('waypoint_count', 0):<10} {alt_span:<22} {r.get('originating_agency')}")
        print()
        sys.exit(0)

    # Mode 3: Conversion / Export
    route_id = args.route.upper() if args.route else None

    outputs = {}
    if args.format in ["xml", "all"]:
        outputs["xml"] = service.get_arinc424_xml(route_id=route_id)
    if args.format in ["fixed", "all"]:
        outputs["fixed"] = service.get_arinc424_fixed(route_id=route_id)
    if args.format in ["geojson", "all"]:
        if route_id:
            outputs["geojson"] = json.dumps(service.get_route_geojson(route_id), indent=2)
        else:
            outputs["geojson"] = json.dumps(service.get_all_routes_geojson(), indent=2)
    if args.format in ["text", "all"]:
        if route_id:
            outputs["text"] = service.get_plain_english(route_id)
        else:
            briefs = [service.get_plain_english(r["route_id"]) for r in service.list_routes()]
            outputs["text"] = "\n\n".join(briefs)

    # Output routing
    prefix = route_id or "ALL_MTR"

    if args.output:
        if args.format == "all" or os.path.isdir(args.output):
            out_dir = args.output
            os.makedirs(out_dir, exist_ok=True)
            for fmt, content in outputs.items():
                ext = {"xml": "xml", "fixed": "dat", "geojson": "geojson", "text": "txt"}.get(fmt, "txt")
                filepath = os.path.join(out_dir, f"{prefix}-ARINC424.{ext}")
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"Saved: {filepath}")
        else:
            # Single file output
            content = list(outputs.values())[0]
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Saved: {args.output}")
    else:
        # Standard Output
        for fmt, content in outputs.items():
            if len(outputs) > 1:
                print(f"\n--- FORMAT: {fmt.upper()} ---")
            print(content)


if __name__ == "__main__":
    main()
