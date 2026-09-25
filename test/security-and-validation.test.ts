import assert from "node:assert/strict";
import test from "node:test";
import { generateArinc424Xml, validateArinc424Xml } from "../src/generators/arinc424Xml.js";
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
