# Command Reference

This comprehensive reference covers all available commands in the Frontal CLI.

## Global Options

All commands support these global options:

- `-p, --profile <name>`: Use specific configuration profile
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

## Authentication Commands

### auth

Authentication and credential management.

#### auth login

Authenticate with the Frontal API.

```bash
frontal auth login [--profile <name>]
```

**Options:**
- `--profile <name>`: Save to specific profile (default: default)

**Example:**
```bash
frontal auth login --profile production
```

#### auth logout

Remove credentials from a profile.

```bash
frontal auth logout [--profile <name>] [--all]
```

**Options:**
- `--profile <name>`: Profile to logout from
- `--all`: Logout from all profiles

#### auth status

Check current authentication status.

```bash
frontal auth status
```

## Configuration Commands

### config

Manage CLI configuration.

#### config set

Set a configuration value.

```bash
frontal config set <key> <value>
```

**Example:**
```bash
frontal config set defaults.outputFormat json
```

#### config get

Get a configuration value.

```bash
frontal config get <key>
```

#### config list

Display all configuration.

```bash
frontal config list
```

#### config reset

Reset configuration to defaults.

```bash
frontal config reset [--profile <name>]
```

## Organization Commands

### orgs

Organization operations and management.

#### orgs list

List all accessible organizations.

```bash
frontal orgs list [--format table|json|yaml]
```

#### orgs info

Get organization details.

```bash
frontal orgs info <org-id>
```

#### orgs create

Create a new organization.

```bash
frontal orgs create <name> [--description <text>]
```

#### orgs update

Update organization information.

```bash
frontal orgs update <org-id> [--name <name>] [--description <text>]
```

#### orgs delete

Delete an organization.

```bash
frontal orgs delete <org-id> [--confirm]
```

#### orgs use

Set active organization.

```bash
frontal orgs use <org-id>
```

## Workspace Commands

### workspaces

Workspace management operations.

#### workspaces list

List workspaces in organization.

```bash
frontal workspaces list [--org <org-id>]
```

#### workspaces info

Get workspace details.

```bash
frontal workspaces info <workspace-id>
```

#### workspaces create

Create a new workspace.

```bash
frontal workspaces create <name> [--org <org-id>] [--description <text>]
```

#### workspaces update

Update workspace information.

```bash
frontal workspaces update <workspace-id> [--name <name>] [--description <text>]
```

#### workspaces delete

Delete a workspace.

```bash
frontal workspaces delete <workspace-id> [--confirm]
```

#### workspaces use

Set active workspace.

```bash
frontal workspaces use <workspace-id>
```

## Team Commands

### teams

Team management operations.

#### teams list

List teams in organization.

```bash
frontal teams list [--org <org-id>]
```

#### teams info

Get team details.

```bash
frontal teams info <team-id>
```

#### teams create

Create a new team.

```bash
frontal teams create <name> [--description <text>]
```

#### teams update

Update team information.

```bash
frontal teams update <team-id> [--name <name>] [--description <text>]
```

#### teams delete

Delete a team.

```bash
frontal teams delete <team-id> [--confirm]
```

#### teams add-member

Add member to team.

```bash
frontal teams add-member <team-id> <user-id> [--role member|admin]
```

#### teams remove-member

Remove member from team.

```bash
frontal teams remove-member <team-id> <user-id>
```

## Role Commands

### roles

Role-based access control.

#### roles list

List available roles.

```bash
frontal roles list [--org <org-id>]
```

#### roles info

Get role details.

```bash
frontal roles info <role-id>
```

#### roles create

Create a new role.

```bash
frontal roles create <name> [--permissions <permissions>]
```

#### roles update

Update role permissions.

```bash
frontal roles update <role-id> [--permissions <permissions>]
```

#### roles delete

Delete a role.

```bash
frontal roles delete <role-id> [--confirm]
```

## Policy Commands

### policies

