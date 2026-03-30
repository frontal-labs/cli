# Frontal CLI Usage Guide

This guide provides practical examples and common usage patterns for the Frontal CLI.

## Quick Start

### First-Time Setup

```bash
# Install the CLI
npm install -g frontal-cli

# Authenticate
frontal auth login

# Check your status
frontal auth status

# List your organizations
frontal orgs list
```

## Daily Workflow

### Setting Your Context

```bash
# Set your default organization
frontal orgs use org-123456

# Set your default workspace
frontal workspaces use ws-789012

# Verify your context
frontal config list
```

### Common Operations

```bash
# List functions in your workspace
frontal functions list

# Deploy a new function
frontal functions deploy ./my-function --name api-handler

# Check function logs
frontal functions logs api-handler --tail

# List containers
frontal containers list

# Deploy a container
frontal containers deploy nginx:latest --name web-server --port 80
```

## Command Examples

### Authentication Management

```bash
# Login with specific profile
frontal auth login --profile production

# Check current authentication
frontal auth status

# Logout from specific profile
frontal auth logout --profile staging

# Logout from all profiles
frontal auth logout --all
```

### Organization & Workspace Management

```bash
# List all organizations
frontal orgs list --output table

# Get organization details
frontal orgs info org-123456

# Create new organization
frontal orgs create "New Project" --description "New project organization"

# Switch to organization
frontal orgs use org-123456

# List workspaces in organization
frontal workspaces list

# Create new workspace
frontal workspaces create "development" --description "Development environment"

# Switch to workspace
frontal workspaces use ws-dev-123
```

### Function Management

```bash
# List all functions
frontal functions list

# List functions with specific status
frontal functions list --status active

# Get function details
frontal functions info fn-api-handler

# Deploy function from directory
frontal functions deploy ./src/api --name api-handler --runtime nodejs18

# Update function configuration
frontal functions update fn-api-handler --memory 512 --timeout 60

# Invoke function with data
frontal functions invoke fn-api-handler --data '{"message": "test"}'

# View function logs
frontal functions logs fn-api-handler

# Tail logs in real-time
frontal functions logs fn-api-handler --tail

# Get logs from last hour
frontal functions logs fn-api-handler --since 1h

# Delete function
frontal functions delete fn-api-handler --confirm
```

### Container Management

```bash
# List containers
frontal containers list

# Get container details
frontal containers info ct-web-server

# Deploy new container
frontal containers deploy nginx:latest --name web-server --port 80

# Update container with environment variables
frontal containers update ct-web-server --env NODE_ENV=production

# Scale container
frontal containers update ct-web-server --replicas 3

# View container logs
frontal containers logs ct-web-server --tail

# Delete container
frontal containers delete ct-web-server --confirm
```

### Workflow & Pipeline Operations

```bash
# List workflows
frontal workflows list

# Create workflow from definition file
frontal workflows create "data-pipeline" --definition ./pipeline.json

# Run workflow
frontal workflows run wf-data-pipeline --input '{"source": "api"}'

# List pipelines
frontal pipelines list

# Create pipeline
frontal pipelines create "build-pipeline" --config ./build-config.json

# Trigger pipeline
frontal pipelines run pl-build-pipeline --trigger webhook
```

### Team & Access Management

```bash
# List teams
frontal teams list

# Create team
frontal teams create "developers" --description "Development team"

# Add member to team
frontal teams add-member team-dev-123 user-456 --role admin

# List roles
frontal roles list

# Create custom role
frontal roles create "function-admin" --permissions '["functions:read", "functions:write"]'

# List API keys
frontal api-keys list

# Create new API key
frontal api-keys create "production-key" --permissions '["read", "write"]' --expires 2024-12-31
```

### Monitoring & Debugging

```bash
# Check platform status
frontal status check

# Check specific service
frontal status services --service api

# Get metrics for function
frontal metrics get function fn-api-handler --metric invocations --from 1h

# Show metrics dashboard
frontal metrics dashboard --resource fn-api-handler --refresh 30

# Search logs
frontal logs search "error" --from 1h --source function

# Export logs
frontal logs export --format json --output logs.json --from 24h

# List available metrics
frontal metrics list --resource-type function
```

## Output Formats

### Table Output (Default)

```bash
frontal orgs list
# ┌─────────────┬──────────┬─────────────────┐
# │ ID          │ Name     │ Created         │
# ├─────────────┼──────────┼─────────────────┤
# │ org-123456  │ Acme Corp│ 2024-01-15      │
# └─────────────┴──────────┴─────────────────┘
```

### JSON Output

```bash
frontal functions list --output json
# {
#   "functions": [
#     {
#       "id": "fn-123",
#       "name": "api-handler",
#       "runtime": "nodejs18",
#       "status": "active"
#     }
#   ]
# }
```

### YAML Output

```bash
frontal containers list --output yaml
# containers:
#   - id: ct-123
#     name: web-server
#     image: nginx:latest
#     status: running
```

## Configuration Usage

### Setting Preferences

