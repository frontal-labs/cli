---
"frontal-cli": minor
---

Add `frontal env pull|push`, `frontal logs` and `frontal policy check`.

- `env pull [file] [--force]` writes `.env.local` from `frontal.jsonc` (`apiUrl`, `secrets.required`, `vars`) and the active credential; never overwrites without `--force`; secret values are never printed.
- `env push [file]` validates required secrets, verifies the credential and redeploys the current deployment with the variables (`POST /workers` with `env_vars` sent verbatim — the SDK's `workers.deploy` transform would lowercase variable names).
- `logs [--follow] [--filter] [--since] [--level] [--limit]` queries `observability.logs.query`; `--follow` tails the SSE stream with reconnect/backoff and clean Ctrl+C.
- `policy check [--strict] [--user] [--role]` validates local policy files, checks deploy access per enabled service (`access.check`), lists active policies and reads the compliance score; exit 1 on deny, `--strict` promotes warnings.
- `frontal dev` gains local `workers`, `auth/account/profile` and a `key:value` log query language so all three commands work offline.
- SDK handles accept an abort signal (`getSdk(opts, { signal })`) that cancels open SSE streams.
