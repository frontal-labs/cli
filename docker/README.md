# docker/

All Docker config for frontal-cli. The build context is always the **repo
root** (the `Dockerfile` copies `package.json`/`bun.lock` and the full source,
then runs `bun run build`), so every command below runs from the repo root.

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build: `oven/bun:1.3.8-slim` builder → `node:22-alpine` runtime (non-root `frontal` user, `dumb-init` entrypoint) |
| `docker-compose.yml` | Local run: builds the image, mounts `~/.frontal` config + repo-root `./workspace`, passes through `FRONTAL_*` env |
| `README.md` | This file |

`../.dockerignore` lives at the repo root on purpose: Docker only honors
`.dockerignore` at the **context root**, so placing it here would silently do
nothing.

## Build

```bash
docker build -f docker/Dockerfile -t frontal/cli:latest .
```

CI (`.github/workflows/ci.yml`, `docker` job) builds `linux/amd64,linux/arm64`
from the same file (`context: .`, `file: ./docker/Dockerfile`) and pushes to
`ghcr.io/frontal-labs/cli`.

## Run with compose

```bash
mkdir -p workspace
FRONTAL_API_KEY=frt_… docker compose -f docker/docker-compose.yml up --build
frontal --help # inside the container: `docker exec -it frontal frontal --help`
```

## Published image

```bash
docker pull ghcr.io/frontal-labs/cli:latest
```
