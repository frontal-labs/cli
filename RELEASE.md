# Release Process

This document describes the release process for the Frontal CLI.

## Prerequisites

- npm Trusted Publisher configured (see Automated Release section below)
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

The project uses two GitHub Actions workflows for automated releases:

- **`release.yml`**: Runs on every push to `main`. Uses Changesets to version packages and create git tags. When pending changesets exist, it opens a "Release Packages" PR. When merged, it bumps versions and pushes a `v*` tag.
- **`publish.yml`**: Triggers on `v*` tag pushes. Builds the project and publishes to both registries using OIDC, then creates the GitHub Release.

### Trusted Publisher Setup

Before the first release, configure the npm Trusted Publisher:

1. Go to https://www.npmjs.com/package/frontal-cli/settings/trusted-publishers
2. Add publisher: GitHub Actions
   - Owner: `frontal-labs`, Repo: `cli`, Workflow: `publish.yml`
3. Optionally: Settings → Publishing access → "Require two-factor authentication and disallow tokens"

## Version Format

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

## Release Channels

### npm Registry (npmjs.org)

- Published as `frontal-cli`
- Tags: `latest`, version numbers (e.g., `1.0.0`)
- Auth: OIDC Trusted Publisher (no automation tokens)

### GitHub Packages

- Published as `@frontal-labs/cli`
- Install: `npm install -g @frontal-labs/cli --registry=https://npm.pkg.github.com`
- Auth: GITHUB_TOKEN (auto-provisioned per workflow run)

### Development

- Available via `npm install frontal-cli@next`
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

- [ ] Package published to npm (OIDC)
- [ ] Package published to GitHub Packages
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

The release process uses two workflows:

- **`release.yml`** (push to `main`): Changesets versioning and git tag creation
- **`publish.yml`** (tag `v*`): Builds, publishes to npm (OIDC) + GitHub Packages, creates GitHub Release

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