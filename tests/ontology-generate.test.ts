import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CliError } from "@/errors/cli-error.js";
import { buildDocument } from "@/lib/ontology/document.js";
import { generateFiles } from "@/lib/ontology/generate.js";
import { normalizeOntology } from "@/lib/ontology/model.js";

const FIXTURE_DIR = join(import.meta.dirname, "fixtures", "ontology-app");
const FIXTURE_TYPES = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "object-types.json"), "utf-8")
) as unknown[];

const TIMESTAMP_TEXT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const READ_ID_FIRST = /read: \{\n\s+id: string;/;
const READ_LABEL = /read: \{[\s\S]*?\n\s+label: string;/;
const READ_NOTE = /read: \{[\s\S]*?\n\s+note\?: string \| null;/;
const LABEL_REQUIRED = /\blabel: string;/;
const ERR_UNKNOWN_GHOST = /unknown entity "Ghost"/;
const ERR_MY_CUSTOMER = /both map to the type name "MyCustomer"/;
const ERR_SDK_NAMESPACE = /collides with the SDK namespace/;
const ERR_MY_AB_X = /both map to the type name "MyAbX"/;
const ERR_MISSING_RECORD = /Object type #1 is malformed/;
const ERR_MALFORMED = /is malformed/;
const ERR_ENUM_EMPTY = /is an enum without values/;
const ERR_ENUM_DUPLICATE = /duplicate enum values/;
const ERR_DUPLICATE_ENTITY = /defined more than once/;
const ERR_RELATION_FIELD_CLASH = /has the same name as a field/;

function render(raw: unknown[]) {
  const data = buildDocument(raw);
  const model = normalizeOntology(raw);
  return {
    data,
    files: generateFiles(model, {
      generatorVersion: "0.1.2",
      schemaHash: data.schemaHash,
    }),
    model,
  };
}

/** Minimal object type with the given fields. */
function entity(
  name: string,
  fields: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  return { fields, name, ...extra };
}

function expectInvalid(raw: unknown[], pattern: RegExp): void {
  let caught: unknown;
  try {
    normalizeOntology(raw);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(CliError);
  expect((caught as CliError).code).toBe("ONTOLOGY_INVALID");
  expect((caught as CliError).message).toMatch(pattern);
}

describe("generated output for the sample ontology", () => {
  it("matches the committed fixture files byte for byte", () => {
    const { files } = render(FIXTURE_TYPES);
    expect(files.ontologyDts).toBe(
      readFileSync(join(FIXTURE_DIR, ".frontal", "ontology.d.ts"), "utf-8")
    );
    expect(files.clientTs).toBe(
      readFileSync(join(FIXTURE_DIR, ".frontal", "client.ts"), "utf-8")
    );
    expect(files.versionJson).toBe(
      readFileSync(join(FIXTURE_DIR, ".frontal", "version.json"), "utf-8")
    );
  });

  it("is deterministic: same input gives identical bytes and hash", () => {
    const first = render(FIXTURE_TYPES);
    const second = render(FIXTURE_TYPES);
    expect(second.files).toEqual(first.files);
    expect(second.data.schemaHash).toBe(first.data.schemaHash);
  });

  it("is independent of backend record order", () => {
    const reversed = [...FIXTURE_TYPES].reverse();
    const forward = render(FIXTURE_TYPES);
    const backward = render(reversed);
    expect(backward.files).toEqual(forward.files);
    expect(backward.data.schemaHash).toBe(forward.data.schemaHash);
  });

  it("contains no timestamps", () => {
    const { files } = render(FIXTURE_TYPES);
    for (const content of Object.values(files)) {
      expect(content).not.toMatch(TIMESTAMP_TEXT);
    }
  });
});

describe("type mapping", () => {
  it("maps each backend field type to its TypeScript type", () => {
    const { files } = render([
      entity("Sample", {
        a: { required: true, type: "string" },
        b: { required: true, type: "text" },
        c: { required: true, type: "uuid" },
        d: { required: true, type: "integer" },
        e: { required: true, type: "float" },
        f: { required: true, type: "currency" },
        g: { required: true, type: "boolean" },
        h: { required: true, type: "timestamp" },
        i: { required: true, type: "json" },
        j: { required: true, type: "vector" },
        k: { items: "integer", required: true, type: "array" },
      }),
    ]);
    const read = files.ontologyDts.slice(files.ontologyDts.indexOf("read:"));
    expect(read).toContain("a: string;");
    expect(read).toContain("b: string;");
    expect(read).toContain("c: string;");
    expect(read).toContain("d: number;");
    expect(read).toContain("e: number;");
    expect(read).toContain("f: number;");
    expect(read).toContain("g: boolean;");
    expect(read).toContain("h: string;");
    expect(read).toContain("i: unknown;");
    expect(read).toContain("j: number[];");
    expect(read).toContain("k: number[];");
  });

  it("generates a named string-literal union for enums, in declaration order", () => {
    const { files } = render([
      entity("Order", {
        status: {
          enum: ["pending", "completed", "failed"],
          required: true,
          type: "enum",
        },
      }),
    ]);
    expect(files.ontologyDts).toContain(
      'export type OrderStatus = "pending" | "completed" | "failed";'
    );
    expect(files.ontologyDts).toContain("status: OrderStatus;");
  });
});

describe("read, create and update rules", () => {
  const { files } = render([
    entity("Item", {
      auto: { auto: true, required: true, type: "string" },
      computed: { computed: true, type: "integer" },
      defaulted: { default: 1, required: true, type: "integer" },
      label: { required: true, type: "string" },
      note: { type: "text" },
      pk: { primary: true, required: true, type: "uuid" },
    }),
  ]);

  it("always exposes id and makes required fields non-optional on read", () => {
    expect(files.ontologyDts).toMatch(READ_ID_FIRST);
    expect(files.ontologyDts).toMatch(READ_LABEL);
    expect(files.ontologyDts).toMatch(READ_NOTE);
  });

  it("excludes primary, auto and computed fields from create and update", () => {
    const create = sectionOf(files.ontologyDts, "create");
    const update = sectionOf(files.ontologyDts, "update");
    for (const block of [create, update]) {
      expect(block).not.toContain("pk");
      expect(block).not.toContain("auto");
      expect(block).not.toContain("computed");
    }
  });

  it("requires a required, non-defaulted field in create only", () => {
    const create = sectionOf(files.ontologyDts, "create");
    expect(create).toContain("label: string;");
    expect(create).toContain("defaulted?: number;");
    expect(create).toContain("note?: string | null;");
  });

  it("makes every writable field optional in update", () => {
    const update = sectionOf(files.ontologyDts, "update");
    expect(update).toContain("label?: string;");
    expect(update).toContain("defaulted?: number;");
    expect(update).not.toMatch(LABEL_REQUIRED);
  });
});

describe("relations", () => {
  it("generates a lazy belongsTo accessor with a foreign key that is optional when not required", () => {
    const { files } = render([
      entity(
        "Customer",
        { email: { required: true, type: "string" } },
        {
          relationships: {
            company: { targetEntity: "Company", type: "belongsTo" },
          },
        }
      ),
      entity("Company", { name: { required: true, type: "string" } }),
    ]);
    expect(files.ontologyDts).toContain(
      'company: { target: "Company"; optional: true };'
    );
    // ASSUMPTION path: the undeclared foreign key is exposed as an optional string field.
    expect(files.ontologyDts).toContain("companyId?: string | null;");
    expect(files.clientTs).toContain(
      'company: { foreignKey: "companyId", target: "Company" },'
    );
  });

  it("marks a relation non-optional when its declared foreign key is required", () => {
    const { files } = render([
      entity(
        "Order",
        { customerId: { required: true, type: "uuid" } },
        {
          relationships: {
            customer: {
              foreignKey: "customerId",
              targetEntity: "Customer",
              type: "belongsTo",
            },
          },
        }
      ),
      entity("Customer", {}),
    ]);
    expect(files.ontologyDts).toContain(
      'customer: { target: "Customer"; optional: false };'
    );
  });

  it("supports hasOne the same way as belongsTo", () => {
    const { files } = render([
      entity(
        "User",
        {},
        {
          relationships: {
            profile: { targetEntity: "Profile", type: "hasOne" },
          },
        }
      ),
      entity("Profile", {}),
    ]);
    expect(files.ontologyDts).toContain(
      'profile: { target: "Profile"; optional: true };'
    );
  });

  it("skips hasMany and manyToMany with a warning", () => {
    const { data, model, files } = render([
      entity(
        "Customer",
        {},
        {
          relationships: {
            orders: { targetEntity: "Order", type: "hasMany" },
            tags: { targetEntity: "Tag", type: "manyToMany" },
          },
        }
      ),
      entity("Order", {}),
      entity("Tag", {}),
    ]);
    expect(data.objectTypes).toHaveLength(3);
    expect(model.warnings).toEqual([
      "Skipped Customer.orders (hasMany): no backend query exists yet.",
      "Skipped Customer.tags (manyToMany): no backend query exists yet.",
    ]);
    expect(files.ontologyDts).not.toContain("orders:");
    expect(files.ontologyDts).not.toContain("tags:");
  });

  it("handles cyclic relations without expanding them", () => {
    const { files } = render([
      entity(
        "Person",
        {},
        {
          relationships: {
            employer: { targetEntity: "Company", type: "belongsTo" },
          },
        }
      ),
      entity(
        "Company",
        {},
        {
          relationships: { ceo: { targetEntity: "Person", type: "belongsTo" } },
        }
      ),
    ]);
    expect(files.ontologyDts).toContain(
      'ceo: { target: "Person"; optional: true };'
    );
    expect(files.ontologyDts).toContain(
      'employer: { target: "Company"; optional: true };'
    );
  });

  it("rejects a relation whose name matches a field", () => {
    expectInvalid(
      [
        entity(
          "Customer",
          { company: { type: "string" } },
          {
            relationships: {
              company: { targetEntity: "Customer", type: "belongsTo" },
            },
          }
        ),
      ],
      ERR_RELATION_FIELD_CLASH
    );
  });

  it("rejects a relation to an unknown entity", () => {
    expectInvalid(
      [
        entity(
          "Customer",
          {},
          {
            relationships: {
              company: { targetEntity: "Ghost", type: "belongsTo" },
            },
          }
        ),
      ],
      ERR_UNKNOWN_GHOST
    );
  });
});

describe("identifiers and naming", () => {
  it("quotes entity and field names that are not identifiers", () => {
    const { files } = render([
      entity("legacy-account", {
        "first name": { required: true, type: "string" },
      }),
    ]);
    expect(files.ontologyDts).toContain('"legacy-account": {');
    expect(files.ontologyDts).toContain('"first name": string;');
    expect(files.clientTs).toContain('"legacy-account"');
  });

  it("does not fail on TypeScript reserved words used as names", () => {
    const { files } = render([
      entity("class", { default: { required: true, type: "string" } }),
    ]);
    expect(files.ontologyDts).toContain("class: {");
    expect(files.ontologyDts).toContain("default: string;");
  });

  it("rejects entities whose PascalCase type names collide", () => {
    expectInvalid(
      [entity("my-customer", {}), entity("myCustomer", {})],
      ERR_MY_CUSTOMER
    );
  });

  it("rejects entity names that collide with SDK namespaces", () => {
    expectInvalid([entity("objects", {})], ERR_SDK_NAMESPACE);
  });

  it("rejects enum type names that collide", () => {
    expectInvalid(
      [
        entity("my-ab", { x: { enum: ["x"], required: true, type: "enum" } }),
        entity("my", { "ab-x": { enum: ["y"], required: true, type: "enum" } }),
      ],
      ERR_MY_AB_X
    );
  });

  it("does not emit a separate id property for a field named id", () => {
    const { files } = render([
      entity("Thing", {
        id: { required: true, type: "uuid" },
        name: { required: true, type: "string" },
      }),
    ]);
    const occurrences = files.ontologyDts.match(/\bid: string;/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });
});

describe("validation of malformed input", () => {
  it("rejects a record that is not an object type", () => {
    expectInvalid([{ fields: {} }], ERR_MISSING_RECORD);
  });

  it("rejects an unknown field type", () => {
    expectInvalid(
      [entity("A", { x: { required: true, type: "widget" } })],
      ERR_MALFORMED
    );
  });

  it("rejects an enum without values", () => {
    expectInvalid(
      [entity("A", { x: { required: true, type: "enum" } })],
      ERR_ENUM_EMPTY
    );
  });

  it("rejects duplicate enum values", () => {
    expectInvalid(
      [entity("A", { x: { enum: ["a", "a"], required: true, type: "enum" } })],
      ERR_ENUM_DUPLICATE
    );
  });

  it("rejects duplicate entity names", () => {
    expectInvalid([entity("A", {}), entity("A", {})], ERR_DUPLICATE_ENTITY);
  });
});

describe("empty ontology", () => {
  it("generates a usable declaration with no entities", () => {
    const { files } = render([]);
    expect(files.ontologyDts).toContain(
      "export type Ontology = Record<never, never>;"
    );
    expect(files.clientTs).toContain("entities: []");
    expect(files.clientTs).toContain("relations: {}");
  });
});

/** Extracts the body of the first `<member>: { ... }` block inside an entity. */
function sectionOf(source: string, member: string): string {
  const start = source.indexOf(`${member}: {`);
  if (start === -1) {
    return source.slice(source.indexOf(`${member}: `));
  }
  const end = source.indexOf("};", start);
  return source.slice(start, end);
}
