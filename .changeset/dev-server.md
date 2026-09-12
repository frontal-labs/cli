---
"frontal-cli": minor
---

Add `frontal dev`: a local Frontal API for the project that needs no API key.

- Serves `agents`, `graph`, `datasets`, `blob`, `observability` and `governance` from SDK-compatible fixtures persisted under `.frontal/state/` (JSON per record, gitignored); `GET /health` is always local.
- `--scenario <name>` replays `.frontal/scenarios/<name>.json` routes (same shape as `MockRoute` in `@frontal-labs/testing`, with `times`); scenario routes override built-ins.
- `--remote a,b` proxies services to the real API through the SDK (`X-Frontal-Dev-Proxy` header, SDK-shaped error envelopes); the startup line reports `[local]`/`[remote]` per service.
- Live reload of `frontal*.jsonc`, `.env.local` and scenario files; every response carries `X-Request-Id`; request log on stderr or as NDJSON with `--json`; clean Ctrl+C shutdown.
- Runs on `node:http`, so it works from the npm bundle under Node and from the compiled binary.
