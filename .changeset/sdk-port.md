---
"frontal-cli": minor
---

Route all API calls through `@frontal-labs/sdk` (pinned 1.0.4) instead of the hand-rolled HTTP client.

- New `src/lib/sdk.ts` factory (`getSdk`) with credential precedence `--api-key` > `FRONTAL_API_KEY` > profile API key > profile OAuth session; OAuth sessions are bridged and auto-refreshed.
- Errors now always print `code`, a fix hint, a docs link and the request id (also under `--json`); new exit code `6` for configuration errors.
- Secrets (API keys, bearer tokens, JWTs, `*_token`/`*_key`/`password` fields) are redacted from every output mode.
- `auth whoami` shows the remote account profile (`--local` to skip); `auth login --method api-key` validates the key before saving.
- Every command `--help` now shows examples. New global flags `--env` and `--yes`.
- `FRONTAL_CONFIG_DIR` overrides the `~/.frontal` location.
