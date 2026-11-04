import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMockOntologyBackend,
  type MockObjectType,
  type MockOntologyBackend,
} from "./support/mock-ontology-backend";

/**
 * One test per rule in docs/backend-spec/CONTRACT-v2.md. Every assertion goes
 * through the mock's HTTP surface, so the wire format is what is checked.
 */

const CUSTOMER_SCHEMA = {
  fields: {
    active: { type: "boolean" },
    age: { type: "integer" },
    blob: { type: "json" },
    created: { type: "timestamp" },
    email: { required: true, type: "string" },
    nickname: { type: "text" },
    ref: { type: "uuid" },
    score: { type: "float" },
    status: { enum: ["active", "closed"], type: "enum" },
    tags: { items: "string", type: "array" },
  },
  relationships: {
    company: {
      foreignKey: "companyId",
      targetEntity: "Company",
      type: "belongsTo",
    },
  },
  version: 1,
};

const COMPANY_SCHEMA = { fields: { name: { type: "string" } } };

const OBJECT_TYPES: MockObjectType[] = [
  { name: "Customer", object_type_id: "ot_customer", schema: CUSTOMER_SCHEMA },
  { name: "Company", object_type_id: "ot_company", schema: COMPANY_SCHEMA },
];

const UUID_PATTERN = /^[0-9a-f-]{36}$/;

let mock: MockOntologyBackend;

beforeEach(async () => {
  mock = createMockOntologyBackend({ objectTypes: OBJECT_TYPES });
  await mock.start();
});

afterEach(async () => {
  await mock.stop();
});

interface Reply {
  body: unknown;
  etag: string | null;
  status: number;
}

