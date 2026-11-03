# Typed ontology: `frontal sync`

`frontal sync` turns your Frontal ontology into TypeScript types. The generated files live in
`.frontal/`, and `createFrontal()` from `.frontal/client.ts` gives you an SDK client that
autocompletes and type-checks your entities.

Tested against `@frontal-labs/sdk` built from `feat/ontology-types` (commit `b3a1a96`). The generated
client requires SDK **2.1.0 or later**, which is not published yet. `frontal init` already pins that
version, so new projects will not type-check until the SDK is released.

## Quick start

```sh
frontal init                 # creates .frontal/config.jsonc
frontal sync                 # downloads the ontology, writes .frontal/*
git add .frontal && git commit -m "Add typed ontology"
```

```ts
import { createFrontal } from "./.frontal/client";

const frontal = createFrontal({ apiKey: process.env.FRONTAL_API_KEY! });

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
| `client.ts` | yes | `sync` | `createFrontal()` plus the runtime metadata the SDK needs |
| `version.json` | yes | `sync` | Hashes, per-entity versions and the SDK range. No timestamps |
| `state/`, `build/`, `artifacts/`, `cache/` | no | other commands | Local-only; `init` ignores them |

Generated TypeScript files start with a three-line header that names the ontology hash and the
generator version. JSON files carry the same values as fields.

Do not edit generated files. Change the ontology in Frontal Studio and run `frontal sync`.

## Commands

### `frontal sync`

Downloads every object type (following pages), validates them, and writes the four generated files.
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

TypeScript types cannot carry names or foreign-key names, so `client.ts` passes a literal as the
second argument of `createFrontalClient`. It is generated from the same model as the types:

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
- **`generatorVersion`** is the version of the generator's output (currently `1.0.0`), not the CLI
  release. Upgrading the CLI does not make committed files stale. The version changes only when
  the generated bytes change, and then `sync --check` reports the files until you run `frontal sync`.
- **`contractVersion`** (currently `1`) versions the shape of the committed files.
- **`sdkRange`** names the SDK versions the generated client needs: currently `>=2.1.0 <3.0.0`.
- **`entities`** in `version.json` maps each entity to its backend `version`.

There are no timestamps in committed files, so a sync that changes nothing changes nothing on disk.

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
| `ONTOLOGY_INVALID: Object type #n ("X") is malformed at fields.y.type` | The backend returned an object type the CLI cannot read | Fix that object type in Frontal Studio, then `frontal sync` |
| `ONTOLOGY_INVALID: … has the same name as a field` | A relation and a field share a name | Rename one of them |
| `ONTOLOGY_INVALID: Entity "objects" collides with the SDK namespace …` | Entity name is reserved by the SDK's `ontology` object | Rename the entity |
| `ONTOLOGY_INVALID: … is a reserved JavaScript property name` | Name such as `constructor` or `__proto__` | Rename the field, relation or entity |
| `ONTOLOGY_INVALID: … both map to the type name …` | Two names produce the same PascalCase type name | Rename one of them |
| `ONTOLOGY_MALFORMED: Object-type page n …` | The backend page did not have the expected shape | Retry; report the request id if it persists |
| `ONTOLOGY_PAGE_FAILED: Could not read object-type page n. No files were written.` | A request for a later page failed | Retry. Local files are unchanged |
| `ONTOLOGY_CORRUPT: .frontal/ontology.json does not match its schemaHash` | The snapshot was edited by hand | Run `frontal sync` |
| `ONTOLOGY_OUT_OF_DATE` (`sync --check`) | Committed generated files differ from `ontology.json` | Run `frontal sync` locally and commit the result |
| `ONTOLOGY_MISSING` (`sync --check`) | `ontology.json` has never been committed | Run `frontal sync` and commit `.frontal/` |
| `Status: OUTDATED` | Frontal's ontology has changed since the last sync | Run `frontal sync` |
| Type error: `Property 'email' does not exist` after a sync | The ontology changed and the code still uses the old field | Update the code to the new shape; the compiler lists every place |
| `Cannot find module '@frontal-labs/sdk'` or missing `createFrontalClient` overload | SDK older than 2.1.0 | Install `@frontal-labs/sdk@^2.1.0` |

## Known gaps and assumptions

Backend capabilities the typed client does not use yet:

- **No `list` or `query`.** The object API has no type filter or documented query body, so typed
  listing would return objects of every type.
- **No target-side relation queries.** `hasOne`, `hasMany` and `manyToMany` are skipped until the
  backend can answer them.
- **`update` is not atomic.** It reads the object, merges the patch, and writes it back. A concurrent
  write between those requests can be lost.
- **`create` assigns the id on the client.** The SDK generates a UUID and sends it as an explicit `PUT`.
  This assumes the backend accepts client-generated ids (an assumption in the SDK, not verified against
  a live backend). `put(id, input)` writes an explicit id.

Assumptions that need confirmation against a live backend (each is marked `ASSUMPTION` in the code):

- Object records are flat: field names are top-level keys, and `id` is the object id.
- A `belongsTo` foreign key is stored on the source record.
- `PUT /ontology/objects/objects/{id}` replaces the whole record.
- Object-type responses follow `ModelDefinitionSchema` in `@frontal-labs/ontology`. The OpenAPI
  response for them is untyped.
- `timestamp` values arrive as ISO 8601 strings.
