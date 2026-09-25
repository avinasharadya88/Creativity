import express from "express";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { MTRService } from "./src/services/mtrService.js";
import {
  generateSingleRouteXml,
  validateArinc424Xml,
  decodeToPlainEnglish,
} from "./src/generators/arinc424Xml.js";
import { generateMtrFixedRecords } from "./src/generators/arinc424Fixed.js";
import { generateCorridorPolygon } from "./src/generators/corridorCalc.js";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable("x-powered-by");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const service = new MTRService();

// Middlewares
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length > 0) {
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.includes(origin));
    },
  }));
}

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

function requireWriteToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const configuredToken = process.env.API_WRITE_TOKEN;
  if (!configuredToken) {
    return res.status(503).json({
      error: "Route writes are disabled. Set API_WRITE_TOKEN on the server to enable them.",
    });
  }

  const authorization = req.get("authorization") || "";
  const suppliedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : req.get("x-api-key") || "";
  const expected = Buffer.from(configuredToken);
  const supplied = Buffer.from(suppliedToken);

  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ error: "A valid write token is required." });
  }
  next();
}

// 1. Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "eNASR to ARINC 424-23 MTR Explorer" });
});

// 2. List all routes (supports optional ?type=IR/VR/SR)
app.get("/api/routes", (req, res) => {
  try {
    const routeType = typeof req.query.type === "string" ? req.query.type : undefined;
    const routes = service.listRoutes(routeType);
    res.json({ count: routes.length, routes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Unified GeoJSON of all routes
app.get("/api/all/geojson", (_req, res) => {
  try {
    const geojson = service.getAllRoutesGeojson();
    res.json(geojson);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Unified ARINC 424-23 XML of all routes
app.get("/api/all/arinc424-xml", (req, res) => {
  try {
    const asDownload = String(req.query.download).toLowerCase() === "true";
    const xmlStr = service.getArinc424Xml();
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    if (asDownload) {
      res.setHeader("Content-Disposition", 'attachment; filename="ARINC424-23-MTR-ALL.xml"');
    }
    res.send(xmlStr);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Unified ARINC 424 Fixed Records of all routes
app.get("/api/all/arinc424-fixed", (req, res) => {
  try {
    const asDownload = String(req.query.download).toLowerCase() === "true";
    const fixedStr = service.getArinc424Fixed();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    if (asDownload) {
      res.setHeader("Content-Disposition", 'attachment; filename="ARINC424-MTR-ALL.dat"');
    }
    res.send(fixedStr);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Single route operations: /api/routes/:routeId[/sub_action]
app.get("/api/routes/:routeId", (req, res) => {
  try {
    const routeId = req.params.routeId.toUpperCase();
    const route = service.getRouteDetails(routeId);
    if (!route) {
      return res.status(404).json({ error: `Route '${routeId}' not found` });
    }
    res.json(route);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/routes/:routeId/arinc424-xml", (req, res) => {
  try {
    const routeId = req.params.routeId.toUpperCase();
    const asDownload = String(req.query.download).toLowerCase() === "true";
    const route = service.getRouteDetails(routeId);
    if (!route) {
      return res.status(404).json({ error: `Route '${routeId}' not found` });
    }
    const xmlStr = service.getArinc424Xml(routeId);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    if (asDownload) {
      res.setHeader("Content-Disposition", `attachment; filename="ARINC424-23-${routeId}.xml"`);
    }
    res.send(xmlStr);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/routes/:routeId/arinc424-fixed", (req, res) => {
  try {
    const routeId = req.params.routeId.toUpperCase();
    const asDownload = String(req.query.download).toLowerCase() === "true";
    const route = service.getRouteDetails(routeId);
    if (!route) {
      return res.status(404).json({ error: `Route '${routeId}' not found` });
    }
    const fixedStr = service.getArinc424Fixed(routeId);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    if (asDownload) {
      res.setHeader("Content-Disposition", `attachment; filename="ARINC424-${routeId}.dat"`);
    }
    res.send(fixedStr);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/routes/:routeId/geojson", (req, res) => {
  try {
    const routeId = req.params.routeId.toUpperCase();
    const geojson = service.getRouteGeojson(routeId);
    if (!geojson) {
      return res.status(404).json({ error: `Route '${routeId}' not found` });
    }
    res.json(geojson);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/routes/:routeId/plain-english", (req, res) => {
  try {
    const routeId = req.params.routeId.toUpperCase();
    const route = service.getRouteDetails(routeId);
    if (!route) {
      return res.status(404).send(`Route '${routeId}' not found.`);
    }
    const brief = service.getPlainEnglish(routeId);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(brief);
  } catch (err: any) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// 7. Create or update route
app.post("/api/routes", requireWriteToken, (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.route_id) {
      return res.status(400).json({ error: "route_id is required" });
    }
    const created = service.createOrUpdateRoute(payload);
    res.status(201).json({ status: "success", route: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Convert payload on the fly without storing
app.post("/api/convert", (req, res) => {
  try {
    const payload = req.body;
    const xmlOut = generateSingleRouteXml(payload);
    const fixedLines = generateMtrFixedRecords(payload);
    const validation = validateArinc424Xml(xmlOut);
    const plainText = decodeToPlainEnglish(payload);
    const corridor = generateCorridorPolygon(payload.segments || []);

    res.json({
      status: "success",
      validation,
      arinc424_xml: xmlOut,
      arinc424_fixed: fixedLines.join("\n"),
      plain_english: plainText,
      corridor_polygon: corridor,
    });
  } catch (err: any) {
    res.status(400).json({ error: `Conversion error: ${err.message}` });
  }
});

// 9. Static Assets & SPA Fallback
const staticDir = fs.existsSync(path.join(appDir, "static"))
  ? path.join(appDir, "static")
  : (fs.existsSync(path.join(process.cwd(), "static"))
    ? path.join(process.cwd(), "static")
    : path.join(appDir, "mtr_app", "static"));

app.use(express.static(staticDir));

app.get("*all", (_req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

// Start listening
app.listen(PORT, HOST, () => {
  console.log(`✈ eNASR to ARINC 424-23 MTR Explorer listening on http://${HOST}:${PORT}`);
});
