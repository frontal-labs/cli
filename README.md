<picture>
 <source srcset="./assets/images/banner-dark.png" media="(prefers-color-scheme: dark)">
 <source srcset="./assets/images/banner.png" media="(prefers-color-scheme: light)">
 <img src="./assets/images/banner-dark.png" alt="Frontal Banner">
</picture>

# Frontal CLI

The official command-line interface for the Frontal cloud platform.

## Quick Start

### Installation

```bash
# Install globally
npm install -g frontal-cli

# Or install locally
npm install frontal-cli

# Or use with bun
bun install frontal-cli

# Or install with Homebrew
brew tap frontal-labs/cli
brew install frontal-cli
```

### Authentication

```bash
# Login to your Frontal account
frontal auth login

# This will open a browser for authentication
# or provide an API key option
```

### Basic Usage

```bash
# List all available commands
frontal --help

# Check current configuration
frontal config show

# Deploy a project
frontal deploy

# List your projects
frontal projects list
```

## Commands

### Authentication

```bash
frontal auth login          # Login to Frontal
frontal auth logout         # Logout from current session
frontal auth status         # Check authentication status
frontal auth whoami         # Show current user info
```

### Projects

```bash
frontal projects list       # List all projects
frontal projects create     # Create a new project
frontal projects info       # Show project details
frontal projects delete     # Delete a project
```

### Deployment

```bash
frontal deploy              # Deploy current directory
frontal deploy --prod       # Deploy to production
frontal deploy --env staging # Deploy to specific environment
frontal deploy status       # Check deployment status
```

### Functions

```bash
frontal functions list      # List deployed functions
frontal functions deploy    # Deploy a function
frontal functions logs      # View function logs
frontal functions invoke    # Invoke a function
```

### Storage

```bash
frontal storage list        # List storage buckets
frontal storage upload      # Upload files
frontal storage download    # Download files
frontal storage delete      # Delete files
```

### API Keys

```bash
frontal api-keys list       # List API keys
frontal api-keys create     # Create new API key
frontal api-keys revoke     # Revoke an API key
```

### Configuration

```bash
frontal config show         # Show current configuration
frontal config set          # Set configuration value
frontal config unset        # Remove configuration value
frontal config reset        # Reset to defaults
```

## Configuration

### Environment Variables

```bash
# Frontal API endpoint
export FRONTAL_API_URL="https://api.frontal.dev"

# Default project
export FRONTAL_PROJECT="my-project"

# Default environment
export FRONTAL_ENVIRONMENT="development"

# API key (alternative to auth login)
export FRONTAL_API_KEY="your-api-key-here"
```

### Configuration File

The CLI stores configuration in `~/.frontal/config.json`:

```json
{
  "apiUrl": "https://api.frontal.dev",
  "apiKey": "encrypted-api-key",
  "defaultProject": "my-project",
  "defaultEnvironment": "development",
  "user": {
    "id": "user-id",
    "email": "user@example.com"
  }
}
```

## Project Structure

The CLI works with standard Frontal project structures:

```
my-project/
├── frontal.json          # Project configuration
├── functions/            # Serverless functions
│   └── my-function/
│       ├── index.js
│       └── package.json
├── storage/              # Static assets
├── config/               # Configuration files
└── tests/                # Test files
```

### frontal.json

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "environments": {
    "development": {
      "functions": {
        "my-function": {
          "runtime": "nodejs18",
          "memory": 256,
          "timeout": 30
        }
      }
    },
    "production": {
      "functions": {
        "my-function": {
          "runtime": "nodejs18",
          "memory": 512,
          "timeout": 60
        }
      }
    }
  }
}
```

## Examples

### Deploying a Function

```bash
# Create a new function
mkdir my-function
cd my-function

# Initialize function
cat > index.js << 'EOF'
export async function handler(event) {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello, World!' })
  };
}
EOF

# Deploy
frontal functions deploy my-function
```

### Setting Up Storage

```bash
# Upload files to storage
frontal storage upload ./public/* --bucket my-assets

# List uploaded files
frontal storage list --bucket my-assets

# Download files
frontal storage download my-assets/logo.png
```

### Managing Projects

```bash
# Create a new project
frontal projects create --name "my-awesome-project"

# Set as default
frontal config set defaultProject "my-awesome-project"

# Deploy to the new project
frontal deploy
```

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/frontal-cloud/cli.git
cd cli

# Install dependencies
bun install

# Build the CLI
bun run build

# Run locally
./dist/bin/frontal.js --help
```

### Running Tests

```bash
# Run all tests
bun run test

# Run tests in watch mode
bun run test:watch

# Generate coverage report
bun run test:coverage
```

### Code Quality

```bash
# Lint code
bun run lint

# Format code
bun run format

# Type check
bun run type-check
```

## Troubleshooting

### Common Issues

#### Authentication Problems

```bash
# Check auth status
frontal auth status

# Clear cached credentials
frontal auth logout

# Re-authenticate
frontal auth login
```

#### Deployment Failures

```bash
# Check deployment logs
frontal deploy status --verbose

# Validate project structure
frontal validate

# Check configuration
frontal config show
```

#### Network Issues

```bash
# Set custom API endpoint
frontal config set apiUrl "https://api.frontal.dev"

# Use proxy if needed
export HTTPS_PROXY="http://proxy.example.com:8080"
```

### Debug Mode

Enable debug logging:

```bash
# Set log level
export FRONTAL_LOG_LEVEL=debug

# Or use flag
frontal --verbose deploy
```

### Getting Help

```bash
# General help
frontal --help

# Command-specific help
frontal deploy --help

# Show version
frontal --version
```

## Homebrew Management

### Installation

```bash
# Add the tap
brew tap frontal-labs/cli

# Install the CLI
brew install frontal-cli
```

### Updates

```bash
# Update to latest version
brew upgrade frontal-cli

# Or update all packages
brew upgrade
```

### Uninstallation

```bash
# Remove the CLI
brew uninstall frontal-cli

# Remove the tap
brew untap frontal-labs/cli
```

### Troubleshooting

```bash
# Reinstall if issues occur
brew reinstall frontal-cli

# Force upgrade to latest
brew upgrade frontal-cli --force
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [docs.frontal.dev](https://docs.frontal.dev)
- **Issues**: [GitHub Issues](https://github.com/frontal-cloud/cli/issues)
- **Discussions**: [GitHub Discussions](https://github.com/frontal-cloud/cli/discussions)
- **Email**: support@frontal.dev

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and changes.