async function call(
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {}
): Promise<Reply> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${mock.token}`,
    ...options.headers,
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const res = await fetch(`${mock.url}${path}`, { body, headers, method });
  const text = await res.text();
  return {
    body: text === "" ? undefined : JSON.parse(text),
    etag: res.headers.get("etag"),
    status: res.status,
  };
}

function customer(id: string, properties: Record<string, unknown>) {
  return { object_id: id, object_type_id: "ot_customer", properties };
}

/** Writes `count` customers `c-00`, `c-01`, ... so ids sort in creation order. */
async function seedCustomers(count: number): Promise<void> {
  const writes = Array.from({ length: count }, (_, i) => {
    const id = `c-${String(i).padStart(2, "0")}`;
    return call("PUT", `/ontology/objects/objects/${id}`, {
      body: customer(id, {
        active: i % 2 === 0,
        age: 20 + i,
        email: `user${i}@example.com`,
        score: i / 2,
        status: i % 2 === 0 ? "active" : "closed",
      }),
    });
  });
  for (const res of await Promise.all(writes)) {
    expect(res.status).toBe(200);
  }
}

function queryBody(extra: Record<string, unknown> = {}) {
  return { object_type_id: "ot_customer", ...extra };
}

async function query(body: Record<string, unknown>): Promise<Reply> {
  return call("POST", "/ontology/objects/objects/query", { body });
}

function ids(reply: Reply): string[] {
  const { results } = reply.body as { results: { object_id: string }[] };
  return results.map((object) => object.object_id);
}

function errorCode(reply: Reply): unknown {
  return (reply.body as { code?: unknown }).code;
}

const ETAG_SHAPE = /^"\d+"$/;

describe("revisions", () => {
  it("starts at 1 on create and increments on every write", async () => {
    await call("POST", "/ontology/objects/objects", {
      body: customer("c-rev", { email: "a@example.com" }),
    });
    expect((await call("GET", "/ontology/objects/objects/c-rev")).etag).toBe(
      '"1"'
    );
    expect(
      (
        await call("PUT", "/ontology/objects/objects/c-rev", {
          body: customer("c-rev", { email: "b@example.com" }),
        })
      ).etag
    ).toBe('"2"');
    expect(
      (
        await call("PUT", "/ontology/objects/objects/c-rev", {
          body: customer("c-rev", { email: "c@example.com" }),
        })
      ).etag
    ).toBe('"3"');
  });

  it("does not reuse a revision after delete and recreate", async () => {
    await call("PUT", "/ontology/objects/objects/c-del", {
      body: customer("c-del", { email: "a@example.com" }),
    });
    await call("DELETE", "/ontology/objects/objects/c-del");
    const recreated = await call("PUT", "/ontology/objects/objects/c-del", {
      body: customer("c-del", { email: "b@example.com" }),
    });
    expect(recreated.etag).toBe('"2"');
  });

  it("sends a quoted integer ETag on GET and PUT", async () => {
    await call("PUT", "/ontology/objects/objects/c-etag", {
      body: customer("c-etag", { email: "a@example.com" }),
    });
    const got = await call("GET", "/ontology/objects/objects/c-etag");
    const put = await call("PUT", "/ontology/objects/objects/c-etag", {
      body: customer("c-etag", { email: "b@example.com" }),
    });
    expect(got.etag).toMatch(ETAG_SHAPE);
    expect(put.etag).toMatch(ETAG_SHAPE);
  });
});

describe("If-Match", () => {
  it("applies the write when the revision matches", async () => {
    await call("PUT", "/ontology/objects/objects/c-m", {
      body: customer("c-m", { email: "a@example.com" }),
    });
    const res = await call("PUT", "/ontology/objects/objects/c-m", {
      body: customer("c-m", { email: "b@example.com" }),
      headers: { "if-match": '"1"' },
    });
    expect(res.status).toBe(200);
    expect(res.etag).toBe('"2"');
  });

  it("answers 412 with PRECONDITION_FAILED and the current revision on mismatch", async () => {
    await call("PUT", "/ontology/objects/objects/c-x", {
      body: customer("c-x", { email: "a@example.com" }),
    });
    const res = await call("PUT", "/ontology/objects/objects/c-x", {
      body: customer("c-x", { email: "b@example.com" }),
      headers: { "if-match": '"9"' },
    });
    expect(res.status).toBe(412);
    expect(errorCode(res)).toBe("PRECONDITION_FAILED");
    expect((res.body as { current_revision: number }).current_revision).toBe(1);
    const stored = await call("GET", "/ontology/objects/objects/c-x");
    expect(
      (stored.body as { properties: { email: string } }).properties.email
    ).toBe("a@example.com");
  });

  it("treats a malformed If-Match as a mismatch", async () => {
    await call("PUT", "/ontology/objects/objects/c-bad", {
      body: customer("c-bad", { email: "a@example.com" }),
    });
    const res = await call("PUT", "/ontology/objects/objects/c-bad", {
      body: customer("c-bad", { email: "b@example.com" }),
      headers: { "if-match": "1" },
    });
    expect(res.status).toBe(412);
    expect(errorCode(res)).toBe("PRECONDITION_FAILED");
  });

  it("applies the write to any existing object when If-Match is *", async () => {
    await call("PUT", "/ontology/objects/objects/c-star", {
      body: customer("c-star", { email: "a@example.com" }),
    });
    const res = await call("PUT", "/ontology/objects/objects/c-star", {
      body: customer("c-star", { email: "b@example.com" }),
      headers: { "if-match": "*" },
    });
    expect(res.status).toBe(200);
    expect(res.etag).toBe('"2"');
  });

  it("writes unconditionally when If-Match is absent", async () => {
    await call("PUT", "/ontology/objects/objects/c-abs", {
      body: customer("c-abs", { email: "a@example.com" }),
    });
    await call("PUT", "/ontology/objects/objects/c-abs", {
      body: customer("c-abs", { email: "b@example.com" }),
    });
    const res = await call("PUT", "/ontology/objects/objects/c-abs", {
      body: customer("c-abs", { email: "c@example.com" }),
    });
    expect(res.status).toBe(200);
    expect(res.etag).toBe('"3"');
  });

  it("answers 404 NOT_FOUND when the object is missing and If-Match is sent", async () => {
    const star = await call("PUT", "/ontology/objects/objects/c-none", {
      body: customer("c-none", { email: "a@example.com" }),
      headers: { "if-match": "*" },
    });
    const revision = await call("PUT", "/ontology/objects/objects/c-none", {
      body: customer("c-none", { email: "a@example.com" }),
      headers: { "if-match": '"1"' },
    });
    expect(star.status).toBe(404);
    expect(errorCode(star)).toBe("NOT_FOUND");
    expect(revision.status).toBe(404);
    expect(errorCode(revision)).toBe("NOT_FOUND");
  });
});

describe("structured query", () => {
  it("supports each operator its field type allows", async () => {
    await seedCustomers(6);
    const string = await query(
      queryBody({ filter: { email: { eq: "user2@example.com" } } })
    );
    expect(ids(string)).toEqual(["c-02"]);
    const inString = await query(
      queryBody({
        filter: { email: { in: ["user0@example.com", "user5@example.com"] } },
      })
    );
    expect(ids(inString)).toEqual(["c-00", "c-05"]);
    const contains = await query(
      queryBody({ filter: { email: { contains: "user3" } } })
    );
    expect(ids(contains)).toEqual(["c-03"]);
    const startsWith = await query(
      queryBody({ filter: { email: { startsWith: "user4" } } })
    );
    expect(ids(startsWith)).toEqual(["c-04"]);
    const integerRange = await query(
      queryBody({ filter: { age: { gte: 22, lt: 25 } } })
    );
    expect(ids(integerRange)).toEqual(["c-02", "c-03", "c-04"]);
    const floatRange = await query(
      queryBody({ filter: { score: { gt: 1, lte: 2 } } })
    );
    expect(ids(floatRange)).toEqual(["c-03", "c-04"]);
    const boolean = await query(
      queryBody({ filter: { active: { eq: true } } })
    );
    expect(ids(boolean)).toEqual(["c-00", "c-02", "c-04"]);
    const enumIn = await query(
      queryBody({ filter: { status: { in: ["closed"] } } })
    );
    expect(ids(enumIn)).toEqual(["c-01", "c-03", "c-05"]);
    const timestamp = await query(
      queryBody({ filter: { created: { gte: "2000-01-01T00:00:00Z" } } })
    );
    expect(timestamp.status).toBe(200);
  });

  it("rejects an operator the field type does not allow", async () => {
    await seedCustomers(2);
    const contains = await query(
      queryBody({ filter: { age: { contains: "2" } } })
    );
    expect(contains.status).toBe(422);
    expect(errorCode(contains)).toBe("INVALID_OPERATOR");
    const gtBoolean = await query(
      queryBody({ filter: { active: { gt: true } } })
    );
    expect(gtBoolean.status).toBe(422);
    expect(errorCode(gtBoolean)).toBe("INVALID_OPERATOR");
    const json = await query(queryBody({ filter: { blob: { eq: {} } } }));
    expect(json.status).toBe(422);
    expect(errorCode(json)).toBe("INVALID_OPERATOR");
  });

  it("rejects a value of the wrong type", async () => {
    await seedCustomers(2);
    const wrongType = await query(
      queryBody({ filter: { age: { gt: "twenty" } } })
    );
    expect(wrongType.status).toBe(422);
    expect(errorCode(wrongType)).toBe("INVALID_OPERATOR");
    const enumValue = await query(
      queryBody({ filter: { status: { eq: "archived" } } })
    );
    expect(enumValue.status).toBe(422);
    expect(errorCode(enumValue)).toBe("INVALID_OPERATOR");
  });

  it("ANDs conditions across properties", async () => {
    await seedCustomers(6);
    const res = await query(
      queryBody({ filter: { active: { eq: true }, age: { gte: 22 } } })
    );
    expect(ids(res)).toEqual(["c-02", "c-04"]);
  });

  it("answers UNKNOWN_PROPERTY for a property the schema does not declare", async () => {
    await seedCustomers(1);
    const res = await query(queryBody({ filter: { ghost: { eq: 1 } } }));
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe("UNKNOWN_PROPERTY");
  });

  it("answers NOT_FOUND for an unknown object type", async () => {
    const res = await query({ object_type_id: "ot_missing" });
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe("NOT_FOUND");
  });

  it("returns at most the default of 50 when no limit is given", async () => {
    await seedCustomers(3);
    const res = await query(queryBody());
    expect(ids(res)).toHaveLength(3);
    expect((res.body as { next_cursor: unknown }).next_cursor).toBeNull();
  });

  it("rejects a limit outside 1 to 500", async () => {
    const zero = await query(queryBody({ limit: 0 }));
    const big = await query(queryBody({ limit: 501 }));
    expect(zero.status).toBe(422);
    expect(big.status).toBe(422);
  });

  it("pages through every match once, with no duplicates or gaps", async () => {
    await seedCustomers(7);
    const seen: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: each page needs the previous cursor
      const res = await query(
        queryBody({ limit: 3, ...(cursor ? { cursor } : {}) })
      );
      seen.push(...ids(res));
      cursor = (res.body as { next_cursor: string | null }).next_cursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual([
      "c-00",
      "c-01",
      "c-02",
      "c-03",
      "c-04",
      "c-05",
      "c-06",
    ]);
  });

  it("returns the same last page when a cursor from before it is reused", async () => {
    await seedCustomers(7);
    const first = await query(queryBody({ limit: 3 }));
    const cursor = (first.body as { next_cursor: string }).next_cursor;
    const second = await query(queryBody({ cursor, limit: 3 }));
    const lastCursor = (second.body as { next_cursor: string }).next_cursor;
    const last = await query(queryBody({ cursor: lastCursor, limit: 3 }));
    expect(ids(last)).toEqual(["c-06"]);
    expect((last.body as { next_cursor: unknown }).next_cursor).toBeNull();
    const again = await query(queryBody({ cursor: lastCursor, limit: 3 }));
    expect(ids(again)).toEqual(["c-06"]);
    expect((again.body as { next_cursor: unknown }).next_cursor).toBeNull();
  });

  it("rejects a cursor that is not one of ours", async () => {
    await seedCustomers(2);
    const res = await query(queryBody({ cursor: "not-a-cursor" }));
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe("INVALID_CURSOR");
  });

  it("rejects a cursor issued for another object type", async () => {
    await seedCustomers(7);
    const page = await query(queryBody({ limit: 3 }));
    const cursor = (page.body as { next_cursor: string }).next_cursor;
    const res = await query({ cursor, object_type_id: "ot_company" });
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe("INVALID_CURSOR");
  });
});

describe("object-type schema", () => {
  const validSchema = {
    fields: {
      kind: { enum: ["a", "b"], type: "enum" },
      name: { required: true, type: "string" },
    },
    relationships: { parent: { targetEntity: "Team", type: "belongsTo" } },
    version: 2,
  };

  it("accepts a valid schema and stores it", async () => {
    await call("PUT", "/ontology/objects/object-types/ot_team", {
      body: { name: "Team", schema: { fields: { name: { type: "string" } } } },
    });
    const res = await call("PUT", "/ontology/objects/object-types/ot_thing", {
      body: { name: "Thing", schema: validSchema },
    });
    expect(res.status).toBe(200);
    const stored = await call("GET", "/ontology/objects/object-types/ot_thing");
    expect((stored.body as { schema: unknown }).schema).toEqual(validSchema);
  });

  it("accepts a relationship that targets the type being written", async () => {
    const res = await call("PUT", "/ontology/objects/object-types/ot_node", {
      body: {
        name: "Node",
        schema: {
          fields: { id2: { type: "string" } },
          relationships: {
            parent: { targetEntity: "Node", type: "belongsTo" },
          },
        },
      },
    });
    expect(res.status).toBe(200);
  });

  it("rejects an unknown field type and stores nothing", async () => {
    const res = await call("PUT", "/ontology/objects/object-types/ot_bad", {
      body: { name: "Bad", schema: { fields: { x: { type: "money" } } } },
    });
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe("INVALID_SCHEMA");
    expect((res.body as { detail: string }).detail).toContain("money");
    const stored = await call("GET", "/ontology/objects/object-types/ot_bad");
    expect(stored.status).toBe(404);
  });

  it("rejects an enum field without values", async () => {
    const res = await call("PUT", "/ontology/objects/object-types/ot_enum", {
      body: { name: "Enum", schema: { fields: { k: { type: "enum" } } } },
    });
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe("INVALID_SCHEMA");
  });

  it("rejects items on a non-array field", async () => {
    const res = await call("PUT", "/ontology/objects/object-types/ot_items", {
      body: {
        name: "Items",
        schema: { fields: { k: { items: "string", type: "string" } } },
      },
    });
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe("INVALID_SCHEMA");
  });

  it("rejects a relationship whose target is not an object type in the ontology", async () => {
    const res = await call("PUT", "/ontology/objects/object-types/ot_rel", {
      body: {
        name: "Rel",
        schema: {
          fields: {},
          relationships: {
            owner: { targetEntity: "Ghost", type: "belongsTo" },
          },
        },
      },
    });
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe("INVALID_SCHEMA");
    expect((res.body as { detail: string }).detail).toContain("Ghost");
  });

  it("rejects a schema without fields", async () => {
    const res = await call(
      "PUT",
      "/ontology/objects/object-types/ot_nofields",
      {
        body: { name: "NoFields", schema: {} },
      }
    );
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe("INVALID_SCHEMA");
  });
});

describe("contract v2 section 5: relationship instances", () => {
  const ORDER_TYPE = {
    name: "Order",
    object_type_id: "ot_order",
    schema: { fields: { total: { type: "float" } } },
  };

  async function seedTwoCustomersAndOrder(): Promise<void> {
    await call("PUT", "/ontology/objects/objects/c-1", {
      body: customer("c-1", { email: "a@example.com" }),
    });
    await call("PUT", "/ontology/objects/objects/c-2", {
      body: customer("c-2", { email: "b@example.com" }),
    });
    await call("PUT", "/ontology/objects/objects/o-1", {
      body: { object_id: "o-1", object_type_id: "ot_order", properties: {} },
    });
  }

  it("creates an instance with a server-generated id", async () => {
    await seedTwoCustomersAndOrder();
    const res = await call("POST", "/ontology/relationships/relationships", {
      body: {
        properties: {},
        relationship_type_id: "rt_orders",
        source_object_id: "c-1",
        target_object_id: "o-1",
      },
    });
    expect(res.status).toBe(201);
    const created = res.body as { relationship_id: string };
    expect(created.relationship_id).toMatch(UUID_PATTERN);
  });

  it("keeps a client-supplied relationship id", async () => {
    await seedTwoCustomersAndOrder();
    const res = await call("POST", "/ontology/relationships/relationships", {
      body: {
        relationship_id: "rel-fixed",
        relationship_type_id: "rt_orders",
        source_object_id: "c-1",
        target_object_id: "o-1",
      },
    });
    expect(res.status).toBe(201);
    expect((res.body as { relationship_id: string }).relationship_id).toBe(
      "rel-fixed"
    );
  });

  it("rejects an instance whose source or target object does not exist", async () => {
    await seedTwoCustomersAndOrder();
    const res = await call("POST", "/ontology/relationships/relationships", {
      body: {
        relationship_type_id: "rt_orders",
        source_object_id: "c-1",
        target_object_id: "missing",
      },
    });
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe("UNKNOWN_OBJECT");
  });

  it("rejects an instance without a relationship type", async () => {
    await seedTwoCustomersAndOrder();
    const res = await call("POST", "/ontology/relationships/relationships", {
      body: { source_object_id: "c-1", target_object_id: "o-1" },
    });
    expect(res.status).toBe(422);
  });

  it("refuses a duplicate relationship id", async () => {
    await seedTwoCustomersAndOrder();
    const body = {
      relationship_id: "rel-dup",
      relationship_type_id: "rt_orders",
      source_object_id: "c-1",
      target_object_id: "o-1",
    };
    await call("POST", "/ontology/relationships/relationships", { body });
    const again = await call("POST", "/ontology/relationships/relationships", {
      body,
    });
    expect(again.status).toBe(409);
    expect(errorCode(again)).toBe("ALREADY_EXISTS");
  });

  it("filters by source, target, type and object id, unpaged", async () => {
    await seedTwoCustomersAndOrder();
    const post = (source: string, target: string, type: string) =>
      call("POST", "/ontology/relationships/relationships", {
        body: {
          relationship_type_id: type,
          source_object_id: source,
          target_object_id: target,
        },
      });
    await post("c-1", "o-1", "rt_orders");
    await post("c-2", "o-1", "rt_orders");
    await post("c-1", "c-2", "rt_friends");

    const bySource = await call(
      "GET",
      "/ontology/relationships/relationships?source_object_id=c-1&relationship_type_id=rt_orders"
    );
    expect(bySource.status).toBe(200);
    expect(bySource.body).toHaveLength(1);

    const byTarget = await call(
      "GET",
      "/ontology/relationships/relationships?target_object_id=o-1"
    );
    expect(byTarget.body).toHaveLength(2);

    const byObject = await call(
      "GET",
      "/ontology/relationships/relationships?object_id=c-2"
    );
    expect(byObject.body).toHaveLength(2);
  });

  it("deletes an instance with 204, then 404 with NOT_FOUND", async () => {
    await seedTwoCustomersAndOrder();
    const created = await call(
      "POST",
      "/ontology/relationships/relationships",
      {
        body: {
          relationship_id: "rel-gone",
          relationship_type_id: "rt_orders",
          source_object_id: "c-1",
          target_object_id: "o-1",
        },
      }
    );
    expect(created.status).toBe(201);
    const removed = await call(
      "DELETE",
      "/ontology/relationships/relationships/rel-gone"
    );
    expect(removed.status).toBe(204);
    const missing = await call(
      "DELETE",
      "/ontology/relationships/relationships/rel-gone"
    );
    expect(missing.status).toBe(404);
    expect(errorCode(missing)).toBe("NOT_FOUND");
  });

  it("requires relationshipTypeId for hasOne, hasMany and manyToMany in object-type schemas", async () => {
    await call("PUT", "/ontology/objects/object-types/ot_order", {
      body: { name: "Order", schema: ORDER_TYPE.schema },
    });
    const res = await call(
      "PUT",
      "/ontology/objects/object-types/ot_customer",
      {
        body: {
          name: "Customer",
          schema: {
            fields: { email: { type: "string" } },
            relationships: {
              orders: { targetEntity: "Order", type: "hasMany" },
            },
          },
        },
      }
    );
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe("INVALID_SCHEMA");
    expect((res.body as { detail: string }).detail).toContain(
      "relationshipTypeId is required for hasMany"
    );
  });

  it("accepts a relationship type id on a hasMany relation", async () => {
    await call("PUT", "/ontology/objects/object-types/ot_order", {
      body: { name: "Order", schema: ORDER_TYPE.schema },
    });
    const res = await call(
      "PUT",
      "/ontology/objects/object-types/ot_customer",
      {
        body: {
          name: "Customer",
          schema: {
            fields: { email: { type: "string" } },
            relationships: {
              orders: {
                relationshipTypeId: "rt_orders",
                targetEntity: "Order",
                type: "hasMany",
              },
            },
          },
        },
      }
    );
    expect(res.status).toBe(200);
  });
});
