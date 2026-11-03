import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GENERATOR_VERSION, ONTOLOGY_FILES } from "@/lib/ontology/constants.js";
import { checkOntology, syncOntology } from "@/lib/ontology/sync.js";

const FIXTURE = join(import.meta.dirname, "fixtures", "ontology-app");

let scratch: string | undefined;

afterEach(() => {
  if (scratch !== undefined) {
    rmSync(scratch, { force: true, recursive: true });
    scratch = undefined;
  }
});

describe("ontology-app fixture", () => {
  it("is exactly what the generator produces from object-types.json", async () => {
    scratch = mkdtempSync(join(tmpdir(), "frontal-fixture-"));
    const raw = JSON.parse(
      readFileSync(join(FIXTURE, "object-types.json"), "utf-8")
    ) as unknown[];

    await syncOntology(
      { frontalDir: scratch, generatorVersion: GENERATOR_VERSION },
      () => Promise.resolve(raw)
    );

    for (const file of Object.values(ONTOLOGY_FILES)) {
      expect(readFileSync(join(scratch, file), "utf-8"), file).toBe(
        readFileSync(join(FIXTURE, ".frontal", file), "utf-8")
      );
    }
  });

  it("passes frontal sync --check", () => {
    const outcome = checkOntology({
      frontalDir: join(FIXTURE, ".frontal"),
      generatorVersion: GENERATOR_VERSION,
    });
    expect(outcome.stale).toEqual([]);
  });
});
