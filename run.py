#!/usr/bin/env python3
"""
Application Runner for eNASR to ARINC 424-23 MTR Explorer.
Starts the web application server or runs CLI conversions.
"""

import sys
import argparse
from mtr_app.server.app import run_server
import mtr_cli


def main():
    parser = argparse.ArgumentParser(
        description="eNASR to ARINC 424-23 MTR Application Runner",
        add_help=False
    )
    parser.add_argument("--port", type=int, default=8080, help="Port to bind web server (default: 8080)")
    parser.add_argument("--cli", action="store_true", help="Run CLI mode instead of web server")

    # If --cli or any CLI flag is present, pass to CLI
    if "--cli" in sys.argv or "--help" in sys.argv or "-h" in sys.argv or "--list" in sys.argv or "--validate" in sys.argv or "--format" in sys.argv:
        # Strip --cli if present
        if "--cli" in sys.argv:
            sys.argv.remove("--cli")
        mtr_cli.main()
    else:
        args, _ = parser.parse_known_args()
        print("=" * 65)
        print(" eNASR to ARINC 424-23 Military Training Route (MTR) Explorer")
        print("=" * 65)
        print(f" Web Dashboard: http://localhost:{args.port}")
        print(f" REST API Base: http://localhost:{args.port}/api/routes")
        print(f" Press Ctrl+C to terminate the server.")
        print("=" * 65)
        run_server(port=args.port)


if __name__ == "__main__":
    main()
