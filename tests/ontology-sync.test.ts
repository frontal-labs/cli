import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliError } from "@/errors/cli-error.js";
import { collectPages, type PageSource } from "@/lib/ontology/paging.js";
import {
  checkOntology,
  type ObjectTypeSource,
  type OntologyContext,
  statusOntology,
  syncOntology,
} from "@/lib/ontology/sync.js";
import { type Writer, writeFileAtomic } from "@/lib/ontology/write.js";

const COMPANY = {
  fields: { name: { required: true, type: "string" } },
  name: "Company",
  version: 1,
};

const CUSTOMER = {
  fields: {
    email: { required: true, type: "string" },
    status: { enum: ["active", "closed"], required: true, type: "enum" },
  },
  name: "Customer",
  relationships: { company: { targetEntity: "Company", type: "belongsTo" } },
  version: 3,
};

const FROZEN_MTIME = new Date("2000-01-01T00:00:00Z");

const ERR_MALFORMED_NAMED =
  /Object type #1 \("Company"\) is malformed at fields\.name\.type/;
const ERR_NO_SNAPSHOT = /ontology\.json not found/;
const ERR_HASH = /does not match its schemaHash/;

let root: string;
let context: OntologyContext;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "frontal-ontology-sync-"));
  context = { frontalDir: join(root, ".frontal"), generatorVersion: "0.1.2" };
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
  vi.restoreAllMocks();
});

/** A source that returns the given raw object types. */
function sourceOf(types: unknown[]): ObjectTypeSource {
  return () => Promise.resolve(structuredClone(types) as unknown[]);
}

function pathOf(file: string): string {
  return join(context.frontalDir, file);
}

function listFrontal(): string[] {
  return existsSync(context.frontalDir)
    ? readdirSync(context.frontalDir).sort()
    : [];
}

function freezeMtimes(): void {
  for (const name of listFrontal()) {
    utimesSync(pathOf(name), FROZEN_MTIME, FROZEN_MTIME);
  }
}

function mtimesOf(): Record<string, number> {
  return Object.fromEntries(
    listFrontal().map((name) => [name, statSync(pathOf(name)).mtimeMs])
  );
}

/** A page source with a fixed envelope and a controllable next page. */
function page(
  data: unknown[],
  hasMore: boolean,
  nextPage: () => Promise<PageSource | null> = () => Promise.resolve(null)
): PageSource {
  return { data, nextPage, pagination: { hasMore } };
}

