/**
 * Main Client Application Coordinator for eNASR to ARINC 424-23 Explorer.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Map and Profile Chart
  const mtrMap = new MTRMap('mapContainer');
  const profileChart = new MTRProfileChart('profileCanvas');

  let allRoutes = [];
  let currentFilter = 'ALL';
  let currentSearch = '';
  let selectedRouteId = null;
  let currentActiveRouteDetails = null;

  // DOM Elements
  const routeListEl = document.getElementById('routeList');
  const routeSearchInput = document.getElementById('routeSearchInput');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const routeCountBadge = document.getElementById('routeCountBadge');

  // Summary Card
  const summaryCard = document.getElementById('routeSummaryCard');
  const summaryRouteId = document.getElementById('summaryRouteId');
  const summaryRouteType = document.getElementById('summaryRouteType');
  const summaryRouteName = document.getElementById('summaryRouteName');
  const summaryAgency = document.getElementById('summaryAgency');
  const summaryArtcc = document.getElementById('summaryArtcc');
  const summaryAlt = document.getElementById('summaryAlt');
  const summaryWidth = document.getElementById('summaryWidth');
  const summaryDistance = document.getElementById('summaryDistance');
  const summaryHours = document.getElementById('summaryHours');

  // Map Controls
  const mapRouteTitle = document.getElementById('mapRouteTitle');
  const mapRouteInfo = document.getElementById('mapRouteInfo');
  const toggleCorridor = document.getElementById('toggleCorridor');
  const toggleWaypoints = document.getElementById('toggleWaypoints');
  const btnFitBounds = document.getElementById('btnFitBounds');

  // Inspector Tabs & Content
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const xmlCodeContent = document.getElementById('xmlCodeContent');
  const plainEnglishContent = document.getElementById('plainEnglishContent');
  const fixedCodeContent = document.getElementById('fixedCodeContent');
  const segmentsTable = document.getElementById('segmentsTable').querySelector('tbody');
  const xmlValidationBadge = document.getElementById('xmlValidationBadge');
  const fixedLengthBadge = document.getElementById('fixedLengthBadge');
  const profileStats = document.getElementById('profileStats');

  // Buttons
  const btnCopyXml = document.getElementById('btnCopyXml');
  const btnDownloadXml = document.getElementById('btnDownloadXml');
  const btnCopyPlain = document.getElementById('btnCopyPlain');
  const btnCopyFixed = document.getElementById('btnCopyFixed');
  const btnDownloadFixed = document.getElementById('btnDownloadFixed');

  // Dropdown Export All
  const btnExportAll = document.getElementById('btnExportAll');
  const exportAllDropdown = document.querySelector('.dropdown');

  // Modal Elements
  const routeModal = document.getElementById('routeModal');
  const btnNewRoute = document.getElementById('btnNewRoute');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const btnSaveRoute = document.getElementById('btnSaveRoute');
  const btnAddWaypointRow = document.getElementById('btnAddWaypointRow');
  const waypointRowsContainer = document.getElementById('waypointRows');
  const modalTabBtns = document.querySelectorAll('.modal-tab-btn');
  const modalTabContents = document.querySelectorAll('.modal-tab-content');
  const jsonImportArea = document.getElementById('jsonImportArea');

  // -------------------------------------------------------------
  // 1. Data Fetching & Route List Rendering
  // -------------------------------------------------------------
  async function loadRoutes() {
    try {
      const res = await fetch('/api/routes');
      const data = await res.json();
      allRoutes = data.routes || [];
      routeCountBadge.textContent = allRoutes.length;
      renderRouteList();

      if (allRoutes.length > 0 && !selectedRouteId) {
        selectRoute(allRoutes[0].route_id);
      }
    } catch (err) {
      console.error('Error fetching routes:', err);
      routeListEl.innerHTML = `<div class="error-msg">Failed to connect to eNASR database API</div>`;
    }
  }

  function renderRouteList() {
    routeListEl.innerHTML = '';

    const filtered = allRoutes.filter(r => {
      const matchesFilter = currentFilter === 'ALL' || r.route_type === currentFilter;
      const term = currentSearch.toLowerCase();
      const matchesSearch = !term ||
        r.route_id.toLowerCase().includes(term) ||
        (r.route_name && r.route_name.toLowerCase().includes(term)) ||
        (r.originating_agency && r.originating_agency.toLowerCase().includes(term)) ||
        (r.artcc_facility && r.artcc_facility.toLowerCase().includes(term));
      return matchesFilter && matchesSearch;
    });

    if (filtered.length === 0) {
      routeListEl.innerHTML = `<div class="text-muted text-center" style="padding: 20px; font-size: 11px;">No matching MTR routes found</div>`;
      return;
    }

    filtered.forEach(r => {
      const card = document.createElement('div');
      card.className = `route-card ${r.route_id === selectedRouteId ? 'selected' : ''}`;
      card.dataset.routeId = r.route_id;

      let badgeClass = 'badge-ir';
      if (r.route_type === 'VR') badgeClass = 'badge-vr';
      if (r.route_type === 'SR') badgeClass = 'badge-sr';

      card.innerHTML = `
        <div class="route-card-header">
          <span class="route-card-id">${r.route_id}</span>
          <span class="badge ${badgeClass}">${r.route_type}</span>
        </div>
        <div class="route-card-name">${r.route_name || 'Military Training Route'}</div>
        <div class="route-card-meta">
          <span>${r.waypoint_count || 0} waypoints</span>
          <span>${(r.floor_alt_ft || 0).toLocaleString()} - ${(r.ceiling_alt_ft || 0).toLocaleString()} ft</span>
        </div>
      `;

      card.addEventListener('click', () => selectRoute(r.route_id));
      routeListEl.appendChild(card);
    });
  }

  // -------------------------------------------------------------
  // 2. Select and Display a Route
  // -------------------------------------------------------------
  async function selectRoute(routeId) {
    selectedRouteId = routeId;

    // Highlight selected card
    document.querySelectorAll('.route-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.routeId === routeId);
    });

    try {
      // 1. Fetch JSON details
      const res = await fetch(`/api/routes/${encodeURIComponent(routeId)}`);
      if (!res.ok) throw new Error('Route not found');
      const route = await res.json();
      currentActiveRouteDetails = route;

      // 2. Update Summary Card
      summaryCard.style.display = 'block';
      summaryRouteId.textContent = route.route_id;
      summaryRouteType.textContent = route.route_type;
      summaryRouteType.className = `badge badge-${route.route_type.toLowerCase()}`;
      summaryRouteName.textContent = route.route_name;
      summaryAgency.textContent = route.originating_agency;
      summaryArtcc.textContent = route.artcc_facility;
      summaryAlt.textContent = `${(route.floor_alt_ft || 0).toLocaleString()} - ${(route.ceiling_alt_ft || 0).toLocaleString()} ft`;
      summaryWidth.textContent = `${route.route_width_nm || 10.0} NM`;
      summaryDistance.textContent = `${route.total_distance_nm || 0} NM`;
      summaryHours.textContent = route.operating_hours || 'CONTINUOUS';

      // 3. Update Map & Altitude Profile
      mapRouteTitle.textContent = `${route.route_id} (${route.route_type})`;
      mapRouteInfo.textContent = `${route.route_name} • ${route.originating_agency} • Total: ${route.total_distance_nm || 0} NM`;
      profileStats.textContent = `Total Distance: ${route.total_distance_nm || 0} NM | Envelope: ${(route.floor_alt_ft || 0).toLocaleString()}-${(route.ceiling_alt_ft || 0).toLocaleString()} ft`;

      mtrMap.renderRoute(route);
      profileChart.setRoute(route);

      // 4. Fetch and render ARINC 424-23 XML
      loadRouteXml(routeId);

      // 5. Fetch and render Plain English Brief
      loadRoutePlain(routeId);

      // 6. Fetch and render ARINC 424 Fixed Records
      loadRouteFixed(routeId);

      // 7. Render Segments Table
      renderSegmentsTable(route.segments);

    } catch (err) {
      console.error('Error loading route details:', err);
    }
  }

  async function loadRouteXml(routeId) {
    xmlCodeContent.innerHTML = '<code>Fetching ARINC 424-23 XML...</code>';
    try {
      const res = await fetch(`/api/routes/${encodeURIComponent(routeId)}/arinc424-xml`);
      const xmlText = await res.text();
      xmlCodeContent.innerHTML = `<code>${escapeHtml(xmlText)}</code>`;
      xmlValidationBadge.textContent = '✓ ARINC 424-23 Valid';
      xmlValidationBadge.className = 'xml-status-badge valid';
      btnDownloadXml.onclick = () => {
        window.open(`/api/routes/${encodeURIComponent(routeId)}/arinc424-xml?download=true`, '_blank');
      };
    } catch (err) {
      xmlCodeContent.textContent = 'Failed to load XML';
    }
  }

  async function loadRoutePlain(routeId) {
    plainEnglishContent.textContent = 'Loading operational flight brief...';
    try {
      const res = await fetch(`/api/routes/${encodeURIComponent(routeId)}/plain-english`);
      const text = await res.text();
      plainEnglishContent.textContent = text;
    } catch (err) {
      plainEnglishContent.textContent = 'Failed to load operational brief';
    }
  }

  async function loadRouteFixed(routeId) {
    fixedCodeContent.textContent = 'Loading ARINC 424 fixed records...';
    try {
      const res = await fetch(`/api/routes/${encodeURIComponent(routeId)}/arinc424-fixed`);
      const fixedText = await res.text();
      fixedCodeContent.textContent = fixedText;
      
      const lines = fixedText.trim().split('\n');
      const all132 = lines.every(l => l.length === 132);
      if (all132) {
        fixedLengthBadge.textContent = `✓ ${lines.length} records verified (exactly 132 bytes/line)`;
        fixedLengthBadge.style.color = 'var(--accent-green)';
      } else {
        fixedLengthBadge.textContent = `Records: ${lines.length} lines`;
        fixedLengthBadge.style.color = 'var(--text-secondary)';
      }

      btnDownloadFixed.onclick = () => {
        window.open(`/api/routes/${encodeURIComponent(routeId)}/arinc424-fixed?download=true`, '_blank');
      };
    } catch (err) {
      fixedCodeContent.textContent = 'Failed to load fixed records';
    }
  }

  function renderSegmentsTable(segments) {
    segmentsTable.innerHTML = '';
    if (!segments || segments.length === 0) {
      segmentsTable.innerHTML = '<tr><td colspan="7" class="text-center">No segments found</td></tr>';
      return;
    }

    segments.forEach(s => {
      const tr = document.createElement('tr');
      const terminator = s.sequence_num === 1 ? 'IF' : 'TF';
      tr.innerHTML = `
        <td><b>${s.sequence_num}</b></td>
        <td><b>${s.point_name}</b> ${s.next_point_name ? `→ ${s.next_point_name}` : ''}</td>
        <td>${s.point_type}</td>
        <td><span class="badge" style="background:#1e293b; color:#38bdf8;">${terminator}</span></td>
        <td>${(s.min_alt_ft || 0).toLocaleString()} - ${(s.max_alt_ft || 0).toLocaleString()} ft</td>
        <td>${s.width_left_nm || 5.0}L / ${s.width_right_nm || 5.0}R NM</td>
        <td>${s.segment_distance_nm ? `${s.segment_distance_nm} NM` : '-'}</td>
      `;
      segmentsTable.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // -------------------------------------------------------------
  // 3. Search & Filter Handlers
  // -------------------------------------------------------------
  routeSearchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    renderRouteList();
  });

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderRouteList();
    });
  });

  // Map Toggles
  toggleCorridor.addEventListener('change', (e) => {
    mtrMap.setCorridorVisibility(e.target.checked);
  });

  toggleWaypoints.addEventListener('change', (e) => {
    mtrMap.setWaypointsVisibility(e.target.checked);
  });

  btnFitBounds.addEventListener('click', () => {
    mtrMap.fitCurrentBounds();
  });

  // Inspector Tabs
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(btn.dataset.tab);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // Copy Buttons
  btnCopyXml.addEventListener('click', () => {
    navigator.clipboard.writeText(xmlCodeContent.textContent).then(() => {
      const orig = btnCopyXml.textContent;
      btnCopyXml.textContent = 'Copied!';
      setTimeout(() => btnCopyXml.textContent = orig, 1500);
    });
  });

  btnCopyPlain.addEventListener('click', () => {
    navigator.clipboard.writeText(plainEnglishContent.textContent).then(() => {
      const orig = btnCopyPlain.textContent;
      btnCopyPlain.textContent = 'Copied!';
      setTimeout(() => btnCopyPlain.textContent = orig, 1500);
    });
  });

  btnCopyFixed.addEventListener('click', () => {
    navigator.clipboard.writeText(fixedCodeContent.textContent).then(() => {
      const orig = btnCopyFixed.textContent;
      btnCopyFixed.textContent = 'Copied!';
      setTimeout(() => btnCopyFixed.textContent = orig, 1500);
    });
  });

  // Export All Dropdown
  btnExportAll.addEventListener('click', (e) => {
    e.stopPropagation();
    exportAllDropdown.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    exportAllDropdown.classList.remove('open');
  });

  // -------------------------------------------------------------
  // 4. Modal: Create / Edit / Import MTR
  // -------------------------------------------------------------
  const btnEditRoute = document.getElementById('btnEditRoute');
  const btnEditActiveRoute = document.getElementById('btnEditActiveRoute');
  const modalTitle = document.getElementById('modalTitle');

  function openEditModal(route) {
    if (!route) {
      alert('Please select a route first to edit.');
      return;
    }

    if (modalTitle) modalTitle.textContent = `Edit MTR Route: ${route.route_id}`;
    document.getElementById('fRouteId').value = route.route_id;
    document.getElementById('fRouteType').value = route.route_type || 'IR';
    document.getElementById('fRouteName').value = route.route_name || '';
    document.getElementById('fAgency').value = route.originating_agency || '';
    document.getElementById('fArtcc').value = route.artcc_facility || '';
    document.getElementById('fFloorAlt').value = route.floor_alt_ft || 200;
    document.getElementById('fCeilingAlt').value = route.ceiling_alt_ft || 10000;
    document.getElementById('fWidth').value = route.route_width_nm || 10.0;

    waypointRowsContainer.innerHTML = '';
    const segments = route.segments || [];
    if (segments.length === 0) {
      addWaypointRow(1, 'PT_ENTRY', 'ENTRY', 35.0, -117.5);
      addWaypointRow(2, 'PT_EXIT', 'EXIT', 35.5, -117.0);
    } else {
      segments.forEach((seg, idx) => {
        addWaypointRow(
          seg.sequence_num || idx + 1,
          seg.point_name || `PT_${idx + 1}`,
          seg.point_type || (idx === 0 ? 'ENTRY' : (idx === segments.length - 1 ? 'EXIT' : 'WAYPOINT')),
          seg.latitude_dec,
          seg.longitude_dec
        );
      });
    }

    btnSaveRoute.textContent = 'Save Changes to Backend';
    routeModal.style.display = 'flex';
  }

  if (btnEditRoute) {
    btnEditRoute.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(currentActiveRouteDetails);
    });
  }

  if (btnEditActiveRoute) {
    btnEditActiveRoute.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(currentActiveRouteDetails);
    });
  }

  btnNewRoute.addEventListener('click', () => {
    if (modalTitle) modalTitle.textContent = 'Create / Import Military Training Route (MTR)';
    document.getElementById('newRouteForm').reset();
    waypointRowsContainer.innerHTML = '';
    addWaypointRow(1, 'PT_ENTRY', 'ENTRY', 35.0, -117.5);
    addWaypointRow(2, 'PT_EXIT', 'EXIT', 35.5, -117.0);
    btnSaveRoute.textContent = 'Save & Translate to ARINC 424-23';
    routeModal.style.display = 'flex';
  });

  function closeModal() {
    routeModal.style.display = 'none';
  }

  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);

  modalTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modalTabBtns.forEach(b => b.classList.remove('active'));
      modalTabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.modaltab);
      if (target) target.classList.add('active');
    });
  });

  function addWaypointRow(seq, name, type, lat, lon) {
    const row = document.createElement('div');
    row.className = 'waypoint-row';
    row.innerHTML = `
      <input type="number" class="wp-seq" value="${seq}" style="width: 100%;" />
      <input type="text" class="wp-name" value="${name}" placeholder="Name" />
      <select class="wp-type">
        <option value="ENTRY" ${type === 'ENTRY' ? 'selected' : ''}>ENTRY</option>
        <option value="WAYPOINT" ${type === 'WAYPOINT' ? 'selected' : ''}>WAYPOINT</option>
        <option value="TURN_POINT" ${type === 'TURN_POINT' ? 'selected' : ''}>TURN</option>
        <option value="EXIT" ${type === 'EXIT' ? 'selected' : ''}>EXIT</option>
      </select>
      <input type="number" step="0.0001" class="wp-lat" value="${lat}" placeholder="Latitude" />
      <input type="number" step="0.0001" class="wp-lon" value="${lon}" placeholder="Longitude" />
      <button type="button" class="btn-remove-row" title="Remove">✕</button>
    `;

    row.querySelector('.btn-remove-row').addEventListener('click', () => {
      row.remove();
    });

    waypointRowsContainer.appendChild(row);
  }

  btnAddWaypointRow.addEventListener('click', () => {
    const nextSeq = waypointRowsContainer.children.length + 1;
    addWaypointRow(nextSeq, `PT_${nextSeq}`, 'WAYPOINT', 35.0, -117.0);
  });

  btnSaveRoute.addEventListener('click', async () => {
    const isJsonTab = document.getElementById('tabJson').classList.contains('active');
    let routePayload = null;

    if (isJsonTab) {
      try {
        const raw = jsonImportArea.value.trim();
        const parsed = JSON.parse(raw);
        if (parsed.type === 'Feature') {
          // Handle single GeoJSON Feature
          routePayload = {
            route_id: parsed.properties.route_id,
            route_type: parsed.properties.route_type,
            route_name: parsed.properties.route_name,
            originating_agency: parsed.properties.originating_agency || 'DoD',
            artcc_facility: parsed.properties.artcc_facility || 'ARTCC',
            floor_alt_ft: parsed.properties.floor_alt_ft_msl || 200,
            ceiling_alt_ft: parsed.properties.ceiling_alt_ft_msl || 10000,
            route_width_nm: parsed.properties.route_width_nm || 10.0,
            segments: []
          };
          if (parsed.geometry && parsed.geometry.type === 'LineString') {
            parsed.geometry.coordinates.forEach((pt, idx) => {
              routePayload.segments.push({
                sequence_num: idx + 1,
                point_name: `PT_${idx + 1}`,
                point_type: idx === 0 ? 'ENTRY' : (idx === parsed.geometry.coordinates.length - 1 ? 'EXIT' : 'WAYPOINT'),
                latitude_dec: pt[1],
                longitude_dec: pt[0],
                min_alt_ft: routePayload.floor_alt_ft,
                max_alt_ft: routePayload.ceiling_alt_ft,
                width_left_nm: routePayload.route_width_nm / 2.0,
                width_right_nm: routePayload.route_width_nm / 2.0
              });
            });
          }
        } else {
          routePayload = parsed;
        }
      } catch (err) {
        alert('Invalid JSON: ' + err.message);
        return;
      }
    } else {
      // Manual form
      const rId = document.getElementById('fRouteId').value.trim();
      if (!rId) {
        alert('Route ID is required');
        return;
      }

      const rows = waypointRowsContainer.querySelectorAll('.waypoint-row');
      const segments = [];
      rows.forEach((row) => {
        segments.push({
          sequence_num: parseInt(row.querySelector('.wp-seq').value),
          point_name: row.querySelector('.wp-name').value.trim(),
          point_type: row.querySelector('.wp-type').value,
          latitude_dec: parseFloat(row.querySelector('.wp-lat').value),
          longitude_dec: parseFloat(row.querySelector('.wp-lon').value),
          min_alt_ft: parseInt(document.getElementById('fFloorAlt').value),
          max_alt_ft: parseInt(document.getElementById('fCeilingAlt').value),
          width_left_nm: parseFloat(document.getElementById('fWidth').value) / 2.0,
          width_right_nm: parseFloat(document.getElementById('fWidth').value) / 2.0
        });
      });

      routePayload = {
        route_id: rId,
        route_type: document.getElementById('fRouteType').value,
        route_name: document.getElementById('fRouteName').value.trim(),
        originating_agency: document.getElementById('fAgency').value.trim(),
        artcc_facility: document.getElementById('fArtcc').value.trim(),
        floor_alt_ft: parseInt(document.getElementById('fFloorAlt').value),
        ceiling_alt_ft: parseInt(document.getElementById('fCeilingAlt').value),
        route_width_nm: parseFloat(document.getElementById('fWidth').value),
        segments: segments
      };
    }

    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routePayload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      closeModal();
      await loadRoutes();
      selectRoute(routePayload.route_id);
    } catch (err) {
      alert('Error saving route: ' + err.message);
    }
  });

  // Initial Load
  loadRoutes();
});
