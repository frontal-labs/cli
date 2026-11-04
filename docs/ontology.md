# Typed ontology: `frontal sync`

`frontal sync` turns your Frontal ontology into TypeScript types. The generated files live in
`.frontal/`. `new Frontal()` from `@frontal-labs/sdk` is typed by them through a reference file that
`sync` writes into your source tree, so you use the SDK directly and get autocomplete and
type-checking on your entities.

The typed client requires `@frontal-labs/sdk` **2.1.0 or later**, which is not published yet.
`frontal init` already pins that version, so new projects will not type-check until the SDK is
released.

## Quick start

```sh
frontal init                 # creates .frontal/config.jsonc
frontal sync                 # downloads the ontology, writes .frontal/* and src/frontal-env.d.ts
git add .frontal src/frontal-env.d.ts && git commit -m "Add typed ontology"
```

```ts
import { Frontal } from "@frontal-labs/sdk";

const frontal = new Frontal({ apiKey: process.env.FRONTAL_API_KEY! });

const customer = await frontal.ontology.Customer.get("123");
customer.email;                              // string
customer.status;                             // "active" | "closed"
const company = await customer.company();    // Company | null, loaded on demand

const created = await frontal.ontology.Customer.create({ email: "a@example.com", status: "active" });
await frontal.ontology.Customer.put("c-2", { email: "b@example.com", status: "closed" });
await frontal.ontology.Customer.update(created.id, { score: 3 });
await frontal.ontology.Customer.delete(created.id);
```

Wrong property names, wrong types, invalid enum values, unknown entities, and `list()` are compile
errors. Compiling never needs the network.

## Layout

| File | Committed | Written by | Purpose |
|---|---|---|---|
| `config.jsonc` | yes | `frontal init` | Project configuration, including deployment settings |
| `ontology.json` | yes | `sync` | Raw object types and their hash: the snapshot everything else is generated from |
| `ontology.d.ts` | yes | `sync` | Entity types (`read`, `create`, `update`, `relations`) |
| `client.ts` | yes | `sync` | Optional pinned mode: `createFrontal()` with the runtime metadata, no request at start-up |
| `version.json` | yes | `sync` | Hashes, per-entity versions and the SDK range. No timestamps |
| `src/frontal-env.d.ts` | yes | `sync` | Reference file that makes `new Frontal()` typed (path set by `--types-out`) |
| `state/`, `build/`, `artifacts/`, `cache/` | no | other commands | Local-only; `init` ignores them |

Generated TypeScript files start with a three-line header that names the ontology hash and the
generator version. JSON files carry the same values as fields.

Do not edit generated files. Change the ontology in Frontal Studio and run `frontal sync`.

### The reference file and `--types-out`

`sync` writes `src/frontal-env.d.ts` (or `frontal-env.d.ts` at the root when there is no `src/`). It
holds one line that references `.frontal/ontology.d.ts`, and that declaration augments the SDK's
`FrontalOntologyRegistry`. Because of it, `new Frontal()` is typed without importing anything
generated.

- `frontal sync --types-out <file>` writes the reference elsewhere. Use the same flag with
  `frontal sync --check` in CI.
- `sync` refuses to overwrite a file that it did not generate (no generated header). It fails before
  writing anything, with `ONTOLOGY_REFERENCE_NOT_OWNED`. Move the file aside, or pick another path.
- Projects that do not want the typed `new Frontal()` can ignore the reference file. Nothing else
  depends on it.

## Commands

### `frontal sync`

Downloads every object type in one request, validates them, and writes the four generated files.
Output shows what happened to each file:

```text
created   .frontal/ontology.d.ts
updated   .frontal/client.ts
unchanged .frontal/version.json
created   .frontal/ontology.json
warn      Skipped Customer.orders (hasMany): no backend query exists yet.
synced 5 entities (sha256:…)
```

If nothing changed it prints `Local types are already synchronised (sha256:…).` and writes nothing.

Writes are atomic: each file is written to a temporary sibling and renamed into place. `ontology.json`
is written last, so an interrupted sync never looks complete. Temporary files left by an interrupted
sync are deleted on the next run.

Failures are reported before anything is written, so `.frontal/` is never left half-updated by a
validation or download error. The only partial state is a write that fails between files, which
`status` and `sync --check` then report as out of date.