describe("syncOntology", () => {
  it("creates every file on first sync, with ontology.json written last", async () => {
    const order: string[] = [];
    const writer: Writer = (target, content) => {
      order.push(basename(target));
      return writeFileAtomic(target, content);
    };

    const outcome = await syncOntology(
      context,
      sourceOf([COMPANY, CUSTOMER]),
      writer
    );

    expect(outcome.files).toEqual([
      { file: "ontology.d.ts", outcome: "created" },
      { file: "client.ts", outcome: "created" },
      { file: "version.json", outcome: "created" },
      { file: "ontology.json", outcome: "created" },
    ]);
    expect(order).toEqual([
      "ontology.d.ts",
      "client.ts",
      "version.json",
      "ontology.json",
    ]);
    expect(outcome.entityCount).toBe(2);
    expect(outcome.warnings).toEqual([]);
  });

  it("writes nothing when the ontology has not changed", async () => {
    await syncOntology(context, sourceOf([COMPANY, CUSTOMER]));
    freezeMtimes();
    const before = mtimesOf();

    const outcome = await syncOntology(context, sourceOf([COMPANY, CUSTOMER]));

    expect(outcome.files.every((file) => file.outcome === "unchanged")).toBe(
      true
    );
    expect(mtimesOf()).toEqual(before);
  });

  it("updates the files that changed and reports the rest as unchanged", async () => {
    await syncOntology(context, sourceOf([COMPANY]));
    const outcome = await syncOntology(context, sourceOf([COMPANY, CUSTOMER]));

    const byFile = Object.fromEntries(
      outcome.files.map((file) => [file.file, file.outcome])
    );
    expect(byFile).toEqual({
      "client.ts": "updated",
      "ontology.d.ts": "updated",
      "ontology.json": "updated",
      "version.json": "updated",
    });
    expect(readFileSync(pathOf("ontology.d.ts"), "utf-8")).toContain(
      "Customer: {"
    );
  });

  it("writes an empty ontology as an empty record type", async () => {
    await syncOntology(context, sourceOf([]));
    expect(readFileSync(pathOf("ontology.d.ts"), "utf-8")).toContain(
      "export type Ontology = Record<never, never>;"
    );
    expect(readFileSync(pathOf("client.ts"), "utf-8")).toContain(
      "entities: [],"
    );
  });

  it("reports skipped relations as warnings", async () => {
    const outcome = await syncOntology(
      context,
      sourceOf([
        COMPANY,
        {
          ...CUSTOMER,
          relationships: {
            orders: { targetEntity: "Company", type: "hasMany" },
          },
        },
      ])
    );
    expect(outcome.warnings).toEqual([
      "Skipped Customer.orders (hasMany): no backend query exists yet.",
    ]);
  });

  it("names the object type and field when a record is malformed, and writes nothing", async () => {
    const bad = { fields: { name: { type: "nope" } }, name: "Company" };

    const err = await syncOntology(context, sourceOf([bad])).catch(
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).code).toBe("ONTOLOGY_INVALID");
    expect((err as CliError).message).toMatch(ERR_MALFORMED_NAMED);
    expect(listFrontal()).toEqual([]);
  });

  it("propagates a failing source (for example auth) and writes nothing", async () => {
    const failing: ObjectTypeSource = () =>
      Promise.reject(new Error("401 Unauthorized"));

    await expect(syncOntology(context, failing)).rejects.toThrow(
      "401 Unauthorized"
    );
    expect(listFrontal()).toEqual([]);
  });

  it("removes a temp file left by an interrupted sync and never reads it", async () => {
    mkdirSync(context.frontalDir, { recursive: true });
    const leftover = ".ontology.json.1234.abcd.tmp";
    writeFileSync(pathOf(leftover), "{ this is not json");

    const outcome = await syncOntology(context, sourceOf([COMPANY]));

    expect(outcome.removedTemporaries).toEqual([leftover]);
    expect(listFrontal()).not.toContain(leftover);
  });

  it("leaves no committed snapshot when a write fails partway, so the project is never seen as synced", async () => {
    const failOnDocument: Writer = (target, content) => {
      if (target.endsWith("ontology.json")) {
        throw new Error("disk full");
      }
      return writeFileAtomic(target, content);
    };

    await expect(
      syncOntology(context, sourceOf([COMPANY]), failOnDocument)
    ).rejects.toThrow("disk full");

    expect(existsSync(pathOf("ontology.json"))).toBe(false);
    expect(() => checkOntology(context)).toThrow(ERR_NO_SNAPSHOT);
  });
});

describe("collectPages", () => {
  it("reads every page in order across two pages", async () => {
    const second = page([CUSTOMER], false);
    const first = page([COMPANY], true, () => Promise.resolve(second));

    await expect(collectPages(first)).resolves.toEqual([COMPANY, CUSTOMER]);
  });

  it("fails with no partial result when a later page cannot be read", async () => {
    const first = page([COMPANY], true, () =>
      Promise.reject(new Error("socket hang up"))
    );

    const err = await collectPages(first).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).code).toBe("ONTOLOGY_PAGE_FAILED");
    expect((err as CliError).message).toContain(
      "Could not read object-type page 2. No files were written."
    );
  });

  it("fails when hasMore is true but no next page is returned", async () => {
    const first = page([COMPANY], true, () => Promise.resolve(null));
    await expect(collectPages(first)).rejects.toMatchObject({
      code: "ONTOLOGY_MALFORMED",
    });
  });

  it("rejects a page whose envelope is malformed", async () => {
    const broken = {
      data: "not-an-array",
      nextPage: () => Promise.resolve(null),
      pagination: {},
    } as unknown as PageSource;
    await expect(collectPages(broken)).rejects.toMatchObject({
      code: "ONTOLOGY_MALFORMED",
    });
  });

  it("stops at the page limit so a server that never ends the list cannot loop", async () => {
    const endless: PageSource = page([COMPANY], true, () =>
      Promise.resolve(endless)
    );
    await expect(collectPages(endless, 3)).rejects.toMatchObject({
      code: "ONTOLOGY_PAGE_LIMIT",
    });
  });
});

