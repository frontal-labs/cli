# Homebrew Installation

This document explains how to set up Homebrew installation for the Frontal CLI.

## Overview

The Frontal CLI can be installed via Homebrew using a custom tap. This provides:

- Automatic dependency management (Node.js/Bun)
- Easy updates with `brew upgrade frontal-cli`
- Clean installation and removal
- Integration with system package management

## Setup Requirements

### 1. Homebrew Formula

The formula is defined in `frontal-cli.rb` in this repository. It:

- Downloads the source from GitHub
- Installs Bun as a dependency
- Builds the CLI using `bun run build`
- Installs the binary to the Homebrew prefix

### 2. Homebrew Tap

Users need to tap the frontal-labs repository:

```bash
brew tap frontal-labs/cli
```

This adds our tap to their Homebrew configuration.

### 3. Installation

After tapping, users can install:

```bash
brew install frontal-cli
```

## Formula Updates

The formula is automatically updated when new releases are published via the `.github/workflows/update-homebrew.yml` workflow.

### Manual Updates

To manually update the formula for testing:

1. Update the version in `frontal-cli.rb`
2. Commit and push changes
3. Test with `brew install --build-from-source frontal-cli.rb`

## Testing

To test the formula locally:

```bash
# Install from local formula
brew install --build-from-source ./frontal-cli.rb

# Test installation
frontal --version

# Uninstall
brew uninstall frontal-cli
```

## Release Process

When a new release is published:

1. The release workflow creates a GitHub release
2. The update-homebrew workflow triggers
3. The formula is updated with the new version
4. Users can update with `brew upgrade frontal-cli`

## Troubleshooting

### Common Issues

1. **Bun not found**: Ensure Bun is installed or available in PATH
2. **Build failures**: Check that all dependencies are available
3. **Permission errors**: Ensure proper file permissions

### Debugging

Enable verbose output:

```bash
brew install --verbose --debug frontal-cli
```

## Formula Structure

The formula follows Homebrew best practices:

- Uses `stable` and `head` versions
- Includes proper dependencies
- Has test cases
- Follows naming conventions

## References

- [Homebrew Formula Cookbook](https://docs.brew.sh/Formula-Cookbook)
- [Homebrew API Documentation](https://rubydoc.brew.sh/Formula)