```bash
# Set default output format
frontal config set defaults.outputFormat json

# Set default organization
frontal config set defaults.org org-123456

# Set request timeout
frontal config set http.timeout 60000

# Enable progress indicators
frontal config set interactive.showProgress true
```

### Profile Management

```bash
# Create development profile
frontal auth login --profile development

# Switch to production profile
frontal config use-profile production

# List all profiles
frontal config list-profiles
```

## Advanced Usage

### Batch Operations

```bash
# Deploy multiple functions
for dir in functions/*/; do
  frontal functions deploy "$dir" --name "$(basename "$dir")"
done

# Update multiple containers
frontal containers list --output json | \
  jq -r '.containers[].id' | \
  xargs -I {} frontal containers update {} --env VERSION=2.0
```

### Automation Scripts

```bash
#!/bin/bash
# deploy.sh - Automated deployment script

set -e

# Configuration
FUNCTION_NAME=$1
FUNCTION_DIR=$2
PROFILE=${3:-production}

if [ -z "$FUNCTION_NAME" ] || [ -z "$FUNCTION_DIR" ]; then
  echo "Usage: $0 <function-name> <function-dir> [profile]"
  exit 1
fi

echo "Deploying $FUNCTION_NAME from $FUNCTION_DIR using profile $PROFILE"

# Deploy function
frontal --profile $PROFILE functions deploy "$FUNCTION_DIR" --name "$FUNCTION_NAME"

# Wait for deployment to complete
sleep 5

# Verify deployment
frontal --profile $PROFILE functions info "$FUNCTION_NAME"

echo "Deployment completed successfully!"
```

### Integration with CI/CD

```yaml
# GitHub Actions example
- name: Deploy to Frontal
  run: |
    frontal auth login --profile ci
    frontal functions deploy ./dist --name api-$GITHUB_SHA
    frontal functions logs api-$GITHUB_SHA --tail --since 5m
  env:
    FRONTAL_API_KEY: ${{ secrets.FRONTAL_API_KEY }}
    FRONTAL_ORG: ${{ secrets.FRONTAL_ORG }}
```

## Environment Variables

```bash
# Set API key
export FRONTAL_API_KEY="frt_your_api_key"

# Set default organization
export FRONTAL_ORG="org-123456"

# Set default workspace
export FRONTAL_WORKSPACE="ws-789012"

# Set output format
export FRONTAL_OUTPUT_FORMAT="json"

# Disable colors
export FRONTAL_NO_COLOR="true"

# Enable debug mode
export FRONTAL_DEBUG="true"
```

## Common Workflows

### Development Workflow

```bash
# 1. Set development context
frontal config use-profile development

# 2. Deploy function
frontal functions deploy ./src --name my-function-dev

# 3. Test function
frontal functions invoke my-function-dev --data '{"test": true}'

# 4. Check logs
frontal functions logs my-function-dev --tail

# 5. Iterate and redeploy
frontal functions deploy ./src --name my-function-dev
```

### Production Deployment

```bash
# 1. Switch to production profile
frontal config use-profile production

# 2. Deploy with confirmation
frontal functions deploy ./dist --name api-handler

# 3. Verify deployment
frontal functions info api-handler

# 4. Monitor health
frontal metrics dashboard --resource api-handler --refresh 60
```

### Troubleshooting Workflow

```bash
# 1. Check authentication
frontal auth status

# 2. Verify configuration
frontal config list

# 3. Test connectivity
frontal status check

# 4. Enable debug mode
frontal functions list --debug

# 5. Check recent logs
frontal logs search "error" --since 1h

# 6. Get detailed error information
frontal functions info failing-function --verbose
```

## Tips and Tricks

### Productivity Tips

```bash
# Use command completion
eval "$(frontal completion bash)"

# Create aliases for common commands
alias ff='frontal functions'
alias fc='frontal containers'
alias fo='frontal orgs'

# Use JSON output for scripting
frontal functions list --output json | jq '.functions[] | select(.status == "active")'

# Use quiet mode for scripts
frontal functions deploy ./src --name api-handler --quiet
```

### Best Practices

```bash
# Always specify profiles for production operations
frontal --profile production functions deploy ./src

# Use confirmation for destructive operations
frontal functions delete old-function --confirm

# Enable logging for debugging
frontal functions list --debug

# Use specific output formats for parsing
frontal orgs list --output json | jq '.organizations[0].id'

# Set appropriate timeouts for long operations
frontal config set http.timeout 120000
```

## Error Handling

```bash
# Check exit codes
if frontal functions deploy ./src --name api-handler; then
  echo "Deployment succeeded"
else
  echo "Deployment failed"
  frontal functions logs api-handler --since 10m
fi

# Use --quiet to suppress non-error output
frontal functions deploy ./src --name api-handler --quiet || echo "Deployment failed"

# Capture errors for logging
frontal functions deploy ./src --name api-handler 2>&1 | tee deploy.log
```

## Next Steps

- [Explore the command reference](./command_reference.md)
- [Learn about configuration](./configuration.md)
- [Check the troubleshooting guide](./troubleshooting_guide.md)
- [Review the API documentation](./api_documentation.md)