---
"frontal-cli": minor
---

Add `frontal deploy`, `frontal promote` and `frontal rollback`.

- `deploy` bundles `entry` from `frontal.jsonc` with `bun build`, writes a manifest (state schema only), and uploads the worker as `<name>-preview` (default) or `<name>` (`--prod`, confirmation unless `--yes`). `--dry-run` works fully offline. Prints `<apiUrl>/workers/<name>` and the request id.
- Every deployment is recorded under `.frontal/state/deploys/` with an immutable artifact copy, so `promote <url>` and `rollback [url]` re-send exactly what was deployed without rebuilding.
- `env push` now targets the recorded deployment.
