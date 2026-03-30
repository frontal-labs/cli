# Authentication Guide

This guide covers authentication methods and credential management for the Frontal CLI.

## Overview

The Frontal CLI uses API key-based authentication to secure access to the Frontal platform. Each authentication session is stored in a profile, allowing you to manage multiple sets of credentials.

## Authentication Methods

### API Key Authentication

The primary authentication method uses API keys that start with the prefix `frt_`. These keys provide secure access to the Frontal API.

#### Getting Your API Key

1. Log in to the Frontal web console
2. Navigate to Settings > API Keys
3. Click "Generate New API Key"
4. Copy the key (it starts with `frt_`)
5. Store it securely - you won't be able to see it again

## Authentication Commands

### Login

Authenticate and save credentials to a profile:

```bash
frontal auth login
```

#### Options

- `--profile <name>`: Save credentials to a specific profile (default: default)

#### Interactive Prompts

The login command will prompt for:

1. **API Key**: Enter your API key (frt_...)
2. **API Base URL**: Default is https://api.frontal.dev/v1

#### Example

```bash
frontal auth login --profile production
```

### Logout

Remove credentials from a profile:

```bash
frontal auth logout
```

#### Options

- `--profile <name>`: Specific profile to logout from (default: active profile)
- `--all`: Logout from all profiles

#### Example

```bash
frontal auth logout --profile staging
frontal auth logout --all
```

### Status

Check current authentication status:

```bash
frontal auth status
```

#### Output Information

- Active profile
- API key (masked)
- API base URL
- Last validation time
- Authentication validity

## Profile Management

### What are Profiles?

Profiles allow you to manage multiple sets of credentials for different environments or organizations. Each profile contains:

- API key
- API base URL
- Default organization (optional)
- Default workspace (optional)

### Default Profile Structure

```bash
~/.frontal/
├── config.json
└── profiles/
    ├── default.json
    ├── staging.json
    └── production.json
```

### Profile Commands

#### List Profiles

```bash
frontal config list-profiles
```

#### Switch Active Profile

```bash
frontal config use-profile <profile-name>
```

#### Remove Profile

```bash
frontal config remove-profile <profile-name>
```

## Environment Variables

You can override authentication settings using environment variables:

```bash
export FRONTAL_API_KEY="frt_your_api_key_here"
export FRONTAL_API_URL="https://api.frontal.dev/v1"
export FRONTAL_PROFILE="production"
```

### Priority Order

The CLI uses this priority for authentication:

1. Command-line flags (`--api-key`, `--api-url`)
2. Environment variables
3. Active profile configuration
4. Default values

## API Key Security

### Best Practices

1. **Never commit API keys to version control**
2. **Use environment variables in CI/CD pipelines**
3. **Rotate API keys regularly**
4. **Use separate keys for different environments**
5. **Revoke unused keys immediately**

### Key Rotation

To rotate your API key:

1. Generate a new API key in the web console
2. Update your CLI authentication:

```bash
frontal auth login --profile production
```

3. Enter the new API key when prompted
4. Revoke the old key in the web console

### Key Permissions

API keys can have different permission levels:

- **Read-only**: Can view resources but not modify
- **Read-write**: Can view and modify resources
- **Admin**: Full access including user management

## Multi-Factor Authentication

If your organization requires MFA:

1. Authenticate with your API key as usual
2. The CLI will prompt for MFA code if required
3. Enter the code from your authenticator app

## Service Account Authentication

For automated processes and CI/CD:

### Service Account Keys

1. Create a service account in the web console
2. Generate an API key for the service account
3. Use the key in your automated processes

### CI/CD Example

```bash
# GitHub Actions
- name: Authenticate with Frontal
  run: |
    frontal auth login
    # Enter API key from secrets
    echo "${{ secrets.FRONTAL_API_KEY }}" | frontal auth login --profile ci

# GitLab CI
authenticate:
  script:
    - echo "$FRONTAL_API_KEY" | frontal auth login --profile ci
```

## Authentication Troubleshooting

### Common Issues

#### Invalid API Key

```bash
Error: Invalid API key
```

**Solution:**

1. Verify the API key is correct
2. Check it starts with `frt_`
3. Ensure the key is active and not expired
4. Re-authenticate with a new key

#### Network Issues

```bash
Error: Could not connect to API
```

**Solution:**

1. Check your internet connection
2. Verify the API URL is correct
3. Check for firewall/proxy issues
4. Try with a different API URL

#### Permission Denied

```bash
Error: Access denied
```

**Solution:**

1. Check if the API key has required permissions
2. Verify you're using the correct organization/workspace
3. Contact your admin for appropriate permissions

### Debug Mode

Enable debug mode for detailed authentication information:

```bash
frontal auth status --debug
```

### Validation Command

Test your authentication without making changes:

```bash
frontal auth validate
```

## Security Considerations

### Storing API Keys

- **Local Storage**: Keys are stored encrypted in `~/.frontal/`
- **Memory**: Keys are kept in memory only during command execution
- **Logs**: API keys are never logged or displayed in full

### Session Management

- API keys don't expire automatically
- Sessions are stateless (each command authenticates independently)
- No session tokens or cookies are used

### Auditing

All API calls made through the CLI are logged in your organization's audit trail, including:

- Timestamp
- User identity
- Command executed
- Resources accessed
- IP address

## Advanced Configuration

### Custom API Endpoints

For on-premises or custom deployments:

```bash
frontal auth login
# Enter custom API URL when prompted
# e.g., https://api.company.com/v1
```

### Proxy Configuration

If you're behind a corporate proxy:

```bash
export HTTP_PROXY="http://proxy.company.com:8080"
export HTTPS_PROXY="http://proxy.company.com:8080"
frontal auth login
```

### Certificate Validation

For custom certificates:

```bash
export NODE_EXTRA_CA_CERTS="/path/to/ca-bundle.crt"
frontal auth login
```

## Next Steps

After successful authentication:

1. [Configure your CLI settings](./configuration.md)
2. [Explore available commands](./command_reference.md)
3. [Learn about the API](./api_documentation.md)
