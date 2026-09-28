import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateArinc424Xml, validateArinc424Xml } from "../src/generators/arinc424Xml.js";
import { generateMtrFixedRecords, RECORD_LENGTH } from "../src/generators/arinc424Fixed.js";
import { generateCorridorPolygon, validateCorridorPolygon } from "../src/generators/corridorCalc.js";
import { MTRService } from "../src/services/mtrService.js";
import type { MTRRoute } from "../src/types.js";

function route(routeId: string, segmentCount: number): MTRRoute {
  return {
    route_id: routeId,
    route_type: "IR",
    route_name: `${routeId} route`,
    originating_agency: "Test agency",
    artcc_facility: "ZLA",
    floor_alt_ft: 100,
    ceiling_alt_ft: 10000,
    route_width_nm: 10,
    airac_cycle: "2609",
    segments: Array.from({ length: segmentCount }, (_, index) => ({
      sequence_num: index + 1,
      point_name: `PT_${index + 1}`,
      point_type: index === 0 ? "ENTRY" : index === segmentCount - 1 ? "EXIT" : "WAYPOINT",
      latitude_dec: 34 + index * 0.1,
      longitude_dec: -117 + index * 0.1,
    })),
  };
}

test("XML validation reports each route's own segment count", () => {
  const result = validateArinc424Xml(generateArinc424Xml([route("IR-1", 2), route("IR-2", 3)]));
  assert.equal(result.valid, true);
  assert.deepEqual(result.routes?.map((item) => item.segment_count), [2, 3]);
});

test("route writes reject out-of-range coordinates", () => {
  const service = new MTRService();
  const invalid = route("IR-TEST", 2);
  invalid.segments[0].latitude_dec = 91;
  assert.throws(() => service.createOrUpdateRoute(invalid), /outside WGS84 bounds/);
});

test("route writes reject markup in waypoint identifiers", () => {
  const service = new MTRService();
  const invalid = route("IR-TEST", 2);
  invalid.segments[0].point_name = '<img src=x onerror="alert(1)">';
  assert.throws(() => service.createOrUpdateRoute(invalid), /unsupported characters/);
});

test("AIRAC cycle is supplied by route metadata and occupies the fixed record tail", () => {
  const sample = route("IR-TEST", 2);
  sample.airac_cycle = "2610";
  const xml = generateArinc424Xml([sample]);
  const records = generateMtrFixedRecords(sample);
  assert.match(xml, /cycle="2610"/);
  assert.match(xml, /<EffectiveCycle>2610<\/EffectiveCycle>/);
  assert.equal(records[0].length, RECORD_LENGTH);
  assert.equal(records[0].slice(128), "2610");
});

test("exports reject routes without AIRAC metadata", () => {
  const sample = route("IR-TEST", 2);
  delete sample.airac_cycle;
  assert.throws(() => generateArinc424Xml([sample]), /AIRAC cycle is required/);
  assert.throws(() => generateMtrFixedRecords(sample), /AIRAC cycle is required/);
});

test("corridor joins form a closed polygon without self intersections", () => {
  const sample = route("IR-TURN", 3);
  sample.segments[0].latitude_dec = 34;
  sample.segments[0].longitude_dec = -117;
  sample.segments[1].latitude_dec = 34.5;
  sample.segments[1].longitude_dec = -117;
  sample.segments[2].latitude_dec = 34.5;
  sample.segments[2].longitude_dec = -116.5;
  const polygon = generateCorridorPolygon(sample.segments);
  assert.deepEqual(polygon[0], polygon.at(-1));
  assert.deepEqual(validateCorridorPolygon(polygon), { valid: true });
});

test("route edits persist and keep a rollback snapshot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mtr-service-"));
  const options = {
    dataFile: path.join(directory, "routes.json"),
    auditFile: path.join(directory, "audit.jsonl"),
    historyDir: path.join(directory, "history"),
  };
  try {
    const service = new MTRService(options);
    const original = route("IR-PERSIST", 2);
    service.createOrUpdateRoute(original, "test");
    service.createOrUpdateRoute({ ...original, route_name: "Updated route" }, "test");

    const restarted = new MTRService(options);
    assert.equal(restarted.getRouteDetails("IR-PERSIST")?.route_name, "Updated route");
    assert.equal(restarted.listRouteVersions("IR-PERSIST").length, 1);
    assert.match(fs.readFileSync(options.auditFile, "utf8"), /"action":"update"/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