### `frontal sync --check`

Offline. Regenerates the files from the committed `ontology.json` and compares them with what is on
disk, byte for byte. It also checks that `version.json` names the same hash as `ontology.json`.

```text
ok  generated files match ontology sha256:… (5 entities)
```

On mismatch it lists each stale file and why, and exits `2`:

```text
Generated files do not match .frontal/ontology.json: client.ts (differs), version.json (missing).
```

### `frontal status`

Compares the committed snapshot with Frontal. It makes one request.

```text
Frontal Project: my-app
Environment: dev

Local ontology:  sha256:… (5 entities)
Remote ontology: sha256:… (5 entities)

Status: UP TO DATE
```

`Status: OUTDATED` is followed by `Run frontal sync to update generated types.` Local states:
`not synced yet`, or `unreadable (<reason>)` when `ontology.json` is missing a field, is not JSON, or
was edited by hand.

`--json` prints the same information for scripts.

## Generated declarations

For each entity, `ontology.d.ts` declares four shapes:

- **`read`**: what `get` returns. The `id` is always present. A required field is `T`. An optional field
  is `T | null`, and may be absent.
- **`create`**: what `create` and `put` accept. Read-only fields (primary, `auto`, `computed`) are left
  out. A required field with no default must be supplied. A field with a default may be omitted.
- **`update`**: a partial patch of writable fields. Required fields stay non-null even when patched.
- **`relations`**: one entry per supported relation, typed as `{ target; optional }`. The SDK turns
  each entry into a lazy accessor.

Types map as follows:

| Ontology type | TypeScript |
|---|---|
| `string`, `text`, `uuid` | `string` |
| `integer`, `float`, `currency` | `number` |
| `boolean` | `boolean` |
| `timestamp` | `string` (ISO 8601, as it travels over JSON; not `Date`) |
| `enum` | a named union, e.g. `CustomerStatus = "active" \| "closed"` |
| `array` | `ItemType[]` for scalar items, `unknown[]` otherwise |
| `vector` | `number[]` |
| `json` | `unknown` |

Entity names that are not identifiers are quoted, e.g. `"legacy-account"`. Field names too, e.g.
`"external-ref"`.

## Runtime metadata in `client.ts`

TypeScript types cannot carry names or foreign-key names, so the SDK needs runtime metadata too. The
pinned `client.ts` passes it as the second argument of `createFrontalClient`, so it makes no request at
start-up. Direct use (`new Frontal()` without the literal) derives the same metadata from the live
object types on the first entity call, one request per client, cached afterwards. The generated literal
and the derivation must agree; the parity test in `tests/ontology-parity.test.ts` checks that.

The pinned literal is generated from the same model as the types:

```ts
const runtime = {
  entities: ["Company", "Customer"],
  fields: {
    Company: {
      id: { kind: "string", required: true },
      name: { kind: "string", required: true },
    },
    Customer: {
      id: { kind: "string", required: true },
      email: { kind: "string", required: true },
      status: { kind: { enum: ["active", "closed"] }, required: true },
      companyId: { kind: "string", required: false },
    },
  },
  writable: {
    Company: ["name"],
    Customer: ["companyId", "email", "status"],
  },
  relations: {
    Company: {},
    Customer: {
      company: { target: "Company", foreignKey: "companyId", optional: true },
    },
  },
} as const;
```

- `entities`, `fields`, `writable` and `relations` list every entity, even when it has no entries.
- `fields` lists every read field, `id` included, with its runtime kind and whether it is required.
- `writable` lists the fields a client may send. A field is excluded when it is primary, `auto` or
  `computed`. Every field that `create` accepts is also accepted by `update`.
- Everything is sorted, so the same ontology always produces the same bytes.

## Relations

Only `belongsTo` is translated. The foreign key sits on the source record: the declared `foreignKey`,
or `<relation>Id` when none is declared. An undeclared foreign key is added as an optional, writable
`uuid` field.

`hasOne`, `hasMany` and `manyToMany` are skipped with a warning and get no accessor. The backend
has no query that can reach the target side of those relations yet. Their target entities are still
validated.

A relation may not share a name with a field, or be named `id`, because both live on the same record.