Policy management.

#### policies list

List policies.

```bash
frontal policies list [--org <org-id>] [--workspace <workspace-id>]
```

#### policies info

Get policy details.

```bash
frontal policies info <policy-id>
```

#### policies create

Create a new policy.

```bash
frontal policies create <name> [--rules <rules>]
```

#### policies update

Update policy rules.

```bash
frontal policies update <policy-id> [--rules <rules>]
```

#### policies delete

Delete a policy.

```bash
frontal policies delete <policy-id> [--confirm]
```

## API Key Commands

### api-keys

API key management.

#### api-keys list

List API keys.

```bash
frontal api-keys list [--org <org-id>]
```

#### api-keys info

Get API key details.

```bash
frontal api-keys info <key-id>
```

#### api-keys create

Create a new API key.

```bash
frontal api-keys create <name> [--permissions <permissions>] [--expires <date>]
```

#### api-keys revoke

Revoke an API key.

```bash
frontal api-keys revoke <key-id>
```

## Function Commands

### functions

Function deployment and management.

#### functions list

List functions.

```bash
frontal functions list [--workspace <workspace-id>]
```

#### functions info

Get function details.

```bash
frontal functions info <function-id>
```

#### functions deploy

Deploy a function.

```bash
frontal functions deploy <path> [--name <name>] [--runtime <runtime>]
```

#### functions update

Update function configuration.

```bash
frontal functions update <function-id> [--env <env-vars>] [--memory <size>]
```

#### functions delete

Delete a function.

```bash
frontal functions delete <function-id> [--confirm]
```

#### functions invoke

Invoke a function.

```bash
frontal functions invoke <function-id> [--data <data>]
```

#### functions logs

View function logs.

```bash
frontal functions logs <function-id> [--tail] [--since <time>]
```

## Container Commands

### containers

Container management.

#### containers list

List containers.

```bash
frontal containers list [--workspace <workspace-id>]
```

#### containers info

Get container details.

```bash
frontal containers info <container-id>
```

#### containers deploy

Deploy a container.

```bash
frontal containers deploy <image> [--name <name>] [--port <port>]
```

#### containers update

Update container configuration.

```bash
frontal containers update <container-id> [--env <env-vars>] [--replicas <count>]
```

#### containers delete

Delete a container.

```bash
frontal containers delete <container-id> [--confirm]
```

#### containers logs

View container logs.

```bash
frontal containers logs <container-id> [--tail] [--since <time>]
```

## Deployment Commands

### deployments

Deployment operations.

#### deployments list

List deployments.

```bash
frontal deployments list [--workspace <workspace-id>]
```

#### deployments info

Get deployment details.

```bash
frontal deployments info <deployment-id>
```

#### deployments create

Create a new deployment.

```bash
frontal deployments create <config-file>
```

#### deployments rollback

Rollback deployment.

```bash
frontal deployments rollback <deployment-id> [--to <version>]
```

#### deployments delete

Delete deployment.

```bash
frontal deployments delete <deployment-id> [--confirm]
```

## Workflow Commands

### workflows

Workflow management.

#### workflows list

List workflows.

```bash
frontal workflows list [--workspace <workspace-id>]
```

#### workflows info

Get workflow details.

```bash
frontal workflows info <workflow-id>
```

#### workflows create

Create a workflow.

```bash
frontal workflows create <name> [--definition <def-file>]
```

#### workflows update

Update workflow definition.

```bash
frontal workflows update <workflow-id> [--definition <def-file>]
```

#### workflows delete

Delete a workflow.

```bash
frontal workflows delete <workflow-id> [--confirm]
```

#### workflows run

Execute a workflow.

```bash
frontal workflows run <workflow-id> [--input <data>]
```

## Pipeline Commands

### pipelines

Pipeline operations.

#### pipelines list

List pipelines.

```bash
frontal pipelines list [--workspace <workspace-id>]
```

