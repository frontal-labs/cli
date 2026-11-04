import { describe, expect, it } from "vitest";
import { CliError } from "@/errors/cli-error.js";
import { normalizeOntology } from "@/lib/ontology/normalize.js";
import { objectType } from "./support/object-types.js";

const ERR_PROTO_FK =
  /"Customer\.__proto__" is a reserved JavaScript property name/;

const ERR = {
  arrayItem: /unsupported array item type "widget"/,
  dupEntity: /Entity "Customer" is defined more than once/,
  dupEnumValues: /has duplicate enum values/,
  emptyEnum: /is an enum without values/,
  entityClash: /both map to the type name "MyCustomer"/,
  enumClash: /both map to the type name "ABC"/,
  fieldClash: /has the same name as a field/,
  malformed:
    /Object type #2 \("Company"\) is malformed at schema\.fields\.name\.type/,
  reservedEntity: /collides with the SDK namespace ontology\.objects/,
  reservedMember: /uses the reserved member name "id"/,
  unknownTarget: /targets unknown entity "Ghost"/,
  unsafeEntity: /Entity "__proto__" is a reserved JavaScript property name/,
  unsafeField: /"Customer\.constructor" is a reserved JavaScript property name/,
} as const;

/** Minimal object type: `extra` (relationships, version) goes into its schema. */
function entity(
  name: string,
  fields: Record<string, unknown> = {},
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return objectType(name, { fields, ...extra });
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
  expect((caught as CliError).exitCode).toBe(2);
  expect((caught as CliError).message).toMatch(pattern);
}

describe("normalizeOntology: valid input", () => {
  it("sorts entities, fields and relations by name", () => {
    const model = normalizeOntology([
      entity("Zebra", { a: { type: "string" }, b: { type: "string" } }),
      entity(
        "Apple",
        {},
        {
          relationships: {
            c: { targetEntity: "Zebra", type: "belongsTo" },
            z: { targetEntity: "Zebra", type: "belongsTo" },
          },
        }
      ),
    ]);
    expect(model.entities.map((e) => e.name)).toEqual(["Apple", "Zebra"]);
    expect(model.entities[1]?.fields.map((f) => f.name)).toEqual(["a", "b"]);
    expect(model.entities[0]?.relations.map((r) => r.name)).toEqual(["c", "z"]);
  });

  it("drops the object id field, which is not a separate property", () => {
    const model = normalizeOntology([
      entity("Customer", { id: { required: true, type: "uuid" } }),
    ]);
    expect(model.entities[0]?.fields).toEqual([]);
  });

  it("classifies read-only fields from primary, auto and computed flags", () => {
    const model = normalizeOntology([
      entity("Customer", {
        auto: { auto: true, type: "string" },
        comp: { computed: true, type: "string" },
        key: { primary: true, type: "string" },
        plain: { type: "string" },
      }),
    ]);
    const readOnly = Object.fromEntries(
      model.entities[0]?.fields.map((f) => [f.name, f.readOnly]) ?? []
    );
    expect(readOnly).toEqual({
      auto: true,
      comp: true,
      key: true,
      plain: false,
    });
  });

  it("adds an undeclared belongsTo foreign key as an optional writable uuid", () => {
    const model = normalizeOntology([
      entity("Company"),
      entity(
        "Customer",
        {},
        {
          relationships: {
            company: { targetEntity: "Company", type: "belongsTo" },
          },
        }
      ),
    ]);
    const customer = model.entities.find((e) => e.name === "Customer");
    expect(customer?.relations).toEqual([
      {
        foreignKey: "companyId",
        kind: "belongsTo",
        name: "company",
        optional: true,
        target: "Company",
      },
    ]);
    expect(customer?.fields).toEqual([
      {
        hasDefault: false,
        kind: { kind: "scalar", type: "uuid" },
        name: "companyId",
        readOnly: false,
        required: false,
      },
    ]);
  });

  it("uses a declared foreignKey and marks it required when the field is required", () => {
    const model = normalizeOntology([
      entity("Company"),
      entity(
        "Customer",
        { ownerRef: { required: true, type: "uuid" } },
        {
          relationships: {
            owner: {
              foreignKey: "ownerRef",
              targetEntity: "Company",
              type: "belongsTo",
            },
          },
        }
      ),
    ]);
    expect(model.entities[1]?.relations[0]).toMatchObject({
      foreignKey: "ownerRef",
      optional: false,
    });
  });

  it("returns an empty model for an empty ontology", () => {
    expect(normalizeOntology([])).toEqual({ entities: [], warnings: [] });
  });
});

