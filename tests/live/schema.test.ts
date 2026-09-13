import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_SCHEMA_URL } from "@/lib/project.js";

/**
 * Drift guard between the schema the CLI generates (schemas/frontal.json)
 * and the one published at https://frontal.dev/schemas/frontal.json.
 * Needs network; runs only with FRONTAL_LIVE=1.
 */
const live = process.env.FRONTAL_LIVE === "1";

describe.skipIf(!live)("live: published JSON Schema", () => {
  it("matches schemas/frontal.json", async () => {
    const response = await fetch(PROJECT_SCHEMA_URL);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/schema+json"
    );
    const published = await response.json();
    const local = JSON.parse(
      readFileSync(
        join(import.meta.dirname, "..", "..", "schemas", "frontal.json"),
        "utf-8"
      )
    );
    expect(published).toEqual(local);
  }, 20_000);
});
