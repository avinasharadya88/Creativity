/**
 * Canvas-based Vertical Altitude Profile Visualizer.
 * Renders floor, ceiling, and flight corridor envelope across route distance in Nautical Miles.
 */

class MTRProfileChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.route = null;

    if (this.canvas) {
      window.addEventListener('resize', () => this.draw());
    }
  }

  setRoute(routeDetails) {
    this.route = routeDetails;
    this.draw();
  }

  draw() {
    if (!this.canvas || !this.ctx) return;

    // Adjust canvas resolution for high-DPI displays
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    if (!this.route || !this.route.segments || this.route.segments.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Select a route to display its vertical altitude profile", width / 2, height / 2);
      return;
    }

    const segments = this.route.segments;
    const totalDist = this.route.total_distance_nm || 1.0;
    
    // Find max altitude to set scale
    let maxAlt = Math.max(
      this.route.ceiling_alt_ft || 15000,
      ...segments.map(s => s.max_alt_ft || 0)
    );
    maxAlt = Math.ceil(maxAlt / 2000) * 2000;
    if (maxAlt < 4000) maxAlt = 4000;

    // Margins
    const padLeft = 60;
    const padRight = 30;
    const padTop = 20;
    const padBottom = 26;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // Helper functions for coordinate transformation
    const xForDist = (distNM) => padLeft + (distNM / totalDist) * plotW;
    const yForAlt = (altFt) => padTop + plotH - (altFt / maxAlt) * plotH;

    // 1. Draw Grid Lines
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#64748b";
    ctx.font = "9.5px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";

    const altSteps = 4;
    for (let i = 0; i <= altSteps; i++) {
      const alt = (maxAlt / altSteps) * i;
      const y = yForAlt(alt);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      ctx.fillText(`${alt.toLocaleString()} ft`, padLeft - 8, y + 3);
    }

    // Distance X-Axis labels
    ctx.textAlign = "center";
    const distSteps = 5;
    for (let i = 0; i <= distSteps; i++) {
      const d = (totalDist / distSteps) * i;
      const x = xForDist(d);
      ctx.beginPath();
      ctx.moveTo(x, padTop + plotH);
      ctx.lineTo(x, padTop + plotH + 4);
      ctx.stroke();
      ctx.fillText(`${d.toFixed(0)} NM`, x, padTop + plotH + 16);
    }

    // 2. Build Profile Step Points
    // Points along route with start and end of each leg
    const profilePoints = [];
    let curDist = 0;

    segments.forEach((seg, i) => {
      const legDist = seg.segment_distance_nm || 0;
      const minA = seg.min_alt_ft || this.route.floor_alt_ft || 100;
      const maxA = seg.max_alt_ft || this.route.ceiling_alt_ft || 15000;
      
      profilePoints.push({
        xStart: curDist,
        xEnd: curDist + legDist,
        minAlt: minA,
        maxAlt: maxA,
        name: seg.point_name,
        type: seg.point_type
      });
      curDist += legDist;
    });

    if (profilePoints.length === 0) return;

    // 3. Draw Corridor Shaded Envelope
    const isIFR = (this.route.route_type || "").toUpperCase() === "IR";
    const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    if (isIFR) {
      gradient.addColorStop(0, "rgba(245, 158, 11, 0.25)");
      gradient.addColorStop(1, "rgba(56, 189, 248, 0.1)");
    } else {
      gradient.addColorStop(0, "rgba(16, 185, 129, 0.25)");
      gradient.addColorStop(1, "rgba(16, 185, 129, 0.05)");
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    // Top line (ceiling) left to right
    profilePoints.forEach((p, idx) => {
      const x1 = xForDist(p.xStart);
      const x2 = xForDist(p.xEnd);
      const yMax = yForAlt(p.maxAlt);
      if (idx === 0) ctx.moveTo(x1, yMax);
      else ctx.lineTo(x1, yMax);
      ctx.lineTo(x2, yMax);
    });

    // Bottom line (floor) right to left
    for (let idx = profilePoints.length - 1; idx >= 0; idx--) {
      const p = profilePoints[idx];
      const x1 = xForDist(p.xStart);
      const x2 = xForDist(p.xEnd);
      const yMin = yForAlt(p.minAlt);
      ctx.lineTo(x2, yMin);
      ctx.lineTo(x1, yMin);
    }
    ctx.closePath();
    ctx.fill();

    // 4. Draw Ceiling Profile Line (Amber)
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    profilePoints.forEach((p, idx) => {
      const x1 = xForDist(p.xStart);
      const x2 = xForDist(p.xEnd);
      const yMax = yForAlt(p.maxAlt);
      if (idx === 0) ctx.moveTo(x1, yMax);
      else ctx.lineTo(x1, yMax);
      ctx.lineTo(x2, yMax);
    });
    ctx.stroke();

    // 5. Draw Floor Profile Line (Green/Cyan)
    ctx.strokeStyle = isIFR ? "#38bdf8" : "#10b981";
    ctx.lineWidth = 2;
    ctx.beginPath();
    profilePoints.forEach((p, idx) => {
      const x1 = xForDist(p.xStart);
      const x2 = xForDist(p.xEnd);
      const yMin = yForAlt(p.minAlt);
      if (idx === 0) ctx.moveTo(x1, yMin);
      else ctx.lineTo(x1, yMin);
      ctx.lineTo(x2, yMin);
    });
    ctx.stroke();

    // 6. Draw Waypoint Markers & Vertical Guides
    ctx.font = "9px 'JetBrains Mono', monospace";
    profilePoints.forEach((p) => {
      const x = xForDist(p.xStart);
      
      // Vertical dashed line
      ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Waypoint circle
      const yFloor = yForAlt(p.minAlt);
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(x, yFloor, 3, 0, Math.PI * 2);
      ctx.fill();

      // Waypoint Label
      ctx.fillStyle = "#cbd5e1";
      ctx.textAlign = "center";
      ctx.fillText(p.name, x, padTop - 5);
    });

    // Last point
    if (profilePoints.length > 0) {
      const lastP = profilePoints[profilePoints.length - 1];
      const xLast = xForDist(lastP.xEnd);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(xLast, padTop);
      ctx.lineTo(xLast, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      
      const lastSeg = segments[segments.length - 1];
      const lastPtName = lastSeg.next_point_name || "END";
      ctx.fillStyle = "#cbd5e1";
      ctx.textAlign = "center";
      ctx.fillText(lastPtName, xLast, padTop - 5);
    }
  }
}

window.MTRProfileChart = MTRProfileChart;
