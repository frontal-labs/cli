# Installation Guide

This guide covers installing and setting up the Frontal CLI on your system.

## System Requirements

Before installing the Frontal CLI, ensure your system meets the following requirements:

### Node.js
- **Minimum Version**: Node.js 18.0.0 or higher
- **Recommended Version**: Latest LTS release
- **Installation**: Download from [nodejs.org](https://nodejs.org/) or use your system package manager

### Bun (Optional but Recommended)
- **Minimum Version**: Bun 1.3.8 or higher
- **Purpose**: Faster package management and runtime for development
- **Installation**: 
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```

### Operating System Support
- **Linux**: All major distributions (Ubuntu, Debian, CentOS, RHEL, Arch, etc.)
- **macOS**: Intel and Apple Silicon (M1/M2/M3)
- **Windows**: Windows 10 and later with WSL2 support

## Installation Methods

### Method 1: NPM Global Installation (Recommended)

Install the CLI globally using npm:

```bash
npm install -g frontal-cli
```

This installs the `frontal` command globally on your system.

### Method 2: Yarn Global Installation

If you prefer Yarn:

```bash
yarn global add frontal-cli
```

### Method 3: PNPM Global Installation

For PNPM users:

```bash
pnpm add -g frontal-cli
```

### Method 4: Bun Global Installation

If you have Bun installed:

```bash
bun add -g frontal-cli
```

## Verification

After installation, verify that the CLI is working correctly:

```bash
frontal --version
```

You should see output similar to:
```
frontal/0.1.0 darwin-arm64 node-v18.19.0
```

Test the help command:
```bash
frontal --help
```

## Post-Installation Setup

### 1. Authentication

After installing, you need to authenticate with the Frontal platform:

```bash
frontal auth login
```

You'll be prompted for:
- Your API key (starts with `frt_`)
- API base URL (default: https://api.frontal.dev/v1)

### 2. Configuration Verification

Check your current configuration:

```bash
frontal config list
```

### 3. Test Connection

Verify your connection by listing organizations:

```bash
frontal orgs list
```

## Development Installation

If you want to contribute to the CLI or run from source:

### Clone the Repository

```bash
git clone https://github.com/frontal-labs/frontal-cli.git
cd frontal-cli
```

### Install Dependencies

```bash
bun install
```

### Development Mode

Run directly from source:

```bash
bun run dev
```

### Build from Source

```bash
bun run build
```

The built binary will be available in `dist/bin/frontal.js`.

## Environment Variables

The CLI supports several environment variables for configuration:

```bash
# Set default API key
export FRONTAL_API_KEY="frt_your_api_key_here"

# Set default API URL
export FRONTAL_API_URL="https://api.frontal.dev/v1"

# Set default profile
export FRONTAL_PROFILE="default"

# Set default organization
export FRONTAL_ORG="your-org-id"

# Set default workspace
export FRONTAL_WORKSPACE="your-workspace-id"
```

## Shell Completion

### Bash

Add to your `~/.bashrc` or `~/.bash_profile`:

```bash
eval "$(frontal completion bash)"
```

### Zsh

Add to your `~/.zshrc`:

```bash
eval "$(frontal completion zsh)"
```

### Fish

Add to your `~/.config/fish/config.fish`:

```bash
frontal completion fish | source
```

## Upgrading

To upgrade to the latest version:

```bash
npm update -g frontal-cli
```

Or with your preferred package manager:

```bash
# Yarn
yarn global upgrade frontal-cli

# PNPM
pnpm update -g frontal-cli

# Bun
bun update -g frontal-cli
```

## Uninstallation

To remove the CLI from your system:

```bash
npm uninstall -g frontal-cli
```

Or with your package manager:

```bash
# Yarn
yarn global remove frontal-cli

# PNPM
pnpm remove -g frontal-cli

# Bun
bun remove -g frontal-cli
```

## Troubleshooting

### Permission Denied

If you get permission errors during global installation:

```bash
# Option 1: Use npx (no global install needed)
npx frontal-cli <command>

# Option 2: Fix npm permissions
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH

# Option 3: Use sudo (not recommended)
sudo npm install -g frontal-cli
```

### Command Not Found

If the `frontal` command is not found after installation:

1. Check if npm global bin directory is in your PATH:
   ```bash
   npm config get prefix
   ```

2. Add it to your shell configuration:
   ```bash
   export PATH=$(npm config get prefix)/bin:$PATH
   ```

3. Restart your terminal or reload your shell configuration.

### Node.js Version Issues

If you encounter Node.js version errors:

1. Check your Node.js version:
   ```bash
   node --version
   ```

2. Upgrade Node.js if needed:
   - Download from [nodejs.org](https://nodejs.org/)
   - Use a version manager like `nvm` or `fnm`

### Network Issues

If installation fails due to network issues:

1. Try using a different registry:
   ```bash
   npm install -g frontal-cli --registry https://registry.npmjs.org/
   ```

2. Check your proxy settings if behind a corporate firewall.

3. If using npm behind a proxy:
   ```bash
   npm config set proxy http://proxy.company.com:8080
   npm config set https-proxy http://proxy.company.com:8080
   ```

## Next Steps

After successful installation:

1. [Configure authentication](./authentication.md)
2. [Set up your configuration](./configuration.md)
3. [Explore the command reference](./command_reference.md)
4. [Check out the API documentation](./api_documentation.md)
