# Configuration

The CLI has two configuration layers:

1. **Project** — `frontal.jsonc` in the project root (plus optional `frontal.<env>.jsonc` overlays) and a gitignored `.env.local`.
2. **User** — profiles in `~/.frontal/config.json` managed by `frontal config` / `frontal auth`.

## Resolution order

For the API key and base URL:

1. Command-line flag (`--api-key`, `--api-url`)
2. Shell environment (`FRONTAL_API_KEY`, `FRONTAL_API_URL`)
3. `.env.local` in the project
4. `apiUrl` from `frontal.jsonc`
5. The active profile (API key, then OAuth session; `baseUrl`)
6. Defaults (`https://api.frontal.dev/v1`)

## `frontal.jsonc`

```jsonc
{
  "$schema": "https://frontal.dev/schemas/frontal.jsonc",
  "name": "my-app",                  // lowercase letters, digits, dashes
  "env": "dev",                      // dev | staging | prod
  "apiUrl": "https://api.frontal.dev/v1",
  "services": {
    "ai": { "remote": false },
    "agents": { "remote": false },
    "graph": { "remote": false }
  },
  "vars": { "LOG_LEVEL": "info" },   // UPPER_SNAKE_CASE keys, string values
  "secrets": { "required": ["FRONTAL_API_KEY"] },
  "sdk": { "timeout": 30000, "maxRetries": 3 }   // optional, validated by the SDK schema
}
```

| Field | Description |
|---|---|
| `name` | Project name (`^[a-z0-9][a-z0-9-]*$`) |
| `env` | Default environment; `--env` overrides it |
| `apiUrl` | API base URL (http/https) |
| `services` | Map of service → `{ remote }`. Unknown keys are rejected with the list of valid services |
| `vars` | Non-secret configuration written to `.env.local` by `frontal env pull` |
| `secrets.required` | Environment variables that must be set (values never live in this file) |
| `sdk` | Optional `timeout`, `maxRetries`, `retryDelay`, `headers` forwarded to the SDK client |

Valid service keys: `agents`, `ai`, `audit`, `auth`, `billing`, `blob`, `connectors`,
`data`, `datasets`, `events`, `governance`, `graph`, `integrations`, `lineage`,
`observability`, `ontology`, `pipelines`, `sandbox`, `schedules`, `webhooks`,
`workers`, `workflows`.

### Environment overlays

`frontal.staging.jsonc` / `frontal.prod.jsonc` are deep-merged over `frontal.jsonc`
when the environment is selected (`--env staging` or `"env": "staging"`). Overlays
usually only change `apiUrl`, `vars` and `services.*.remote`.

### `.env.local`

Gitignored file holding secret values for local work:

```
FRONTAL_API_KEY=frt_...
FRONTAL_API_URL=https://api.frontal.dev/v1
```

`frontal init` writes `.env.example` as a template.

## Environment variables

| Variable | Purpose |
|---|---|
| `FRONTAL_API_KEY` | API key (`frt_…`) |
| `FRONTAL_API_URL` | API base URL |
| `FRONTAL_ENV` | SDK environment (`development`, `test`, `production`) |
| `FRONTAL_DEBUG` | `1`/`true` to log every request |
| `FRONTAL_PROFILE` | Profile name |
| `FRONTAL_AUTH_URL` | OAuth server for `frontal auth login` (default `https://auth.frontal.dev`) |
| `FRONTAL_CONFIG_DIR` | Profile store location (default `~/.frontal`) |
| `FRONTAL_ORG_ID`, `FRONTAL_WORKSPACE_ID` | Default organization / workspace |

Invalid values for the SDK-validated variables (`FRONTAL_ENV`, `FRONTAL_API_KEY`,
`FRONTAL_API_URL`, `FRONTAL_DEBUG`) are ignored rather than crashing the CLI.

## Profiles (`~/.frontal/config.json`)

```json
{
  "schemaVersion": 2,
  "activeProfile": "default",
  "profiles": {
    "default": { "apiKey": "frt_…", "baseUrl": "https://api.frontal.dev/v1" },
    "staging": { "accessToken": "…", "refreshToken": "…", "tokenExpiresAt": 1900000000, "authUrl": "https://auth.frontal.dev" }
  },
  "telemetry": { "enabled": false },
  "defaults": { "outputFormat": "table", "paginationLimit": 25 }
}
```

```bash
frontal config list
frontal config set baseUrl https://api.staging.frontal.dev/v1 --profile staging
frontal config use staging
frontal config profiles
```
