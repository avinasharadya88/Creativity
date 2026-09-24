/**
 * Canvas-based Vertical Altitude Profile Visualizer.
 * Renders floor, ceiling, and flight corridor envelope across route distance in Nautical Miles.
 * Enhanced with Cyber-Aerospace HUD Graticule, Neon Envelope Shading, and Interactive Telemetry Scanline.
 */

class MTRProfileChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.route = null;
    this.hoverX = null;
    this.hoverData = null;

    if (this.canvas) {
      window.addEventListener('resize', () => this.draw());

      // Interactive hover scanline
      this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    }
  }

  setRoute(routeDetails) {
    this.route = routeDetails;
    this.hoverX = null;
    this.hoverData = null;
    this.draw();
  }

  handleMouseMove(e) {
    if (!this.route || !this.route.segments || this.route.segments.length === 0) return;
    const rect = this.canvas.getBoundingClientRect();
    this.hoverX = e.clientX - rect.left;
    this.draw();
  }

  handleMouseLeave() {
    this.hoverX = null;
    this.hoverData = null;
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
      ctx.font = "12px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Select a route to display its vertical altitude profile", width / 2, height / 2);
      return;
    }

    const segments = this.route.segments;
    const totalDist = this.route.total_distance_nm || 1.0;
    
    // Altitude Scale
    let maxAlt = Math.max(
      this.route.ceiling_alt_ft || 15000,
      ...segments.map(s => s.max_alt_ft || 0)
    );
    maxAlt = Math.ceil(maxAlt / 2000) * 2000;
    if (maxAlt < 4000) maxAlt = 4000;

    // Margins
    const padLeft = 65;
    const padRight = 35;
    const padTop = 24;
    const padBottom = 26;

    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);

    const xForDist = (distNM) => padLeft + (distNM / totalDist) * plotW;
    const yForAlt = (altFt) => padTop + plotH - (altFt / maxAlt) * plotH;

    // 1. Draw Tactical Grid Background
    ctx.strokeStyle = "rgba(56, 189, 248, 0.08)";
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

      ctx.fillStyle = i === altSteps ? "#94a3b8" : "#64748b";
      ctx.fillText(`${alt.toLocaleString()} ft`, padLeft - 8, y + 3);
    }

    // Distance X-Axis
    ctx.textAlign = "center";
    ctx.fillStyle = "#64748b";
    const distSteps = Math.min(8, Math.max(4, Math.floor(plotW / 80)));
    for (let i = 0; i <= distSteps; i++) {
      const d = (totalDist / distSteps) * i;
      const x = xForDist(d);
      ctx.beginPath();
      ctx.moveTo(x, padTop + plotH);
      ctx.lineTo(x, padTop + plotH + 4);
      ctx.stroke();
      ctx.fillText(`${d.toFixed(0)} NM`, x, padTop + plotH + 16);
    }

    // 2. Build Profile Points
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
        type: seg.point_type,
        seq: seg.sequence_num || i + 1
      });
      curDist += legDist;
    });

    if (profilePoints.length === 0) return;

    // 3. Draw Corridor Shaded Envelope
    const isIFR = (this.route.route_type || "").toUpperCase() === "IR";
    const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    if (isIFR) {
      gradient.addColorStop(0, "rgba(255, 183, 3, 0.28)");
      gradient.addColorStop(0.5, "rgba(0, 240, 255, 0.16)");
      gradient.addColorStop(1, "rgba(0, 240, 255, 0.04)");
    } else {
      gradient.addColorStop(0, "rgba(255, 183, 3, 0.28)");
      gradient.addColorStop(0.5, "rgba(0, 255, 157, 0.16)");
      gradient.addColorStop(1, "rgba(0, 255, 157, 0.04)");
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    
    // Top line (ceiling)
    profilePoints.forEach((p, idx) => {
      const x1 = xForDist(p.xStart);
      const x2 = xForDist(p.xEnd);
      const yMax = yForAlt(p.maxAlt);
      if (idx === 0) ctx.moveTo(x1, yMax);
      else ctx.lineTo(x1, yMax);
      ctx.lineTo(x2, yMax);
    });

    // Bottom line (floor)
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

    // 4. Draw Ceiling Profile Line (Luminous Amber)
    ctx.strokeStyle = "#ffb703";
    ctx.lineWidth = 2.2;
    ctx.shadowColor = "rgba(255, 183, 3, 0.5)";
    ctx.shadowBlur = 6;
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
    ctx.shadowBlur = 0; // reset

    // 5. Draw Floor Profile Line (Luminous Cyan / Emerald)
    const floorColor = isIFR ? "#00f0ff" : "#00ff9d";
    ctx.strokeStyle = floorColor;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = isIFR ? "rgba(0, 240, 255, 0.5)" : "rgba(0, 255, 157, 0.5)";
    ctx.shadowBlur = 6;
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
    ctx.shadowBlur = 0; // reset

    // 6. Draw Waypoint Altitude Needles & Beads
    ctx.font = "9.5px 'JetBrains Mono', monospace";
    profilePoints.forEach((p) => {
      const x = xForDist(p.xStart);
      
      // Vertical dashed needle
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Floor node bead
      const yFloor = yForAlt(p.minAlt);
      ctx.fillStyle = floorColor;
      ctx.beginPath();
      ctx.arc(x, yFloor, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Ceiling node bead
      const yCeiling = yForAlt(p.maxAlt);
      ctx.fillStyle = "#ffb703";
      ctx.beginPath();
      ctx.arc(x, yCeiling, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Waypoint Name Header Badge
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "center";
      ctx.fillText(p.name, x, padTop - 7);
    });

    // Final point needle
    if (profilePoints.length > 0) {
      const lastP = profilePoints[profilePoints.length - 1];
      const xLast = xForDist(lastP.xEnd);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xLast, padTop);
      ctx.lineTo(xLast, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      
      const lastSeg = segments[segments.length - 1];
      const lastPtName = lastSeg.next_point_name || "EXIT";
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "center";
      ctx.fillText(lastPtName, xLast, padTop - 7);
    }

    // 7. Interactive Hover Scanline & Telemetry Tooltip
    if (this.hoverX != null && this.hoverX >= padLeft && this.hoverX <= padLeft + plotW) {
      const hoverNM = ((this.hoverX - padLeft) / plotW) * totalDist;
      
      // Find current leg
      let curLeg = profilePoints[0];
      for (const p of profilePoints) {
        if (hoverNM >= p.xStart && hoverNM <= p.xEnd) {
          curLeg = p;
          break;
        }
      }

      // Draw Laser Scanline
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 1.2;
      ctx.shadowColor = "rgba(0, 240, 255, 0.8)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(this.hoverX, padTop);
      ctx.lineTo(this.hoverX, padTop + plotH);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Telemetry Box
      const tipText = `${hoverNM.toFixed(1)} NM | Alt: ${curLeg.minAlt.toLocaleString()}-${curLeg.maxAlt.toLocaleString()} ft`;
      ctx.font = "10px 'JetBrains Mono', monospace";
      const textW = ctx.measureText(tipText).width;
      
      let tipX = this.hoverX + 10;
      if (tipX + textW + 16 > width) tipX = this.hoverX - textW - 22;
      const tipY = padTop + 14;

      ctx.fillStyle = "rgba(3, 7, 18, 0.9)";
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tipX, tipY - 12, textW + 14, 20, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#00f0ff";
      ctx.textAlign = "left";
      ctx.fillText(tipText, tipX + 7, tipY + 2);
    }
  }
}

window.MTRProfileChart = MTRProfileChart;