describe("checkOntology", () => {
  it("reports no stale files for a freshly synced project", async () => {
    await syncOntology(context, sourceOf([COMPANY, CUSTOMER]));
    expect(checkOntology(context).stale).toEqual([]);
  });

  it("flags a generated file that was edited by hand", async () => {
    await syncOntology(context, sourceOf([COMPANY]));
    writeFileSync(pathOf("client.ts"), "// edited\n");
    expect(checkOntology(context).stale).toEqual([
      { file: "client.ts", reason: "differs" },
    ]);
  });

  it("flags a missing generated file", async () => {
    await syncOntology(context, sourceOf([COMPANY]));
    rmSync(pathOf("ontology.d.ts"));
    expect(checkOntology(context).stale).toEqual([
      { file: "ontology.d.ts", reason: "missing" },
    ]);
  });

  it("flags version.json whose hash disagrees with ontology.json", async () => {
    await syncOntology(context, sourceOf([COMPANY]));
    const version = JSON.parse(
      readFileSync(pathOf("version.json"), "utf-8")
    ) as Record<string, unknown>;
    version.schemaHash = `sha256:${"f".repeat(64)}`;
    writeFileSync(pathOf("version.json"), JSON.stringify(version, null, 2));
    expect(checkOntology(context).stale).toEqual([
      { file: "version.json", reason: "hash-mismatch" },
    ]);
  });

  it("rejects a hand-edited ontology.json whose hash no longer matches", async () => {
    await syncOntology(context, sourceOf([COMPANY]));
    const doc = JSON.parse(readFileSync(pathOf("ontology.json"), "utf-8")) as {
      objectTypes: unknown[];
    };
    doc.objectTypes.push({ fields: {}, name: "Injected" });
    writeFileSync(pathOf("ontology.json"), JSON.stringify(doc));
    expect(() => checkOntology(context)).toThrow(ERR_HASH);
  });

  it("ignores a leftover temp file", async () => {
    await syncOntology(context, sourceOf([COMPANY]));
    writeFileSync(pathOf(".client.ts.1.abcd.tmp"), "garbage");
    expect(checkOntology(context).stale).toEqual([]);
  });
});

describe("statusOntology", () => {
  it("reports UP TO DATE when the snapshot matches Frontal", async () => {
    await syncOntology(context, sourceOf([COMPANY]));
    const outcome = await statusOntology(context, sourceOf([COMPANY]));
    expect(outcome.upToDate).toBe(true);
    expect(outcome.local).toEqual({
      entityCount: 1,
      schemaHash: outcome.remote.schemaHash,
      state: "synced",
    });
  });

  it("reports OUTDATED when Frontal has changed", async () => {
    await syncOntology(context, sourceOf([COMPANY]));
    const outcome = await statusOntology(
      context,
      sourceOf([COMPANY, CUSTOMER])
    );
    expect(outcome.upToDate).toBe(false);
    expect(outcome.remote.entityCount).toBe(2);
  });

  it("reports a project that has never synced as OUTDATED", async () => {
    const outcome = await statusOntology(context, sourceOf([COMPANY]));
    expect(outcome.local).toEqual({ state: "missing" });
    expect(outcome.upToDate).toBe(false);
  });

  it("reports an unreadable snapshot with the reason", async () => {
    mkdirSync(context.frontalDir, { recursive: true });
    writeFileSync(pathOf("ontology.json"), "{ broken");
    const outcome = await statusOntology(context, sourceOf([COMPANY]));
    expect(outcome.local).toMatchObject({ state: "unreadable" });
    expect(outcome.upToDate).toBe(false);
  });

  it("fetches from Frontal exactly once", async () => {
    await syncOntology(context, sourceOf([COMPANY]));
    const source = vi.fn(sourceOf([COMPANY]));
    await statusOntology(context, source);
    expect(source).toHaveBeenCalledTimes(1);
  });
});
