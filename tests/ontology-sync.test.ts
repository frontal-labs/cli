import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliError } from "@/errors/cli-error.js";
import {
  checkOntology,
  collectPages,
  type ObjectTypeFetcher,
  type OntologyContext,
  type PageLike,
  statusOntology,
  syncOntology,
} from "@/lib/ontology/sync.js";
import { writeFileAtomic } from "@/lib/ontology/write.js";

const ERR_JSON_MISSING = /ontology\.json not found/;
const ERR_HASH_MISMATCH = /does not match its schemaHash/;
const ERR_NOT_JSON = /not valid JSON/;

let root: string;
let context: OntologyContext;

const CUSTOMER = {
  fields: {
    email: { required: true, type: "string" },
    status: { enum: ["active", "closed"], required: true, type: "enum" },
  },
  name: "Customer",
  version: 1,
};
const COMPANY = {
  fields: { name: { required: true, type: "string" } },
  name: "Company",
  version: 2,
};

function fetcherOf(types: unknown[]): ObjectTypeFetcher {
  return () => Promise.resolve(JSON.parse(JSON.stringify(types)) as unknown[]);
}

function frontalPath(name: string): string {
  return join(context.frontalDir, name);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-ontology-"));
  context = { frontalDir: join(root, ".frontal"), generatorVersion: "0.1.2" };
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe("syncOntology", () => {
  it("creates every generated file on the first sync", async () => {
    const outcome = await syncOntology(context, fetcherOf([CUSTOMER, COMPANY]));

    expect(outcome.entityCount).toBe(2);
    expect(outcome.files).toEqual({
      client: "created",
      document: "created",
      types: "created",
      version: "created",
    });
    expect(readFileSync(frontalPath("ontology.d.ts"), "utf-8")).toContain(
      "export interface Ontology {"
    );
  });

  it("reports unchanged and writes nothing when the remote ontology did not change", async () => {
    await syncOntology(context, fetcherOf([CUSTOMER, COMPANY]));
    const before = readFileSync(frontalPath("ontology.d.ts"), "utf-8");

    const outcome = await syncOntology(context, fetcherOf([COMPANY, CUSTOMER]));

    expect(Object.values(outcome.files)).toEqual([
      "unchanged",
      "unchanged",
      "unchanged",
      "unchanged",
    ]);
    expect(readFileSync(frontalPath("ontology.d.ts"), "utf-8")).toBe(before);
  });

  it("rewrites every generated file when the hash changes, since each header carries it", async () => {
    await syncOntology(context, fetcherOf([CUSTOMER]));

    const changed = { ...CUSTOMER, version: 2 };
    const outcome = await syncOntology(context, fetcherOf([changed]));

    expect(outcome.files).toEqual({
      client: "updated",
      document: "updated",
      types: "updated",
      version: "updated",
    });
  });

  it("regenerates types when a property is added", async () => {
    await syncOntology(context, fetcherOf([CUSTOMER]));
    const withAge = {
      ...CUSTOMER,
      fields: { ...CUSTOMER.fields, age: { type: "integer" } },
    };

    const outcome = await syncOntology(context, fetcherOf([withAge]));

    expect(outcome.files.types).toBe("updated");
    expect(readFileSync(frontalPath("ontology.d.ts"), "utf-8")).toContain(
      "age?: number | null;"
    );
  });

  it("handles an empty ontology", async () => {
    const outcome = await syncOntology(context, fetcherOf([]));

    expect(outcome.entityCount).toBe(0);
    expect(readFileSync(frontalPath("ontology.d.ts"), "utf-8")).toContain(
      "export type Ontology = Record<never, never>;"
    );
  });

  it("leaves the project untouched when the fetch fails (auth or network)", async () => {
    const failing: ObjectTypeFetcher = () =>
      Promise.reject(new Error("401 Unauthorized"));

    await expect(syncOntology(context, failing)).rejects.toThrow("401");
    expect(existsSync(context.frontalDir)).toBe(false);
  });

  it("rejects malformed backend records before writing anything", async () => {
    await expect(
      syncOntology(context, fetcherOf([{ fields: {} }]))
    ).rejects.toMatchObject({ code: "ONTOLOGY_INVALID" });
    expect(existsSync(context.frontalDir)).toBe(false);
  });

  it("ignores a leftover temp file from an interrupted write", async () => {
    mkdirSync(context.frontalDir, { recursive: true });
    writeFileSync(
      join(context.frontalDir, "ontology.d.ts.123.456.tmp"),
      "half written"
    );

    await syncOntology(context, fetcherOf([CUSTOMER]));

    expect(readFileSync(frontalPath("ontology.d.ts"), "utf-8")).not.toContain(
      "half written"
    );
    expect(checkOntology(context).stale).toEqual([]);
  });

  it("repairs a hand-edited ontology.json on the next sync", async () => {
    await syncOntology(context, fetcherOf([CUSTOMER]));
    writeFileSync(frontalPath("ontology.json"), '{ "format": "broken" }');

    const outcome = await syncOntology(context, fetcherOf([CUSTOMER]));

    expect(outcome.files.document).toBe("updated");
    expect(checkOntology(context).stale).toEqual([]);
  });
});

describe("writeFileAtomic", () => {
  it("returns created, updated, then unchanged", () => {
    const target = join(root, "nested", "file.txt");
    expect(writeFileAtomic(target, "a")).toBe("created");
    expect(writeFileAtomic(target, "b")).toBe("updated");
    expect(writeFileAtomic(target, "b")).toBe("unchanged");
    expect(readFileSync(target, "utf-8")).toBe("b");
  });
});

describe("collectPages", () => {
  function pages(items: number[][], hasMoreOnLast = false): PageLike<number> {
    const build = (index: number): PageLike<number> => ({
      data: items[index] ?? [],
      nextPage: () =>
        Promise.resolve(index + 1 < items.length ? build(index + 1) : null),
      pagination: {
        hasMore: index + 1 < items.length || hasMoreOnLast,
      },
    });
    return build(0);
  }

  it("collects items from every page", async () => {
    expect(await collectPages(pages([[1, 2], [3], [4, 5]]))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("returns a single page without fetching more", async () => {
    const single: PageLike<number> = {
      data: [7],
      nextPage: () => {
        throw new Error("should not be called");
      },
      pagination: { hasMore: false },
    };
    expect(await collectPages(single)).toEqual([7]);
  });

  it("fails when hasMore is true but no next page arrives", async () => {
    let caught: unknown;
    try {
      await collectPages(pages([[1]], true));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).code).toBe("ONTOLOGY_PAGINATION");
  });
});

describe("checkOntology (offline)", () => {
  it("passes right after a sync", async () => {
    await syncOntology(context, fetcherOf([CUSTOMER, COMPANY]));
    expect(checkOntology(context).stale).toEqual([]);
  });

  it("reports the generated file that was edited by hand", async () => {
    await syncOntology(context, fetcherOf([CUSTOMER]));
    writeFileSync(frontalPath("client.ts"), "// edited\n");

    expect(checkOntology(context).stale).toEqual(["client.ts"]);
  });

  it("reports a generated file that is missing", async () => {
    await syncOntology(context, fetcherOf([CUSTOMER]));
    rmSync(frontalPath("version.json"));

    expect(checkOntology(context).stale).toEqual(["version.json"]);
  });

  it("fails when ontology.json is missing", () => {
    expect(() => checkOntology(context)).toThrow(CliError);
    expect(() => checkOntology(context)).toThrow(ERR_JSON_MISSING);
  });

  it("fails when ontology.json was edited so its hash no longer matches", async () => {
    await syncOntology(context, fetcherOf([CUSTOMER]));
    const text = readFileSync(frontalPath("ontology.json"), "utf-8");
    writeFileSync(
      frontalPath("ontology.json"),
      text.replace('"Customer"', '"Customer2"')
    );

    expect(() => checkOntology(context)).toThrow(ERR_HASH_MISMATCH);
  });
});

describe("statusOntology", () => {
  it("is UP TO DATE when the local snapshot matches the remote hash", async () => {
    await syncOntology(context, fetcherOf([CUSTOMER, COMPANY]));

    const status = await statusOntology(
      context,
      fetcherOf([COMPANY, CUSTOMER])
    );

    expect(status.upToDate).toBe(true);
    expect(status.localHash).toBe(status.remoteHash);
    expect(status.remoteEntityCount).toBe(2);
  });

  it("is OUTDATED when the remote ontology changed", async () => {
    await syncOntology(context, fetcherOf([CUSTOMER]));

    const status = await statusOntology(
      context,
      fetcherOf([{ ...CUSTOMER, version: 9 }])
    );

    expect(status.upToDate).toBe(false);
    expect(status.localHash).not.toBe(status.remoteHash);
  });

  it("is OUTDATED with a 'not synced yet' problem before the first sync", async () => {
    const status = await statusOntology(context, fetcherOf([CUSTOMER]));

    expect(status.upToDate).toBe(false);
    expect(status.localHash).toBeUndefined();
    expect(status.localProblem).toBe("not synced yet");
  });

  it("is OUTDATED with a problem when the local snapshot is corrupt", async () => {
    mkdirSync(context.frontalDir, { recursive: true });
    writeFileSync(frontalPath("ontology.json"), "{ not json");

    const status = await statusOntology(context, fetcherOf([CUSTOMER]));

    expect(status.upToDate).toBe(false);
    expect(status.localProblem).toMatch(ERR_NOT_JSON);
  });
});
