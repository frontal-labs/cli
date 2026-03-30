# Configuration Guide

This guide covers configuring the Frontal CLI for optimal usage across different environments and workflows.

## Overview

The Frontal CLI uses a hierarchical configuration system that allows you to customize behavior at global, profile, and command levels. Configuration includes output formatting, default contexts, API settings, and user preferences.

## Configuration File Structure

Configuration files are stored in `~/.frontal/`:

```
~/.frontal/
├── config.json          # Global configuration
├── profiles/            # Profile-specific configurations
│   ├── default.json
│   ├── staging.json
│   └── production.json
└── history              # Command history (optional)
```

## Configuration Commands

### Set Configuration

Set a specific configuration value:

```bash
frontal config set <key> <value>
```

#### Examples

```bash
# Set default output format
frontal config set defaults.outputFormat json

# Set default organization
frontal config set defaults.org "org-123456"

# Set request timeout
frontal config set http.timeout 30000

# Enable auto-completion
frontal config set interactive.autoComplete true
```

### Get Configuration

Retrieve a specific configuration value:

```bash
frontal config get <key>
```

#### Examples

```bash
# Get current output format
frontal config get defaults.outputFormat

# Get timeout setting
frontal config get http.timeout
```

### List Configuration

Display all configuration for the active profile:

```bash
frontal config list
```

### Reset Configuration

Reset configuration to defaults:

```bash
frontal config reset [--profile <name>]
```

## Configuration Schema

### Global Configuration

```json
{
  "version": "1.0.0",
  "defaults": {
    "outputFormat": "table",
    "org": null,
    "workspace": null,
    "profile": "default"
  },
  "http": {
    "timeout": 30000,
    "retries": 3,
    "retryDelay": 1000
  },
  "interactive": {
    "autoComplete": true,
    "confirmDestructive": true,
    "showProgress": true
  },
  "logging": {
    "level": "info",
    "file": null,
    "maxSize": "10MB",
    "maxFiles": 5
  },
  "ui": {
    "theme": "default",
    "colors": true,
    "unicode": true,
    "pager": "less"
  }
}
```

### Profile Configuration

```json
{
  "apiKey": "frt_...",
  "baseUrl": "https://api.frontal.dev/v1",
  "org": "org-123456",
  "workspace": "ws-789012",
  "defaults": {
    "outputFormat": "json"
  }
}
```

## Configuration Categories

### Output Formatting

Control how command output is displayed:

```bash
# Set output format
frontal config set defaults.outputFormat table|json|yaml|csv

# Table-specific settings
frontal config set output.table.maxWidth 120
frontal config set output.table.wrapHeaders true

# JSON formatting
frontal config set output.json.indent 2
frontal config set output.json.sortKeys true
```

#### Available Output Formats

- **table**: Human-readable tables (default)
- **json**: Machine-readable JSON
- **yaml**: Human-readable YAML
- **csv**: Comma-separated values
- **tsv**: Tab-separated values

### HTTP Settings

Configure API request behavior:

```bash
# Request timeout in milliseconds
frontal config set http.timeout 30000

# Number of retries for failed requests
frontal config set http.retries 3

# Delay between retries (milliseconds)
frontal config set http.retryDelay 1000

# Custom headers
frontal config set http.headers.User-Agent "my-custom-agent/1.0"
```

### Interactive Settings

Control interactive behavior:

```bash
# Enable command auto-completion
frontal config set interactive.autoComplete true

# Confirm destructive operations
frontal config set interactive.confirmDestructive true

# Show progress indicators
frontal config set interactive.showProgress true

# Interactive timeout (seconds)
frontal config set interactive.timeout 60
```

### Logging Configuration

Configure logging behavior:

```bash
# Log level: error, warn, info, debug, trace
frontal config set logging.level info

# Log to file
frontal config set logging.file ~/.frontal/logs/frontal.log

# Log rotation
frontal config set logging.maxSize "10MB"
frontal config set logging.maxFiles 5
```

### UI Customization

Customize the user interface:

```bash
# Color theme: default, dark, light, monochrome
frontal config set ui.theme default

# Enable colors
frontal config set ui.colors true

# Use Unicode characters
frontal config set ui.unicode true

# Pager for long output
frontal config set ui.pager "less -R"
```

## Context Configuration

### Default Organization

Set a default organization for all commands:

```bash
frontal config set defaults.org "org-123456"
```

### Default Workspace

Set a default workspace:

```bash
frontal config set defaults.workspace "ws-789012"
```

