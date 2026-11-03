# Proposed backend additions (for the ontology service owners)

Status: the four additions are **implemented in the spec-based mock backend**
(`tests/support/mock-ontology-backend.ts`) and specified in `CONTRACT-v2.md`. They are **not implemented
in the production ontology service**, which still needs its owners. The production spec
(`ontology-openapi.yaml`) does not contain them. Each addition is additive, so existing clients keep working.

| Item | Mock | Production |
|---|---|---|
| 1. Conditional write (`ETag`, `If-Match`) | implemented | not implemented |
| 2. Structured query with cursor paging | implemented | not implemented |
| 3. Typed object-type schema | implemented (validated on write) | not implemented |
| 4. Error `code` field | implemented on the new errors | not implemented |

## 1. Conditional write for atomic `update`

Problem: `update` in the SDK is GET, merge, PUT. A concurrent write between the GET and the PUT is
lost. The spec's `PUT /v1/ontology/objects/objects/{object_id}` has no way to detect that.

Proposal:
- `GET /v1/ontology/objects/objects/{object_id}` returns an `ETag` header, derived from the object's
  revision.
- `PUT /v1/ontology/objects/objects/{object_id}` accepts an optional `If-Match: <etag>` header.
  - Match: the write is applied and the response carries the new `ETag`.
  - Mismatch: `412 Precondition Failed` with `{ "detail": "..." }`.
  - Header absent: unchanged behaviour (unconditional write).

Client use: `update` sends `If-Match` from the GET, retries once on `412`, then reports a conflict.

## 2. Structured query with cursor paging

Problem: `GET /objects/objects?object_type_id=` returns every object of a type in one unpaged array.
There is no filter on properties, and no way to page.

Proposal: `POST /v1/ontology/objects/objects/query`

```yaml
requestBody:
  content:
    application/json:
      schema:
        type: object
        required: [object_type_id]
        properties:
          object_type_id: { type: string }
          filter:
            type: object
            description: Property name -> operator map. All conditions are ANDed.
            additionalProperties:
              type: object
              properties:
                eq: {}
                gt: {}
                gte: {}
                lt: {}
                lte: {}
                contains: { type: string }
                startsWith: { type: string }
          limit: { type: integer, minimum: 1, maximum: 500, default: 50 }
          cursor: { type: string }
responses:
  '200':
    content:
      application/json:
        schema:
          type: object
          required: [results]
          properties:
            results: { type: array, items: { $ref: '#/components/schemas/ObjectResponse' } }
            next_cursor: { type: [string, 'null'] }
  '422': { $ref: '#/components/responses/ValidationError' }
```

Rules the server should enforce, so the typed client can rely on them:
- An unknown property name in `filter` is `422`, not silently ignored.
- An operator not valid for the property's declared type is `422`.

Client use: the typed `query({ where })` and paged `list()` both map onto this endpoint. The
generator emits the allowed operators per field type, which keeps the SDK's compile-time checks
aligned with what the server accepts.

## 3. Typed object-type schema

Problem: `ObjectTypeBody.schema` and `ObjectTypeResponse.schema` are `additionalProperties: true`.
The CLI reads fields, relationships and a version from there, which is an assumption.

Proposal: a named `ObjectTypeSchema` component:

```yaml
ObjectTypeSchema:
  type: object
  required: [fields]
  properties:
    version: { type: integer }
    fields:
      type: object
      additionalProperties:
        type: object
        required: [type]
        properties:
          type: { type: string, enum: [string, text, uuid, integer, float, currency, boolean, timestamp, enum, array, json, vector] }
          required: { type: boolean, default: false }
          primary: { type: boolean, default: false }
          auto: { type: boolean, default: false }
          computed: { type: boolean, default: false }
          default: {}
          enum: { type: array, items: { type: string } }
          items: { type: string }
    relationships:
      type: object
      additionalProperties:
        type: object
        required: [type, targetEntity]
        properties:
          type: { type: string, enum: [belongsTo, hasOne, hasMany, manyToMany] }
          targetEntity: { type: string }
          foreignKey: { type: string }
```

This is the shape the generator already reads. Making it part of the spec turns the convention into a
contract.

## 4. Error envelope

Problem: the spec's errors are `{ "detail": "..." }`. The SDK core maps errors from `{ code, message }`.
The SDK now uses `detail` as the message, but the error has no code.

Proposal: add an optional `code` (for example `OBJECT_NOT_FOUND`, `UNKNOWN_PROPERTY`,
`PRECONDITION_FAILED`) next to `detail`. Typed clients can then branch on codes rather than text.

## Order of work

1 and 2 unblock atomic update and the typed query. 3 removes the last schema assumption. 4 is useful
but not blocking.
