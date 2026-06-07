# Release Process

This document describes the release process for the Frontal CLI.

## Prerequisites

- Ensure all tests are passing: `bun run test`
- Ensure code is properly formatted: `bun run format`
- Ensure linting passes: `bun run lint`
- Update version in `package.json` if needed
- Update `CHANGELOG.md` with new changes
- Create changeset for the release: `bun run changeset`

## Release Steps

### 1. Prepare Release

```bash
# Ensure working directory is clean
git status

# Run full test suite
bun run test

# Check code quality
bun run lint
bun run type-check

# Build the CLI
bun run build
```

### 2. Version Management

The project uses [Changesets](https://github.com/changesets/changesets) for version management.

```bash
# Add a changeset for your changes
bun run changeset

# Version packages based on changesets
bun run version-packages

# This will:
# - Update package.json versions
# - Update CHANGELOG.md
# - Create a release commit
```

### 3. Publish Release

```bash
# Build and publish to npm
bun run release

# This will:
# - Build the project
# - Publish to npm registry
# - Create GitHub release
```

### 4. Tag and Push

```bash
# Push the release commit and tags
git push origin main --follow-tags
```

## Automated Release

The project also supports automated releases via GitHub Actions:

- When changesets are merged to `main`
- CI will automatically version and publish
- Releases are created automatically

## Version Format

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

## Release Channels

### Stable

- Published to npm as `frontal-cli`
- Tags: `latest`, version numbers (e.g., `1.0.0`)

### Development

- Available via `npm install frontal@next`
- Tags: `next`, pre-release versions

## Post-Release Tasks

### 1. Verification

```bash
# Test installation from npm
npm install -g frontal-cli

# Verify CLI works
frontal --version
frontal --help

# Test authentication
frontal auth status
```

### 2. Documentation

- Update API documentation if needed
- Update examples and tutorials
- Update website documentation

### 3. Communication

- Announce release in appropriate channels
- Update project status in README
- Notify stakeholders

## Rollback Process

If a critical issue is discovered:

### 1. Immediate Actions

```bash
# Deprecate the problematic version on npm
npm deprecate frontal-cli@1.0.0 "Critical security issue, please upgrade to 1.0.1"

# Communicate issue to users
# Create GitHub issue with details
# Post announcement in community channels
```

### 2. Fix Process

```bash
# Create hotfix branch from previous stable version
git checkout -b hotfix/critical-issue v0.9.0

# Fix the issue
# Add tests for the fix
# Update version to patch version (e.g., 1.0.1)

# Release patch version
bun run release
```

### 3. Verification

- Thoroughly test the fix
- Ensure no regression
- Verify installation and basic functionality

## Release Checklist

### Pre-Release

- [ ] All tests passing
- [ ] Code formatted and linted
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Changeset created
- [ ] Version bumped correctly
- [ ] Build successful
- [ ] Manual testing completed

### Release

- [ ] Package published to npm
- [ ] GitHub release created
- [ ] Tags pushed
- [ ] Release notes published

### Post-Release

- [ ] Installation verified
- [ ] Basic functionality tested
- [ ] Documentation links work
- [ ] Community notified
- [ ] Issues monitored for feedback

## Testing Before Release

### Manual Testing

```bash
# Test installation
npm install -g ./dist/frontal-cli-*.tgz

# Test basic commands
frontal --help
frontal --version

# Test authentication flow
frontal auth login
frontal auth status

# Test project operations
frontal projects list

# Test deployment (if possible)
frontal deploy --dry-run
```

### Integration Testing

- Test with different Node.js versions
- Test on different operating systems
- Test with various network configurations
- Test with different Frontal account types

## Release Notes Template

```markdown
## Version X.Y.Z

### 🚀 Features
- New feature 1
- New feature 2

### 🐛 Bug Fixes
- Fixed issue with command X
- Resolved authentication problem

### 💬 Breaking Changes
- Changed default behavior of Y
- Deprecated old command Z

### 📚 Documentation
- Updated README with new examples
- Added troubleshooting guide

### 🔧 Internal Changes
- Upgraded dependencies
- Improved test coverage
```

## Support

For questions about the release process:

- Create an issue in the repository
- Contact the maintainers
- Check existing documentation and issues
- Join our community discussions

## Security

If a security vulnerability is discovered:

1. Do not create a public issue
2. Email security@frontal.dev
3. Follow the security policy in SECURITY.md
4. Coordinate responsible disclosure

## Tools and Automation

### CI/CD Integration

The release process is integrated with GitHub Actions:

- Automated testing on pull requests
- Automated publishing on merge to main
- Automated release note generation

### Scripts

```bash
# Check if ready for release
bun run release:check

# Create release candidate
bun run release:candidate

# Publish release
bun run release:publish

# Rollback release
bun run release:rollback
```

---

This release process ensures consistent, high-quality releases for the Frontal CLI while maintaining security and reliability for our users.