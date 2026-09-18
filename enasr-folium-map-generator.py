import folium
from folium import plugins
import json
import sqlite3
import os

def create_folium_map(db_path, geojson_path, output_html_path):
    """
    Builds an interactive Folium web map for eNASR Aeronautical Data & MTR Corridors.
    """
    # Center map near California / Nevada airspace cluster (35.5 N, -117.5 W)
    m = folium.Map(
        location=[35.5, -117.5],
        zoom_start=7,
        tiles="CartoDB positron",
        name="CartoDB Light"
    )

    # Add alternative tile layers
    folium.TileLayer("OpenStreetMap", name="OpenStreetMap").add_to(m)
    folium.TileLayer(
        tiles="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attr="Esri World Imagery",
        name="Satellite Imagery"
    ).add_to(m)

    # 1. Layer: Military Training Routes (GeoJSON)
    mtr_group = folium.FeatureGroup(name="Military Training Routes (MTRs)", show=True)
    
    with open(geojson_path, 'r') as f:
        mtr_geojson = json.load(f)

    def mtr_style(feature):
        rtype = feature['properties'].get('route_type', '')
        if rtype == 'IR':
            color = '#D90429'  # Crimson Red
        elif rtype == 'VR':
            color = '#028090'  # Cyan Blue
        else:
            color = '#F77F00'  # Orange
        return {
            'color': color,
            'weight': 4,
            'opacity': 0.85,
            'dashArray': '6, 4' if rtype == 'VR' else '1'
        }

    def mtr_highlight(feature):
        return {
            'weight': 7,
            'opacity': 1.0,
            'color': '#FFD166'
        }

    folium.GeoJson(
        mtr_geojson,
        name="MTR Corridors",
        style_function=mtr_style,
        highlight_function=mtr_highlight,
        tooltip=folium.GeoJsonTooltip(
            fields=['route_id', 'route_type', 'route_name', 'floor_alt_ft_msl', 'ceiling_alt_ft_msl', 'originating_agency'],
            aliases=['Route ID:', 'Type:', 'Name:', 'Floor (ft MSL):', 'Ceiling (ft MSL):', 'Agency:'],
            localize=True,
            sticky=True
        ),
        popup=folium.GeoJsonPopup(
            fields=['route_id', 'route_type', 'route_name', 'originating_agency', 'artcc_facility', 'floor_alt_ft_msl', 'ceiling_alt_ft_msl', 'route_width_nm'],
            aliases=['MTR Identifier:', 'Type:', 'Description:', 'Command Agency:', 'ARTCC:', 'Min Altitude:', 'Max Altitude:', 'Corridor Width (NM):']
        )
    ).add_to(mtr_group)
    mtr_group.add_to(m)

    # Connect SQLite database for additional layers
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 2. Layer: Major Airports & Facilities
    apt_group = folium.FeatureGroup(name="Airports & Landing Facilities", show=True)
    cursor.execute("SELECT * FROM airports")
    airports = cursor.fetchall()
    
    for apt in airports:
        popup_html = f"""
        <div style="font-family: Arial, sans-serif; width: 220px;">
            <h4 style="margin:0 0 5px 0; color:#1D3557;">{apt['facility_name']} ({apt['arpt_id']})</h4>
            <b>City/State:</b> {apt['city']}, {apt['state_code']}<br>
            <b>Type:</b> {apt['facility_type']}<br>
            <b>Elevation:</b> {apt['elevation_ft']} ft MSL<br>
            <b>Control Tower:</b> {'Yes' if apt['control_tower_flag'] == 1 else 'No'}<br>
            <b>Status:</b> <span style="color:green; font-weight:bold;">{apt['status']}</span>
        </div>
        """
        folium.Marker(
            location=[apt['latitude_dec'], apt['longitude_dec']],
            popup=folium.Popup(popup_html, max_width=250),
            tooltip=f"Airport: {apt['facility_name']} ({apt['arpt_id']})",
            icon=folium.Icon(color="blue", icon="plane", prefix="fa")
        ).add_to(apt_group)
    apt_group.add_to(m)

    # 3. Layer: Navigation Aids (NAVAIDs)
    nav_group = folium.FeatureGroup(name="Navigation Aids (NAVAIDs)", show=True)
    cursor.execute("SELECT * FROM navaids")
    navaids = cursor.fetchall()

    for nav in navaids:
        popup_html = f"""
        <div style="font-family: Arial, sans-serif; width: 200px;">
            <h4 style="margin:0 0 5px 0; color:#E63946;">{nav['nav_name']} ({nav['nav_id']})</h4>
            <b>Type:</b> {nav['nav_type']}<br>
            <b>Frequency:</b> {nav['frequency_mhz']} MHz<br>
            <b>TACAN Channel:</b> {nav['channel'] or 'N/A'}<br>
            <b>Elevation:</b> {nav['elevation_ft']} ft MSL
        </div>
        """
        folium.CircleMarker(
            location=[nav['latitude_dec'], nav['longitude_dec']],
            radius=7,
            color="#E63946",
            fill=True,
            fill_color="#F1FAEE",
            fill_opacity=0.9,
            popup=folium.Popup(popup_html, max_width=220),
            tooltip=f"NAVAID: {nav['nav_id']} ({nav['nav_type']})"
        ).add_to(nav_group)
    nav_group.add_to(m)

    # 4. Layer: Controlled Airspace Boundaries
    airspace_group = folium.FeatureGroup(name="Controlled Airspace Polygons", show=True)
    cursor.execute("SELECT airspace_id, airspace_name, airspace_class, lower_alt_ft, upper_alt_ft, controlling_agency, geometry_geojson FROM airspace")
    airspaces = cursor.fetchall()

    for asp in airspaces:
        if asp['geometry_geojson']:
            geojson_data = json.loads(asp['geometry_geojson'])
            color = '#118AB2' if 'CLASS_B' in asp['airspace_class'] else '#06D6A0'
            
            folium.GeoJson(
                geojson_data,
                style_function=lambda x, col=color: {
                    'fillColor': col,
                    'color': col,
                    'weight': 2,
                    'fillOpacity': 0.25
                },
                tooltip=f"{asp['airspace_name']} ({asp['airspace_class']}): {asp['lower_alt_ft']}-{asp['upper_alt_ft']} ft MSL",
                popup=f"Airspace: {asp['airspace_name']}<br>Class: {asp['airspace_class']}<br>Floor: {asp['lower_alt_ft']} ft<br>Ceiling: {asp['upper_alt_ft']} ft<br>ATC: {asp['controlling_agency']}"
            ).add_to(airspace_group)
    airspace_group.add_to(m)

    conn.close()

    # Plugins and Controls
    folium.LayerControl(collapsed=False).add_to(m)
    plugins.MiniMap(toggle_display=True, tile_layer="CartoDB positron").add_to(m)
    plugins.MeasureControl(position="topleft", primary_length_unit="nauticalmiles").add_to(m)
    plugins.Fullscreen(position="topright").add_to(m)

    # Custom Legend
    legend_html = """
     <div style="
     position: fixed; 
     bottom: 30px; left: 30px; width: 230px; height: 180px; 
     border:2px solid grey; z-index:9999; font-size:12px;
     background-color:white; opacity: 0.92; padding: 10px;
     border-radius: 5px; font-family: Arial, sans-serif;
     box-shadow: 2px 2px 6px rgba(0,0,0,0.3);
     ">
     <b>eNASR Airspace Legend</b><br>
     <i style="background:#D90429; width:12px; height:12px; display:inline-block; margin-right:5px;"></i> IFR Military Route (IR)<br>
     <i style="background:#028090; width:12px; height:12px; display:inline-block; margin-right:5px;"></i> VFR Military Route (VR)<br>
     <i style="background:#F77F00; width:12px; height:12px; display:inline-block; margin-right:5px;"></i> Slow Speed Route (SR)<br>
     <i style="background:#1D3557; width:12px; height:12px; display:inline-block; margin-right:5px; border-radius:50%;"></i> Airport / Landing Facility<br>
     <i style="background:#E63946; width:12px; height:12px; display:inline-block; margin-right:5px; border-radius:50%;"></i> VOR / VORTAC Navaid<br>
     <i style="background:#118AB2; width:12px; height:12px; display:inline-block; margin-right:5px; opacity:0.4;"></i> Class B / C Airspace<br>
     </div>
     """
    m.get_root().html.add_child(folium.Element(legend_html))

    # Save HTML map
    m.save(output_html_path)
    print(f"Folium interactive map successfully written to {output_html_path}")

if __name__ == "__main__":
    db_file = "/workspace/scratch/enasr-geospatial.db"
    geojson_file = "/workspace/artifacts/enasr-mtr-routes.geojson"
    out_html = "/workspace/scratch/enasr_airspace_interactive_map.html"
    create_folium_map(db_file, geojson_file, out_html)