## Versioning and hashes

- **`schemaHash`** is `sha256` over the canonical JSON (keys sorted) of the object types. It changes
  exactly when the ontology changes. It is stored in `ontology.json`, `version.json` and each
  generated file's header.
- **`generatorVersion`** is the version of the generator's output (currently `2.0.0`), not the CLI
  release. Upgrading the CLI does not make committed files stale. The version changes only when
  the generated bytes change, and then `sync --check` reports the files until you run `frontal sync`.
- **`contractVersion`** (currently `1`) versions the shape of the committed files.
- **`sdkRange`** names the SDK versions the generated client needs: currently `>=2.1.0 <3.0.0`.
- **`entities`** in `version.json` maps each entity to its backend `version`.

There are no timestamps in committed files, so a sync that changes nothing changes nothing on disk.

## Backend contract and object model

The wire contract is `docs/backend-spec/ontology-openapi.yaml` (OpenAPI 3.1, copied from the Frontal
ontology service). Only the object endpoints are used here:

| Endpoint | Used by | Notes |
|---|---|---|
| `GET /v1/ontology/objects/object-types` | `sync`, `status` | Unpaged array of `ObjectTypeResponse` |
| `GET /v1/ontology/objects/objects?object_type_id=` | SDK `list()` | Unpaged array of `ObjectResponse` |
| `POST /v1/ontology/objects/objects` | not used | Creates with a server-generated id when none is given |
| `GET`, `PUT`, `DELETE /v1/ontology/objects/objects/{id}` | SDK `get`, `put`, `update`, `delete` | `PUT` is an upsert |

An object type is `{ object_type_id, name, schema }`. The entity definition lives in `schema`
(`fields`, `relationships`, `version`). An object is `{ object_type_id, object_id, properties }`; the
SDK maps `properties` onto the typed record.

Response keys are snake_case on the wire. The HTTP client's default JSON helpers rename them to
camelCase at every depth, which would also rename an ontology's own field names inside `schema`. The
CLI therefore reads the object-type list from the raw response (`src/lib/ontology/remote.ts`). The SDK
requests the object endpoints with key preservation.

## Mock backend and mock auth

`tests/support/mock-ontology-backend.ts` is an in-memory server for the endpoints above. It speaks the
spec's wire format (snake_case JSON, unpaged lists, `{ detail }` errors) and implements the proposed
v2 additions in `docs/backend-spec/CONTRACT-v2.md`: revisions with `ETag` and `If-Match`, the structured
query with cursor paging, typed object-type schemas, and `code` on the new errors. It is a test double,
not a Frontal service. The production service does not implement the v2 additions yet.

Rules the mock enforces, each covered by `tests/mock-backend-contract.test.ts`:

- Revisions start at 1 and increase on every write. A deleted and recreated object continues from its
  last revision.
- `If-Match` with a matching revision or `*` writes; a mismatch or malformed value returns `412
  PRECONDITION_FAILED` with `current_revision`; a missing object returns `404 NOT_FOUND`.
- `POST /ontology/objects/objects/query` filters by the operators each field type allows. Conditions are
  ANDed. Pages are ordered by `object_id` and use an opaque cursor bound to the object type.
- Object-type `schema` is validated on write (`INVALID_SCHEMA`): known field types, enum values,
  `items` only on arrays, and relationship targets that name an object type in the ontology.

- **Auth is mocked.** A request must carry `Authorization: Bearer <token>` or `x-api-key: <token>`,
  matching the configured token. The default is `frt_mock_0123456789`; the SDK requires keys to start
  with `frt_`. Anything else gets `401 { detail }`.
- **Defaults and `auto` fields are applied on write**, as an assumption (see the assumptions list). Without
  them, required reads would fail the SDK's runtime check.
- **`setObjectTypes(objectTypes)`** replaces the object types, simulating an ontology edit in Frontal Studio.

The live test (`tests/ontology-live.test.ts`) runs the real `frontal` binary against the mock with
`FRONTAL_API_URL` and `FRONTAL_API_KEY`. It covers first sync, an unchanged re-sync, an ontology change,
`sync --check` catching a hand edit, and a rejected key that writes nothing. The SDK flow test
(`tests/ontology-sdk-flow.test.ts`) builds a consumer project and runs create, put, get, relation,
update, list and delete under `bun`.