describe("normalizeOntology: relationship-instance relations", () => {
  const KINDS = [
    {
      kind: "hasOne",
      name: "primaryAddress",
      optional: true,
      target: "Address",
    },
    { kind: "hasMany", name: "orders", optional: false, target: "Order" },
    { kind: "manyToMany", name: "labels", optional: false, target: "Label" },
  ] as const;

  it.each(KINDS)(
    "translates $kind into an accessor with its relationship type",
    (relation) => {
      const model = normalizeOntology([
        entity("Address"),
        entity("Label"),
        entity("Order"),
        entity(
          "Customer",
          {},
          {
            relationships: {
              [relation.name]: {
                relationshipTypeId: `rt_${relation.name}`,
                targetEntity: relation.target,
                type: relation.kind,
              },
            },
          }
        ),
      ]);
      expect(model.warnings).toEqual([]);
      expect(
        model.entities.find((e) => e.name === "Customer")?.relations
      ).toEqual([
        {
          kind: relation.kind,
          name: relation.name,
          optional: relation.optional,
          relationshipTypeId: `rt_${relation.name}`,
          target: relation.target,
        },
      ]);
    }
  );

  it.each(KINDS)(
    "rejects $kind without a relationshipTypeId, naming the relation",
    (relation) => {
      expectInvalid(
        [
          entity("Address"),
          entity("Label"),
          entity("Order"),
          entity(
            "Customer",
            {},
            {
              relationships: {
                [relation.name]: {
                  targetEntity: relation.target,
                  type: relation.kind,
                },
              },
            }
          ),
        ],
        new RegExp(
          `Relation "Customer\\.${relation.name}" \\(${relation.kind}\\) needs a relationshipTypeId`
        )
      );
    }
  );

  it("still validates the target of a relationship-instance relation", () => {
    expectInvalid(
      [
        entity(
          "Customer",
          {},
          {
            relationships: {
              orders: {
                relationshipTypeId: "rt_orders",
                targetEntity: "Ghost",
                type: "hasMany",
              },
            },
          }
        ),
      ],
      ERR.unknownTarget
    );
  });
});

describe("normalizeOntology: rejected ontologies (ONTOLOGY_INVALID)", () => {
  it("names the object type and field when a record is malformed", () => {
    expectInvalid(
      [entity("Customer"), entity("Company", { name: { type: "not-a-type" } })],
      ERR.malformed
    );
  });

  it("rejects duplicate entity names", () => {
    expectInvalid([entity("Customer"), entity("Customer")], ERR.dupEntity);
  });

  it("rejects entities whose PascalCase type names collide", () => {
    expectInvalid(
      [entity("my-customer"), entity("MyCustomer")],
      ERR.entityClash
    );
  });

  it("rejects entity names that collide with SDK namespaces", () => {
    expectInvalid([entity("objects")], ERR.reservedEntity);
  });

  it("rejects entity names that are JavaScript object internals", () => {
    expectInvalid([entity("__proto__")], ERR.unsafeEntity);
  });

  it("rejects field names that are JavaScript object internals", () => {
    expectInvalid(
      [entity("Customer", { constructor: { type: "string" } })],
      ERR.unsafeField
    );
  });

  it("rejects an enum without values", () => {
    expectInvalid(
      [entity("Customer", { status: { type: "enum" } })],
      ERR.emptyEnum
    );
  });

  it("rejects duplicate enum values", () => {
    expectInvalid(
      [entity("Customer", { status: { enum: ["a", "a"], type: "enum" } })],
      ERR.dupEnumValues
    );
  });

  it("rejects enum type names that collide across entities", () => {
    // "a" + "b-c" and "aB" + "c" both produce the enum type name "ABC".
    expectInvalid(
      [
        entity("a", { "b-c": { enum: ["x"], type: "enum" } }),
        entity("aB", { c: { enum: ["y"], type: "enum" } }),
      ],
      ERR.enumClash
    );
  });

  it("rejects array items of an unsupported type", () => {
    expectInvalid(
      [entity("Customer", { tags: { items: "widget", type: "array" } })],
      ERR.arrayItem
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
      ERR.unknownTarget
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
      ERR.fieldClash
    );
  });

  it("rejects a relation whose name matches the generated foreign key of another relation", () => {
    expectInvalid(
      [
        entity("Company"),
        entity(
          "Customer",
          {},
          {
            relationships: {
              company: {
                foreignKey: "owner",
                targetEntity: "Company",
                type: "belongsTo",
              },
              owner: { targetEntity: "Company", type: "belongsTo" },
            },
          }
        ),
      ],
      ERR.fieldClash
    );
  });

  it("rejects a relation named id", () => {
    expectInvalid(
      [
        entity("Company"),
        entity(
          "Customer",
          {},
          {
            relationships: {
              id: { targetEntity: "Company", type: "belongsTo" },
            },
          }
        ),
      ],
      ERR.reservedMember
    );
  });

  it("rejects a foreign key named id", () => {
    expectInvalid(
      [
        entity("Company"),
        entity(
          "Customer",
          {},
          {
            relationships: {
              company: {
                foreignKey: "id",
                targetEntity: "Company",
                type: "belongsTo",
              },
            },
          }
        ),
      ],
      ERR.reservedMember
    );
  });

  it("rejects a foreign key that is a JavaScript object internal", () => {
    expectInvalid(
      [
        entity("Company"),
        entity(
          "Customer",
          {},
          {
            relationships: {
              company: {
                foreignKey: "__proto__",
                targetEntity: "Company",
                type: "belongsTo",
              },
            },
          }
        ),
      ],
      ERR_PROTO_FK
    );
  });
});
