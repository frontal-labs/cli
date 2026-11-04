# Ontology object API: contract v2 additions

Status: implemented in the spec-based mock backend (`tests/support/mock-ontology-backend.ts`) and the
SDK. Not yet implemented in the production ontology service. The production spec
(`ontology-openapi.yaml`) is unchanged; this document is the proposed addition to it.

Everything below extends the v1 object endpoints. Existing v1 calls keep working.

## 1. Revisions and conditional writes

- Every object has an integer `revision`, starting at 1 on first create and incremented on every write.
  A deleted and recreated object continues from its last revision, so a stale ETag never matches a new object.
- `GET /v1/ontology/objects/objects/{object_id}` and `PUT` responses include the header
  `ETag: "<revision>"` (the revision in double quotes).
- `PUT /v1/ontology/objects/objects/{object_id}` accepts an optional `If-Match` header:
  - `If-Match: "<revision>"`: the write applies only if the stored revision equals it.
  - `If-Match: *`: the write applies only if the object exists.
  - Header absent: unconditional write (v1 behaviour).
  - Mismatch: `412` with body `{ "code": "PRECONDITION_FAILED", "detail": "...", "current_revision": <int> }`.
  - Object missing with `If-Match`: `404` with `{ "code": "NOT_FOUND", "detail": "..." }`.

## 2. Structured query with cursor paging

`POST /v1/ontology/objects/objects/query`

Request body:

```json
{
  "object_type_id": "ot_customer",
  "filter": { "status": { "eq": "active" }, "age": { "gte": 18, "lt": 65 } },
  "limit": 50,
  "cursor": "<opaque, from a previous page>"
}
```

- `object_type_id` required.
- `filter` optional. Keys are property names; each value is an operator map. All conditions are ANDed.
- Operators and the value types they accept, by the property's declared field type:
  - `string`, `text`, `uuid`: `eq`, `in`, `contains`, `startsWith`.
  - `integer`, `float`, `currency`: `eq`, `in`, `gt`, `gte`, `lt`, `lte`.
  - `boolean`: `eq`.
  - `timestamp`: `eq`, `gt`, `gte`, `lt`, `lte` (ISO 8601 strings compared as instants).
  - `enum`: `eq`, `in`. The value must be one of the enum's values.
  - `json`, `array`, `vector`: not filterable.
- `limit` 1 to 500, default 50.
- Results are ordered by `object_id` ascending.

Response `200`:

```json
{ "results": [ /* ObjectResponse */ ], "next_cursor": "<opaque>" | null }
```

`next_cursor` is `null` on the last page.

Errors:
- Unknown property in `filter`: `422`, `{ "code": "UNKNOWN_PROPERTY", "detail": "..." }`.
- Operator not allowed for the property's type, or a value of the wrong type: `422`,
  `{ "code": "INVALID_OPERATOR", "detail": "..." }` (the second for wrong value types).
- Unknown `object_type_id`: `404`, `{ "code": "NOT_FOUND", ... }`.
- Invalid or foreign cursor: `422`, `{ "code": "INVALID_CURSOR", ... }`.

## 3. Typed object-type schema

`PUT /v1/ontology/objects/object-types/{id}` validates `schema` against `ObjectTypeSchema`:

- `fields` (required): object of field name to `{ type, required?, primary?, auto?, computed?, default?, enum?, items? }`.
  - `type` one of `string text uuid integer float currency boolean timestamp enum array json vector`.
  - `enum` required and non-empty when `type` is `enum`.
  - `items` (element type name) allowed only for `array`.
- `relationships` (optional): object of relation name to `{ type, targetEntity, foreignKey? }`.
  - `type` one of `belongsTo hasOne hasMany manyToMany`.
  - `targetEntity` must be the name of an object type in the ontology. The type being written counts, so a self-relation (for example `Node.parent`) is valid.
- `version` (optional): integer.

Invalid schema: `422`, `{ "code": "INVALID_SCHEMA", "detail": "..." }`.

## 4. Error envelope

Every non-2xx response from the v2 additions has `code` (a stable upper-case identifier) and `detail`
(human text). The v1 `{ detail }`-only responses remain valid for endpoints that do not yet return a code.

## 5. Relationship traversal (decision: source-side lists, target-side single lookup)

The v1 spec already defines relationship instances:

- `POST /v1/ontology/relationships/relationships` with `RelationshipBody`
  `{ relationship_type_id, source_object_id, target_object_id, relationship_id?, properties }`
  returns `201 RelationshipResponse`.
- `GET /v1/ontology/relationships/relationships?source_object_id=&target_object_id=&relationship_type_id=`
  returns an array of `RelationshipResponse` (unpaged).
- `DELETE /v1/ontology/relationships/relationships/{relationship_id}` returns `204`.

v2 adds one optional field to the object-type schema:

- `relationships[<name>].relationshipTypeId` (string, optional): the `relationship_type_id` used for
  instances of that relation. Required for `hasOne`, `hasMany` and `manyToMany` to resolve; a missing
  value is a generator error for those kinds.

Resolution, given the source object `S` and relation `R` with relationship type `T`:

- `belongsTo`: unchanged, the foreign key lives on `S.properties`.
- `hasMany` and `manyToMany`: `GET ...?source_object_id=S.id&relationship_type_id=T`. Each element's
  `target_object_id` is then fetched with `GET /objects/objects/{id}`. Result: every target, in the order
  returned.
- `hasOne`: the same query. Zero results gives `null`; one gives that target; more than one is an error
  `TOO_MANY_RELATIONSHIPS` (the server does not enforce cardinality in v1).
