---
"frontal-cli": minor
---

Add the project workflow: `frontal init` and `frontal types`.

- `frontal init [--name <dir>] [--force]` creates `frontal.jsonc`, `.env.example`, `.gitignore` entries, `src/.gitkeep` and (only if missing) `package.json`; never overwrites without `--force`.
- `frontal types [--out]` generates `FrontalEnv`/`FrontalVars`/`FrontalSecrets`/`FrontalServices`/`FrontalProject` typings from `frontal.jsonc`, with `NodeJS.ProcessEnv` augmentation.
- `frontal.jsonc` is validated with a schema composed from the SDK's `clientConfigSchema`; per-environment overlays (`frontal.<env>.jsonc`, `--env`) and `.env.local` are honoured when resolving credentials and the API URL.
- npm bin is now `dist/index.js`; `bun run build:binary` produces a single executable. Docker image and Homebrew formula updated accordingly.
- README bash blocks are executed in CI; added `llms.txt`.
