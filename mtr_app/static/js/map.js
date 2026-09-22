/**
 * Leaflet Map Controller for Military Training Routes.
 * Renders Centerline paths, Corridor boundary ribbon polygons, and Waypoint markers.
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

    this.initMap();
  }

  initMap() {
    // Default centered on Western US military test ranges
    this.map = L.map(this.containerId, {
      zoomControl: true,
      attributionControl: false
    }).setView([35.5, -117.5], 7);

    // Esri World Dark Gray Base (No API key required)
    const darkTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
    });
    darkTileLayer.addTo(this.map);

    // Create Layer Groups
    this.corridorLayer = L.layerGroup().addTo(this.map);
    this.centerlineLayer = L.layerGroup().addTo(this.map);
    this.waypointLayer = L.layerGroup().addTo(this.map);

    // Map resize trigger when layout settles
    setTimeout(() => {
      this.map.invalidateSize();
    }, 200);
  }

  renderRoute(routeDetails) {
    this.clearLayers();
    if (!routeDetails || !routeDetails.segments || routeDetails.segments.length === 0) {
      return;
    }

    const segments = routeDetails.segments;
    const isIFR = (routeDetails.route_type || "").toUpperCase() === "IR";
    const primaryColor = isIFR ? "#38bdf8" : "#10b981"; // Cyan for IFR, Emerald for VFR
    const corridorFill = isIFR ? "rgba(56, 189, 248, 0.22)" : "rgba(16, 185, 129, 0.22)";
    const corridorBorder = isIFR ? "rgba(56, 189, 248, 0.6)" : "rgba(16, 185, 129, 0.6)";

    const latLngs = [];

    // 1. Build Centerline Points
    segments.forEach((seg, idx) => {
      const p = [seg.latitude_dec, seg.longitude_dec];
      latLngs.push(p);

      // If last segment has next point, include it
      if (idx === segments.length - 1 && seg.next_lat_dec != null && seg.next_lon_dec != null) {
        latLngs.push([seg.next_lat_dec, seg.next_lon_dec]);
      }
    });

    // 2. Render Corridor Ribbon Polygon
    if (routeDetails.corridor_polygon && routeDetails.corridor_polygon.length > 0) {
      // corridor_polygon has [ [lon, lat], ... ]
      const polygonLatLngs = routeDetails.corridor_polygon.map(coord => [coord[1], coord[0]]);
      
      const polygon = L.polygon(polygonLatLngs, {
        color: corridorBorder,
        weight: 1.5,
        dashArray: "4, 4",
        fillColor: corridorFill,
        fillOpacity: 0.7,
        interactive: true
      });

      polygon.bindTooltip(`
        <div style="font-family: Inter, sans-serif; font-size: 11px;">
          <b>${routeDetails.route_id} Corridor</b><br>
          Width: ${routeDetails.route_width_nm || 10.0} NM<br>
          Envelope: ${routeDetails.floor_alt_ft || 0} - ${routeDetails.ceiling_alt_ft || 0} ft MSL
        </div>
      `, { sticky: true });

      this.corridorLayer.addLayer(polygon);
    }

    // 3. Render Centerline Polyline
    if (latLngs.length > 1) {
      const centerline = L.polyline(latLngs, {
        color: primaryColor,
        weight: 3.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      });

      centerline.bindTooltip(`
        <div style="font-family: Inter, sans-serif; font-size: 11px;">
          <b>${routeDetails.route_id} Centerline</b><br>
          Managing Unit: ${routeDetails.originating_agency || ''}<br>
          Distance: ${routeDetails.total_distance_nm || ''} NM
        </div>
      `, { sticky: true });

      this.centerlineLayer.addLayer(centerline);
    }

    // 4. Render Waypoint Markers
    segments.forEach((seg, idx) => {
      const lat = seg.latitude_dec;
      const lon = seg.longitude_dec;
      const ptType = (seg.point_type || "WAYPOINT").toUpperCase();
      const ptName = seg.point_name || `PT_${seg.sequence_num}`;
      
      let badgeBg = "#3b82f6";
      if (ptType === "ENTRY") badgeBg = "#10b981";
      if (ptType.includes("TURN")) badgeBg = "#f59e0b";
      if (ptType === "EXIT") badgeBg = "#ef4444";

      const markerHtml = `
        <div style="
          background-color: ${badgeBg};
          color: white;
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          font-weight: 700;
          padding: 2px 5px;
          border-radius: 3px;
          border: 1px solid rgba(255,255,255,0.7);
          box-shadow: 0 2px 6px rgba(0,0,0,0.6);
          white-space: nowrap;
          text-align: center;
        ">
          ${ptName}
        </div>
      `;

      const icon = L.divIcon({
        className: 'custom-waypoint-icon',
        html: markerHtml,
        iconSize: [60, 20],
        iconAnchor: [30, 10]
      });

      const marker = L.marker([lat, lon], { icon: icon });

      const popupHtml = `
        <div style="font-family: Inter, sans-serif; font-size: 11px; line-height: 1.5; min-width: 180px;">
          <b style="font-size: 13px; color: ${primaryColor};">${ptName}</b> (${ptType})<br>
          <b>Route:</b> ${routeDetails.route_id} [Leg ${seg.sequence_num}]<br>
          <b>Coords (Human):</b> ${seg.human_lat}, ${seg.human_lon}<br>
          <b>Coords (ARINC):</b> ${seg.arinc_lat}, ${seg.arinc_lon}<br>
          <b>Altitude:</b> ${seg.min_alt_ft || routeDetails.floor_alt_ft} - ${seg.max_alt_ft || routeDetails.ceiling_alt_ft} ft MSL<br>
          <b>Corridor:</b> ${seg.width_left_nm || 5.0} NM L / ${seg.width_right_nm || 5.0} NM R<br>
          ${seg.next_point_name ? `<b>Next Point:</b> ${seg.next_point_name} (${seg.segment_distance_nm || ''} NM)` : ''}
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
