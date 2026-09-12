# Frontal CLI

The official command-line interface for the Frontal platform. Built on `@frontal-labs/sdk`.

## Overview

Frontal CLI lets you work with the Frontal platform from your terminal: scaffold a project, generate typings, authenticate, and manage workflows, runs, invocations and events through the official SDK.

## Features

- **Project model**: `frontal.jsonc` with per-environment overlays and generated typings
- **SDK transport**: every call goes through `@frontal-labs/sdk`; errors carry a code, fix hint, docs link and request id
- **Authentication**: browser OAuth (PKCE) or API keys, multiple profiles
- **Workflows, runs, invocations, events**: typed access to the public API, SSE streaming
- **Agent-friendly**: `--json` everywhere, stable exit codes, secrets always redacted, `llms.txt`

## Quick Start

```bash
# Install the CLI
npm install -g frontal-cli

# Create a project and generate typings
frontal init --name my-app
cd my-app && frontal types

# Authenticate
frontal auth login

# Talk to the API
frontal workflows list --json
```

## Documentation

- [Installation Guide](./INSTALLATION_GUIDE.md)
- [Configuration](./CONFIGURATION.md)
- [Command Reference](./COMMAND_REFERENCE.md)
- [Developers](./DEVELOPERS.md)
- [Architecture](./ARCHITECTURE.md)
- [Migration from v1](./V2_MIGRATION.md)

## Global Options

All commands support these global options:

- `-p, --profile <name>`: Use a specific configuration profile (default: default)
- `--env <dev|staging|prod>`: Select the environment overlay
- `--api-key <key>`: Override API key
- `--api-url <url>`: Override API base URL
- `-j, --json`: Output as JSON (secrets redacted)
- `--yaml`: Output as YAML
- `-q, --quiet`: Suppress non-essential output
- `-v, --verbose`: Verbose logging
- `--debug`: Debug mode
- `-y, --yes`: Skip confirmation prompts
- `--no-color`: Disable colors

## Command Categories

### Project
- `init`: Create `frontal.jsonc` and the project skeleton
- `types`: Generate `FrontalEnv` / `FrontalServices` / `FrontalProject` typings

### Authentication & Configuration
- `auth`: Sessions, API keys and MFA
- `config`: Profiles in `~/.frontal`

### Platform resources
- `workflows`: Workflows and executions (SSE timeline)
- `runs`, `invocations`, `events`

### Shell
- `completion`: Bash/zsh/fish completions
- `migrate-legacy`: v1 → current command mapping

## Getting Help

For any command, you can use:
- `frontal --help`: Show global help
- `frontal <command> --help`: Show command-specific help
- `frontal <command> <subcommand> --help`: Show subcommand help

## Requirements

- Node.js >= 18
- Bun >= 1.3.8 (recommended for development)

## License

This project is part of the Frontal platform ecosystem.