#### pipelines info

Get pipeline details.

```bash
frontal pipelines info <pipeline-id>
```

#### pipelines create

Create a pipeline.

```bash
frontal pipelines create <name> [--config <config-file>]
```

#### pipelines update

Update pipeline configuration.

```bash
frontal pipelines update <pipeline-id> [--config <config-file>]
```

#### pipelines delete

Delete a pipeline.

```bash
frontal pipelines delete <pipeline-id> [--confirm]
```

#### pipelines run

Execute a pipeline.

```bash
frontal pipelines run <pipeline-id> [--trigger <event>]
```

## Metrics Commands

### metrics

Metrics and monitoring.

#### metrics get

Get metrics for a resource.

```bash
frontal metrics get <resource-type> <resource-id> [--metric <name>] [--from <time>] [--to <time>]
```

#### metrics list

List available metrics.

```bash
frontal metrics list [--resource-type <type>]
```

#### metrics dashboard

Show metrics dashboard.

```bash
frontal metrics dashboard [--resource <id>] [--refresh <seconds>]
```

## Log Commands

### logs

Log management.

#### logs list

List log sources.

```bash
frontal logs list [--workspace <workspace-id>]
```

#### logs tail

Tail logs in real-time.

```bash
frontal logs tail [--source <source>] [--since <time>] [--filter <filter>]
```

#### logs search

Search logs.

```bash
frontal logs search <query> [--from <time>] [--to <time>] [--source <source>]
```

#### logs export

Export logs.

```bash
frontal logs export [--format json|csv] [--output <file>] [--from <time>] [--to <time>]
```

## Webhook Commands

### webhooks

Webhook configuration.

#### webhooks list

List webhooks.

```bash
frontal webhooks list [--org <org-id>]
```

#### webhooks info

Get webhook details.

```bash
frontal webhooks info <webhook-id>
```

#### webhooks create

Create a webhook.

```bash
frontal webhooks create <url> [--events <events>] [--secret <secret>]
```

#### webhooks update

Update webhook configuration.

```bash
frontal webhooks update <webhook-id> [--url <url>] [--events <events>]
```

#### webhooks delete

Delete a webhook.

```bash
frontal webhooks delete <webhook-id> [--confirm]
```

#### webhooks test

Test webhook delivery.

```bash
frontal webhooks test <webhook-id> [--event <event>]
```

## Billing Commands

### billing

Billing and usage management.

#### billing info

Get billing information.

```bash
frontal billing info [--org <org-id>]
```

#### billing usage

View usage statistics.

```bash
frontal billing usage [--from <date>] [--to <date>] [--granularity daily|monthly]
```

#### billing invoices

List invoices.

```bash
frontal billing invoices [--status paid|pending|overdue]
```

#### billing invoice

Get invoice details.

```bash
frontal billing invoice <invoice-id>
```

## Agent Commands

### agents

AI agent management.

#### agents list

List agents.

```bash
frontal agents list [--workspace <workspace-id>]
```

#### agents info

Get agent details.

```bash
frontal agents info <agent-id>
```

#### agents create

Create an agent.

```bash
frontal agents create <name> [--model <model>] [--instructions <text>]
```

#### agents update

Update agent configuration.

```bash
frontal agents update <agent-id> [--name <name>] [--model <model>] [--instructions <text>]
```

#### agents delete

Delete an agent.

```bash
frontal agents delete <agent-id> [--confirm]
```

#### agents chat

Chat with an agent.

```bash
frontal agents chat <agent-id> [--message <text>]
```

## Status Commands

### status

Platform status and health.

#### status check

Check platform status.

```bash
frontal status check [--detailed]
```

#### status services

Check service health.

```bash
frontal status services [--service <name>]
```

## Marketplace Commands

### marketplace

Marketplace operations.

#### marketplace list

List marketplace items.

```bash
frontal marketplace list [--category <category>] [--search <query>]
```

