# Frontal CLI

The official command-line interface for the Frontal platform, providing comprehensive management capabilities for organizations, workspaces, teams, services, and more.

## Overview

Frontal CLI is a powerful tool that allows you to interact with the Frontal platform directly from your terminal. It provides commands for managing authentication, configuration, organizations, workspaces, teams, deployments, monitoring, and various platform services.

## Features

- **Authentication Management**: Secure login/logout with API key management
- **Multi-Profile Support**: Switch between different configurations
- **Organization & Workspace Management**: Complete org and workspace lifecycle management
- **Team & Role Management**: User access control and permissions
- **Service Management**: Deploy and manage functions, containers, and workflows
- **Monitoring & Logging**: Real-time metrics, logs, and status monitoring
- **Developer Tools**: Completion, marketplace access, and support integration

## Quick Start

```bash
# Install the CLI
npm install -g frontal-cli

# Authenticate with your API key
frontal auth login

# List your organizations
frontal orgs list

# Switch to a specific workspace
frontal workspaces use <workspace-id>

# Deploy a function
frontal functions deploy
```

## Documentation

- [Installation Guide](./installation_guide.md)
- [Authentication](./authentication.md)
- [Configuration](./configuration.md)
- [Command Reference](./command_reference.md)
- [API Documentation](./api_documentation.md)
- [Troubleshooting](./troubleshooting_guide.md)

## Global Options

All commands support these global options:

- `-p, --profile <name>`: Use a specific configuration profile (default: default)
- `-o, --org <id>`: Set organization context
- `-w, --workspace <id>`: Set workspace context
- `--api-key <key>`: Override API key
- `--api-url <url>`: Override API base URL
- `-j, --json`: Output as JSON
- `--yaml`: Output as YAML
- `-q, --quiet`: Suppress non-essential output
- `-v, --verbose`: Verbose logging
- `--debug`: Debug mode
- `--no-color`: Disable colors

## Command Categories

### Authentication & Configuration
- `auth`: Authentication and credential management
- `config`: CLI configuration management

### Organization Management
- `orgs`: Organization operations
- `workspaces`: Workspace management
- `teams`: Team management
- `roles`: Role-based access control
- `policies`: Policy management

### API Management
- `api-keys`: API key management
- `webhooks`: Webhook configuration

### Services & Deployment
- `functions`: Function deployment and management
- `containers`: Container management
- `deployments`: Deployment operations
- `workflows`: Workflow management
- `pipelines`: Pipeline operations

### Data & Storage
- `blob`: Blob storage operations
- `graph`: Graph database operations
- `ontology`: Ontology management

### Monitoring & Observability
- `metrics`: Metrics and monitoring
- `logs`: Log management
- `status`: Platform status

### Platform Features
- `agents`: AI agent management
- `billing`: Billing and usage
- `marketplace`: Marketplace operations
- `support`: Support tickets
- `services`: Service catalog
- `flags`: Feature flags
- `completion`: Command completion

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
