/**
 * Leaflet Map Controller for Military Training Routes.
 * Tactical Cyber-Aerospace Avionics Renderer with Multi-Layer Basemaps,
 * Luminous Corridors, Glowing Centerlines, and Radar-styled Waypoint Markers.
 */

class MTRMap {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.centerlineLayer = null;
    this.corridorLayer = null;
    this.waypointLayer = null;
    this.currentBounds = null;

    this.showCorridor = true;
    this.showWaypoints = true;
    this.currentBasemapType = 'dark';
    this.tileLayers = {};

    this.initMap();
  }

  initMap() {
    // Default centered on Western US military test ranges
    this.map = L.map(this.containerId, {
      zoomControl: true,
      attributionControl: false
    }).setView([35.5, -117.5], 7);

    // 1. Dark Tactical Basemap (CartoDB Dark Matter)
    this.tileLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '&copy; CartoDB &copy; OpenStreetMap'
    });

    // 2. Satellite Basemap (Esri World Imagery)
    this.tileLayers.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: '&copy; Esri, Maxar, Earthstar Geographics'
    });

    // 3. OpenStreetMap Light (Standard)
    this.tileLayers.osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    });

    // Default to Dark HUD Basemap
    this.tileLayers.dark.addTo(this.map);

    // Layer Groups
    this.corridorLayer = L.layerGroup().addTo(this.map);
    this.centerlineLayer = L.layerGroup().addTo(this.map);
    this.waypointLayer = L.layerGroup().addTo(this.map);

    // Settle layout trigger
    setTimeout(() => {
      this.map.invalidateSize();
    }, 200);
  }

  setBasemap(type) {
    if (!this.tileLayers[type] || this.currentBasemapType === type) return;

    Object.values(this.tileLayers).forEach(layer => {
      if (this.map.hasLayer(layer)) {
        this.map.removeLayer(layer);
      }
    });

    this.tileLayers[type].addTo(this.map);
    this.currentBasemapType = type;
  }

  renderRoute(routeDetails) {
    this.clearLayers();
    if (!routeDetails || !routeDetails.segments || routeDetails.segments.length === 0) {
      return;
    }

    const segments = routeDetails.segments;
    const rType = (routeDetails.route_type || "").toUpperCase();
    
    // Avionics Palette
    let primaryColor = "#00f0ff"; // IR - Cyan
    let corridorFill = "rgba(0, 240, 255, 0.16)";
    let corridorBorder = "rgba(0, 240, 255, 0.75)";

    if (rType === "VR") {
      primaryColor = "#00ff9d"; // VR - Tactical Emerald
      corridorFill = "rgba(0, 255, 157, 0.16)";
      corridorBorder = "rgba(0, 255, 157, 0.75)";
    } else if (rType === "SR") {
      primaryColor = "#ffb703"; // SR - Amber
      corridorFill = "rgba(255, 183, 3, 0.16)";
      corridorBorder = "rgba(255, 183, 3, 0.75)";
    }

    const latLngs = [];

    // 1. Build Centerline Points
    segments.forEach((seg, idx) => {
      latLngs.push([seg.latitude_dec, seg.longitude_dec]);

      if (idx === segments.length - 1 && seg.next_lat_dec != null && seg.next_lon_dec != null) {
        latLngs.push([seg.next_lat_dec, seg.next_lon_dec]);
      }
    });

    // 2. Render Corridor Ribbon Polygon
    if (routeDetails.corridor_polygon && routeDetails.corridor_polygon.length > 0) {
      const polygonLatLngs = routeDetails.corridor_polygon.map(coord => [coord[1], coord[0]]);
      
      const polygon = L.polygon(polygonLatLngs, {
        color: corridorBorder,
        weight: 1.8,
        dashArray: "6, 4",
        fillColor: corridorFill,
        fillOpacity: 0.85,
        interactive: true
      });

      polygon.bindTooltip(`
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.5;">
          <b style="color: ${primaryColor}; font-size: 12px;">${routeDetails.route_id} Corridor</b><br>
          <span style="color: #94a3b8;">Width:</span> <b style="color: #fff;">${routeDetails.route_width_nm || 10.0} NM</b><br>
          <span style="color: #94a3b8;">Envelope:</span> <b style="color: #fff;">${(routeDetails.floor_alt_ft || 0).toLocaleString()} - ${(routeDetails.ceiling_alt_ft || 0).toLocaleString()} ft MSL</b>
        </div>
      `, { sticky: true });

      this.corridorLayer.addLayer(polygon);
    }

    // 3. Render Centerline with Dual-stroke Avionics Glow
    if (latLngs.length > 1) {
      // Glow underlay polyline
      const glowLine = L.polyline(latLngs, {
        color: primaryColor,
        weight: 8,
        opacity: 0.25,
        lineCap: 'round',
        lineJoin: 'round'
      });
      this.centerlineLayer.addLayer(glowLine);

      // Core sharp polyline
      const centerline = L.polyline(latLngs, {
        color: primaryColor,
        weight: 3.2,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      });

      centerline.bindTooltip(`
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.5;">
          <b style="color: ${primaryColor}; font-size: 12px;">${routeDetails.route_id} Flight Path</b><br>
          <span style="color: #94a3b8;">Unit:</span> ${routeDetails.originating_agency || ''}<br>
          <span style="color: #94a3b8;">Total Dist:</span> <b style="color: #fff;">${routeDetails.total_distance_nm || ''} NM</b>
        </div>
      `, { sticky: true });

      this.centerlineLayer.addLayer(centerline);
    }

    // 4. Render Waypoint Markers
    segments.forEach((seg) => {
      const lat = seg.latitude_dec;
      const lon = seg.longitude_dec;
      const ptType = (seg.point_type || "WAYPOINT").toUpperCase();
      const ptName = seg.point_name || `PT_${seg.sequence_num}`;
      
      let badgeBg = "linear-gradient(135deg, #0284c7, #0369a1)";
      let borderColor = "rgba(56, 189, 248, 0.8)";
      let glowColor = "rgba(56, 189, 248, 0.4)";

      if (ptType === "ENTRY") {
        badgeBg = "linear-gradient(135deg, #059669, #10b981)";
        borderColor = "rgba(0, 255, 157, 0.9)";
        glowColor = "rgba(0, 255, 157, 0.5)";
      } else if (ptType.includes("TURN")) {
        badgeBg = "linear-gradient(135deg, #d97706, #f59e0b)";
        borderColor = "rgba(255, 183, 3, 0.9)";
        glowColor = "rgba(255, 183, 3, 0.5)";
      } else if (ptType === "EXIT") {
        badgeBg = "linear-gradient(135deg, #dc2626, #ef4444)";
        borderColor = "rgba(255, 71, 87, 0.9)";
        glowColor = "rgba(255, 71, 87, 0.5)";
      }

      const markerHtml = `
        <div style="
          background: ${badgeBg};
          color: #fff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 9.5px;
          font-weight: 700;
          padding: 2.5px 6px;
          border-radius: 4px;
          border: 1px solid ${borderColor};
          box-shadow: 0 0 10px ${glowColor}, 0 2px 8px rgba(0,0,0,0.8);
          white-space: nowrap;
          text-align: center;
          letter-spacing: 0.3px;
        ">
          ${ptName}
        </div>
      `;

      const icon = L.divIcon({
        className: 'custom-waypoint-icon',
        html: markerHtml,
        iconSize: [64, 22],
        iconAnchor: [32, 11]
      });

      const marker = L.marker([lat, lon], { icon: icon });

      const popupHtml = `
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.6; min-width: 200px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; border-bottom: 1px solid rgba(56, 189, 248, 0.2); padding-bottom: 4px;">
            <b style="font-size: 13px; color: ${primaryColor};">${ptName}</b>
            <span style="font-size: 9px; padding: 1px 5px; border-radius: 3px; background: rgba(56,189,248,0.2); color: #38bdf8;">${ptType}</span>
          </div>
          <div><span style="color:#94a3b8;">Route:</span> <b>${routeDetails.route_id}</b> [Leg #${seg.sequence_num}]</div>
          <div><span style="color:#94a3b8;">Position:</span> ${seg.human_lat}, ${seg.human_lon}</div>
          <div><span style="color:#94a3b8;">ARINC Form:</span> <code style="color:#a5f3fc;">${seg.arinc_lat || ''}, ${seg.arinc_lon || ''}</code></div>
          <div><span style="color:#94a3b8;">Altitude:</span> ${(seg.min_alt_ft || routeDetails.floor_alt_ft || 0).toLocaleString()} - ${(seg.max_alt_ft || routeDetails.ceiling_alt_ft || 0).toLocaleString()} ft</div>
          <div><span style="color:#94a3b8;">Corridor:</span> ${seg.width_left_nm || 5.0} NM L / ${seg.width_right_nm || 5.0} NM R</div>
          ${seg.next_point_name ? `<div><span style="color:#94a3b8;">Next Leg:</span> <b>${seg.next_point_name}</b> (${seg.segment_distance_nm || '-'} NM)</div>` : ''}
        </div>
      `;

      marker.bindPopup(popupHtml);
      this.waypointLayer.addLayer(marker);
    });

    // 5. Fit Bounds
    if (latLngs.length > 0) {
      this.currentBounds = L.latLngBounds(latLngs);
      this.map.fitBounds(this.currentBounds, { padding: [40, 40], maxZoom: 12 });
    }
  }

  fitCurrentBounds() {
    if (this.currentBounds) {
      this.map.fitBounds(this.currentBounds, { padding: [40, 40], maxZoom: 12 });
    }
  }

  setCorridorVisibility(visible) {
    this.showCorridor = visible;
    if (visible) {
      this.corridorLayer.addTo(this.map);
    } else {
      this.map.removeLayer(this.corridorLayer);
    }
  }

  setWaypointsVisibility(visible) {
    this.showWaypoints = visible;
    if (visible) {
      this.waypointLayer.addTo(this.map);
    } else {
      this.map.removeLayer(this.waypointLayer);
    }
  }

  clearLayers() {
    this.centerlineLayer.clearLayers();
    this.corridorLayer.clearLayers();
    this.waypointLayer.clearLayers();
    this.currentBounds = null;
  }
}

window.MTRMap = MTRMap;