#### marketplace info

Get marketplace item details.

```bash
frontal marketplace info <item-id>
```

#### marketplace install

Install marketplace item.

```bash
frontal marketplace install <item-id> [--workspace <workspace-id>]
```

#### marketplace uninstall

Uninstall marketplace item.

```bash
frontal marketplace uninstall <item-id> [--workspace <workspace-id>]
```

## Support Commands

### support

Support ticket management.

#### support tickets

List support tickets.

```bash
frontal support tickets [--status open|closed|all]
```

#### support create

Create support ticket.

```bash
frontal support create <subject> [--description <text>] [--priority low|medium|high]
```

#### support info

Get ticket details.

```bash
frontal support info <ticket-id>
```

#### support update

Update ticket.

```bash
frontal support update <ticket-id> [--comment <text>] [--status <status>]
```

## Service Commands

### services

Service catalog management.

#### services list

List available services.

```bash
frontal services list [--category <category>]
```

#### services info

Get service details.

```bash
frontal services info <service-id>
```

#### services enable

Enable a service.

```bash
frontal services enable <service-id> [--workspace <workspace-id>]
```

#### services disable

Disable a service.

```bash
frontal services disable <service-id> [--workspace <workspace-id>]
```

## Feature Flag Commands

### flags

Feature flag management.

#### flags list

List feature flags.

```bash
frontal flags list [--workspace <workspace-id>]
```

#### flags info

Get flag details.

```bash
frontal flags info <flag-id>
```

#### flags create

Create a feature flag.

```bash
frontal flags create <name> [--description <text>] [--enabled true|false]
```

#### flags update

Update flag configuration.

```bash
frontal flags update <flag-id> [--enabled true|false] [--description <text>]
```

#### flags delete

Delete a feature flag.

```bash
frontal flags delete <flag-id> [--confirm]
```

## Completion Commands

### completion

Command completion setup.

#### completion bash

Generate bash completion.

```bash
frontal completion bash
```

#### completion zsh

Generate zsh completion.

```bash
frontal completion zsh
```

#### completion fish

Generate fish completion.

```bash
frontal completion fish
```

## Data Management Commands

### blob

Blob storage operations.

#### blob list

List blobs.

```bash
frontal blob list [--prefix <prefix>] [--workspace <workspace-id>]
```

#### blob upload

Upload file to blob storage.

```bash
frontal blob upload <local-path> <remote-path>
```

#### blob download

Download file from blob storage.

```bash
frontal blob download <remote-path> <local-path>
```

#### blob delete

Delete blob.

```bash
frontal blob delete <remote-path> [--confirm]
```

### graph

Graph database operations.

#### graph query

Execute graph query.

```bash
frontal graph query <query> [--variables <vars>]
```

#### graph schema

Show graph schema.

```bash
frontal graph schema [--format table|json]
```

### ontology

Ontology management.

#### ontology list

List ontologies.

```bash
frontal ontology list [--workspace <workspace-id>]
```

#### ontology info

Get ontology details.

```bash
frontal ontology info <ontology-id>
```

#### ontology create

Create an ontology.

```bash
frontal ontology create <name> [--definition <def-file>]
```

#### ontology update

Update ontology definition.

```bash
frontal ontology update <ontology-id> [--definition <def-file>]
```

#### ontology delete

Delete an ontology.

```bash
frontal ontology delete <ontology-id> [--confirm]
```

## Getting Help

For any command, you can use:

- `frontal --help`: Show global help
- `frontal <command> --help`: Show command-specific help
- `frontal <command> <subcommand> --help`: Show subcommand help

## Output Formats

Most commands support multiple output formats:

- **table**: Human-readable tables (default)
- **json**: Machine-readable JSON
- **yaml**: Human-readable YAML
- **csv**: Comma-separated values

Example:
```bash
frontal orgs list --output json
frontal functions list --output yaml
```