### Profile Management

Switch between configuration profiles:

```bash
# List available profiles
frontal config list-profiles

# Switch active profile
frontal config use-profile staging

# Create new profile
frontal config create-profile development

# Remove profile
frontal config remove-profile old-profile
```

## Environment Variables

Override configuration with environment variables:

```bash
# Authentication
export FRONTAL_API_KEY="frt_your_api_key"
export FRONTAL_API_URL="https://api.frontal.dev/v1"

# Context
export FRONTAL_ORG="org-123456"
export FRONTAL_WORKSPACE="ws-789012"
export FRONTAL_PROFILE="production"

# Output
export FRONTAL_OUTPUT_FORMAT="json"
export FRONTAL_NO_COLOR="true"

# HTTP
export FRONTAL_TIMEOUT="30000"
export FRONTAL_RETRIES="3"

# Debug
export FRONTAL_DEBUG="true"
export FRONTAL_LOG_LEVEL="debug"
```

## Configuration Precedence

Settings are applied in this order (highest to lowest priority):

1. Command-line flags
2. Environment variables
3. Profile configuration
4. Global configuration
5. Default values

### Example Precedence

```bash
# Command-line flag (highest priority)
frontal orgs list --output json

# Environment variable
export FRONTAL_OUTPUT_FORMAT="yaml"
frontal orgs list

# Profile configuration
frontal config set defaults.outputFormat table

# Global configuration
frontal config set defaults.outputFormat json
```

## Advanced Configuration

### Custom Templates

Define custom output templates:

```bash
# Custom table template
frontal config set templates.orgs.table "ID\tName\tCreated\n{{id}}\t{{name}}\t{{createdAt}}"

# Custom JSON template
frontal config set templates.functions.json '{"id": "{{id}}", "name": "{{name}}", "runtime": "{{runtime}}"}'
```

### Aliases

Create command aliases:

```bash
# Create alias
frontal config set aliases.ls "orgs list"
frontal config set aliases.deploy "functions deploy"

# Use alias
frontal ls
frontal deploy
```

### Hooks

Configure command hooks:

```bash
# Pre-command hook
frontal config set hooks.preDeploy "echo 'Starting deployment...'"

# Post-command hook
frontal config set hooks.postDeploy "echo 'Deployment completed!'"

# Error hook
frontal config set hooks.onError "frontal logs tail --last 100"
```

## Configuration Validation

### Validate Configuration

Check your configuration for errors:

```bash
frontal config validate
```

### Test Configuration

Test API connectivity with current configuration:

```bash
frontal config test
```

### Configuration Diagnostics

Show detailed configuration information:

```bash
frontal config diagnostics
```

## Configuration Best Practices

### Environment-Specific Profiles

Create profiles for different environments:

```bash
# Development profile
frontal auth login --profile development
frontal config set defaults.org dev-org --profile development

# Staging profile
frontal auth login --profile staging
frontal config set defaults.org staging-org --profile staging

# Production profile
frontal auth login --profile production
frontal config set defaults.org prod-org --profile production
```

### Team Configuration

Share configuration with your team:

```bash
# Export configuration
frontal config export > team-config.json

# Import configuration
frontal config import team-config.json
```

### Security Considerations

1. **Never commit API keys** to version control
2. **Use environment variables** for sensitive data
3. **Restrict file permissions** on configuration files
4. **Use profiles** to isolate environments
5. **Regularly rotate** API keys

## Troubleshooting Configuration

### Common Issues

#### Invalid Configuration

```bash
Error: Invalid configuration value
```

**Solution:**

1. Validate configuration: `frontal config validate`
2. Check syntax: `frontal config list`
3. Reset to defaults: `frontal config reset`

#### Profile Not Found

```bash
Error: Profile 'staging' not found
```

**Solution:**

1. List available profiles: `frontal config list-profiles`
2. Create missing profile: `frontal config create-profile staging`
3. Switch to valid profile: `frontal config use-profile default`

#### Permission Denied

```bash
Error: Cannot write configuration file
```

**Solution:**

1. Check permissions: `ls -la ~/.frontal/`
2. Fix permissions: `chmod 755 ~/.frontal/`
3. Check disk space

### Debug Mode

Enable debug mode for configuration issues:

```bash
frontal config list --debug
```

## Next Steps

After configuring the CLI:

1. [Explore the command reference](./command_reference.md)
2. [Learn about the API](./api_documentation.md)
3. [Check troubleshooting guide](./troubleshooting_guide.md)
