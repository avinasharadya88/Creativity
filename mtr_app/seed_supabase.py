"""
Uploads all 25 authentic FAA AIRAC Cycle 2609 Military Training Routes into Supabase Database.
Usage:
    python3 -m mtr_app.seed_supabase
"""

import os
from mtr_app.services.supabase_service import SupabaseService
from mtr_app.services.mtr_service import MTRService


def seed_supabase():
    supabase = SupabaseService()
    if not supabase.is_configured():
        print("Supabase credentials not found in ~/.env. Set SUPABASE_ANON_KEY or SUPABASE_KEY to run seeding.")
        return

    print(f"Connecting to Supabase at {supabase.url}...")
    local_service = MTRService()
    local_service.supabase = SupabaseService(api_key="DISABLED_TEMPORARILY")  # Force local SQLite read
    
    local_routes = local_service.list_routes()
    print(f"Found {len(local_routes)} routes in local database to upload to Supabase.")

    uploaded_count = 0
    for r_summary in local_routes:
        route_id = r_summary["route_id"]
        route_details = local_service.get_route_details(route_id)
        if route_details:
            try:
                supabase.create_or_update_route(route_details)
                uploaded_count += 1
                print(f"Successfully uploaded {route_id} to Supabase!")
            except Exception as e:
                print(f"Failed to upload {route_id}: {e}")

    print(f"\nSeeding complete! {uploaded_count}/{len(local_routes)} routes uploaded to Supabase.")


if __name__ == "__main__":
    seed_supabase()
