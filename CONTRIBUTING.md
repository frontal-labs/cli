# Contributing to Frontal CLI

Thank you for your interest in contributing to Frontal CLI! This guide will help you get started with contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)
- [Community Guidelines](#community-guidelines)

## Getting Started

### Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **Bun**: Version 1.3.8 or higher (recommended)
- **Git**: Latest stable version

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/cli.git
   cd cli
   ```

3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/frontal-labs/cli.git
   ```

## Development Setup

### Installation

1. Install dependencies:
   ```bash
   bun install
   ```

2. Build the project:
   ```bash
   bun run build
   ```

3. Run tests to verify setup:
   ```bash
   bun run test
   ```

### Development Workflow

1. Create a new branch for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the coding standards

3. Run tests and linting:
   ```bash
   bun run test
   bun run lint
   bun run type-check
   ```

4. Commit your changes:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Create a pull request

## Project Structure

```
frontal-cli/
├── bin/                    # Executable scripts
│   └── frontal.ts         # Main CLI entry point
├── src/                   # Source code
│   ├── commands/          # Command implementations
│   ├── config/           # Configuration management
│   ├── errors/           # Error handling
│   ├── http/             # HTTP client
│   ├── output/           # Output formatting
│   ├── utils/            # Utility functions
│   ├── index.ts          # Main entry point
│   └── version.ts        # Version information
├── tests/                # Test files
├── docs/                 # Documentation
├── .github/              # GitHub workflows and templates
├── package.json          # Package configuration
├── tsconfig.json         # TypeScript configuration
├── biome.jsonc          # Linting and formatting
└── bunfig.toml          # Bun configuration
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode in TypeScript
- Prefer explicit return types
- Use interfaces for object shapes

### Code Style

We use Biome for linting and formatting. Configuration is in `biome.jsonc`.

- 2 space indentation
- Double quotes for strings
- Semicolons required
- 80 character line width
- LF line endings

### Naming Conventions

- **Files**: kebab-case (e.g., `api-client.ts`)
- **Variables**: camelCase (e.g., `apiClient`)
- **Functions**: camelCase (e.g., `fetchData`)
- **Classes**: PascalCase (e.g., `ApiClient`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `API_BASE_URL`)
- **Interfaces**: PascalCase with `I` prefix (e.g., `IUser`)

### Command Structure

Each command should follow this structure:

```typescript
import type { Command } from "commander";
import { handleError } from "../errors/handler.js";

export function registerCommandName(program: Command): void {
  const command = program
    .command("command-name")
    .description("Command description")
    .option("--option <value>", "Option description")
    .action(async (opts, cmd) => {
      try {
        // Command implementation
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
```

### Error Handling

- Use the centralized error handler
- Create specific error types
- Provide helpful error messages
- Include context in errors

### Testing

- Write unit tests for all new functionality
- Use Vitest as the test runner
- Aim for high test coverage
- Mock external dependencies

## Testing

### Running Tests

```bash
# Run all tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage

# Run specific test file
bun run test path/to/test.test.ts
```

### Test Structure

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { functionToTest } from "../src/module.js";

describe("functionToTest", () => {
  beforeEach(() => {
    // Setup before each test
  });

  it("should do something", () => {
    const result = functionToTest();
    expect(result).toBe(expectedValue);
  });
});
```

### Integration Tests

Integration tests are in the `tests/integration/` directory and test the CLI end-to-end.

## Submitting Changes

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Examples:
```
feat: add support for new API endpoint
fix: resolve authentication timeout issue
docs: update installation guide
```

### Pull Request Process

1. Ensure your branch is up to date:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. Run all tests and ensure they pass
3. Update documentation if needed
4. Create a pull request with:
   - Clear title and description
   - Link to relevant issues
   - Screenshots for UI changes
   - Testing instructions

### Pull Request Template

Use the provided pull request template in `.github/pull_request_template.md`.

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create a release tag:
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

4. The GitHub Actions workflow will automatically:
   - Build the project
   - Run tests
   - Publish to NPM
   - Create GitHub release

## Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Assume good intentions

### Getting Help

- Check existing issues and documentation
- Ask questions in discussions
- Join our community channels
- Tag maintainers for urgent issues

### Reporting Issues

- Use the issue templates provided
- Provide detailed reproduction steps
- Include environment information
- Add relevant logs and screenshots

## Development Tips

### Debugging

- Use `--debug` flag for verbose logging
- Check logs in `~/.frontal/logs/`
- Use VS Code debugger with launch configuration

### Performance

- Profile commands that are slow
- Optimize API calls
- Use caching where appropriate
- Monitor bundle size

### Documentation

- Update docs for new features
- Include examples in docstrings
- Keep README up to date
- Document breaking changes

## Review Process

### Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Breaking changes are documented
- [ ] Security implications considered
- [ ] Performance impact assessed

### Reviewer Guidelines

- Provide constructive feedback
- Explain the reasoning behind suggestions
- Focus on the code, not the author
- Respond to comments in a timely manner

## Recognition

Contributors are recognized in:

- README.md contributors section
- Release notes
- Annual contributor highlights
- Community spotlights

Thank you for contributing to Frontal CLI! Your contributions help make the project better for everyone.
