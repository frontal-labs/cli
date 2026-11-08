---
"frontal-cli": minor
---

Build the error layer on `@frontal-labs/error`.

- Human error output is a single frame. It is plain under `--no-color`, `NO_COLOR` and non-TTY stderr. Labels now come from the library (`fix:`, `read more:`) rather than `Fix:` and `Docs:`.
- `frontal dev` error responses use the library's `{ "error": { … } }` envelope. Requests with `curl/` or `Accept: text/plain+ansi` get readable ANSI text. Scenario routes are unchanged.

Unchanged: the `--json` error output, the exit codes and the docs anchors.
