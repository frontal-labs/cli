#!/bin/bash

# Setup script for Homebrew tap
# This script helps create the initial Homebrew tap repository

set -e

TAP_NAME="frontal-labs/cli"
TAP_DIR="homebrew-$(basename $TAP_NAME)"
FORMULA_NAME="frontal-cli"

echo "Setting up Homebrew tap: $TAP_NAME"

# Create tap directory
mkdir -p $TAP_DIR
cd $TAP_DIR

# Initialize git repo
git init

# Create README
cat > README.md << 'EOF'
# Frontal Labs Homebrew Tap

This tap contains the Frontal CLI formula for installation via Homebrew.

## Installation

```bash
brew tap frontal-labs/cli
brew install frontal-cli
```

## Usage

After installation, you can use the Frontal CLI:

```bash
frontal --help
```

## Updating

To update to the latest version:

```bash
brew upgrade frontal-cli
```

## Uninstalling

To remove the CLI:

```bash
brew uninstall frontal-cli
brew untap frontal-labs/cli
```

## Formula

The formula is automatically updated when new releases are published to the frontal-labs/cli repository.
EOF

# Create formula directory
mkdir -p Formula

# Copy the formula from the CLI repo
cp ../frontal-cli.rb Formula/

# Stage and commit
git add .
git commit -m "Initial commit: Add frontal-cli formula"

echo "✅ Homebrew tap created in $TAP_DIR"
echo ""
echo "Next steps:"
echo "1. Create a new repository on GitHub: frontal-labs/homebrew-cli"
echo "2. Add it as remote: git remote add origin git@github.com:frontal-labs/homebrew-cli.git"
echo "3. Push: git push -u origin main"
echo ""
echo "Users can then install with:"
echo "brew tap frontal-labs/cli"
echo "brew install frontal-cli"
