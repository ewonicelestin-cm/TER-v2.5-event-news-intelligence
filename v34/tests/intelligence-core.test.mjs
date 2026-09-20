import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("v3.6 intelligence core exposes graph, scenarios and pipeline", async () => {
  const intelligence = await readFile(new URL("../src/core/intelligence/index.ts", import.meta.url), "utf8");
  const graph = await readFile(new URL("../src/core/graph/index.ts", import.meta.url), "utf8");
  assert.match(intelligence, /buildScenarios/);
  assert.match(intelligence, /buildEvidenceGraph/);
  assert.match(intelligence, /pipeline/);
  assert.match(graph, /EvidenceGraph/);
  assert.match(graph, /CONTRADICTS/);
});