Run the suite with `bun run test`. The live and SDK-flow tests need `bun` on `PATH`, and the SDK flow
needs an SDK checkout (`FRONTAL_SDK_SOURCE`, default `../sdk-typescript`). Both are skipped with a reason
when those are missing.

## Usage in CI

```yaml
- run: npm ci
- run: npx frontal sync --check   # no credentials needed
- run: npm run build
```

`sync --check` does not need an API key, and `tsc` does not need the network. CI never needs to
download the ontology again.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ONTOLOGY_INVALID: Object type #n ("X") is malformed at schema.fields.y.type` | The backend returned an object type the CLI cannot read | Fix that object type in Frontal Studio, then `frontal sync` |
| `ONTOLOGY_INVALID: … has the same name as a field` | A relation and a field share a name | Rename one of them |
| `ONTOLOGY_INVALID: Entity "objects" collides with the SDK namespace …` | Entity name is reserved by the SDK's `ontology` object | Rename the entity |
| `ONTOLOGY_INVALID: … is a reserved JavaScript property name` | Name such as `constructor` or `__proto__` | Rename the field, relation or entity |
| `ONTOLOGY_INVALID: … both map to the type name …` | Two names produce the same PascalCase type name | Rename one of them |
| `ONTOLOGY_MALFORMED: Frontal returned an object-type list that is not a JSON array.` | The list endpoint returned something other than the spec's array | Retry; report the request id if it persists |
| `ONTOLOGY_UNAUTHORIZED: Frontal rejected the API key (401 Unauthorized).` (exit 3) | The key is missing, wrong, or belongs to another environment | Check `FRONTAL_API_KEY`, `--api-key` or your profile; run `frontal auth whoami` |
| `ONTOLOGY_CORRUPT: .frontal/ontology.json does not match its schemaHash` | The snapshot was edited by hand | Run `frontal sync` |
| `ONTOLOGY_OUT_OF_DATE` (`sync --check`) | Committed generated files differ from `ontology.json` | Run `frontal sync` locally and commit the result |
| `ONTOLOGY_MISSING` (`sync --check`) | `ontology.json` has never been committed | Run `frontal sync` and commit `.frontal/` |
| `Status: OUTDATED` | Frontal's ontology has changed since the last sync | Run `frontal sync` |
| Type error: `Property 'email' does not exist` after a sync | The ontology changed and the code still uses the old field | Update the code to the new shape; the compiler lists every place |
| `Cannot find module '@frontal-labs/sdk'` or missing `createFrontalClient` overload | SDK older than 2.1.0 | Install `@frontal-labs/sdk@^2.1.0` |

## Known gaps and assumptions

Backend capabilities the typed client does not use yet:

- **No `query`.** The contract has no documented query body for objects (the knowledge-graph query
  takes a free-text `query` string). Filtering by field is not typed.
- **No target-side relation queries.** `hasOne`, `hasMany` and `manyToMany` are skipped until the
  backend can answer them.
- **`update` is not atomic.** It reads the object, merges the patch, and writes it back. A concurrent
  write between those requests can be lost.
- **`create` lets the server assign the id.** It uses `POST /objects/objects`. `put(id, input)` writes an
  explicit id.
- **NodeNext projects.** The SDK's built declarations use extensionless relative imports, which
  `moduleResolution: "NodeNext"` rejects, so `new Frontal()` is typed as `any` there. Bundler resolution
  works. The fix is `.js` extensions in the SDK's emitted declarations, which is out of scope here.

Assumptions that need confirmation against a live backend (each is marked `ASSUMPTION` in the code):

- The entity definition (fields, relationships, version) is the object type's `schema`, which the
  spec types as a free-form object. The CLI follows `ModelDefinitionSchema` in `@frontal-labs/ontology`.
- A `belongsTo` foreign key is stored in the object's `properties`.
- `PUT /ontology/objects/objects/{id}` replaces the whole record.
- `timestamp` values arrive as ISO 8601 strings.
- A field with an `auto` or `default` setting is filled by the backend when the client omits it. The
  mock backend does the same; the real backend's behaviour is not verified.
