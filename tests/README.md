# Frontal CLI Test Suite

This directory contains comprehensive tests for the Frontal CLI application, organized by type and purpose.

## Test Structure

```
tests/
├── setup/              # Test setup and configuration
│   ├── global.ts       # Global test setup
│   ├── after-env.ts    # Environment cleanup
│   └── database.ts     # Database mocking utilities
├── fixtures/           # Test data and fixtures
│   ├── auth-data.ts    # Authentication test data
│   ├── org-data.ts     # Organization test data
│   ├── deployment-data.ts # Deployment test data
│   └── api-responses.ts # API response fixtures
├── utils/              # Test utilities and helpers
│   ├── test-helpers.ts # General test helpers
│   ├── assertions.ts   # Custom assertions
│   └── mocks.ts        # Mocking utilities
├── unit/               # Unit tests
│   ├── config/         # Configuration module tests
│   ├── http/           # HTTP client tests
│   ├── commands/       # Command tests
│   └── utils/          # Utility function tests
├── integration/        # Integration tests
│   ├── auth-workflow.test.ts
│   └── deployment-workflow.test.ts
├── e2e/               # End-to-end tests
│   └── cli-workflows.test.ts
├── performance/       # Performance tests
│   └── api-client.test.ts
├── mocks/             # Mock implementations
│   ├── api-client.mock.ts
│   ├── config.mock.ts
│   └── commands.mock.ts
└── snapshots/         # Output snapshots
    └── cli-output.snapshot.ts
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test tests/unit
```

### Integration Tests Only
```bash
npm run test tests/integration
```

### E2E Tests Only
```bash
npm run test tests/e2e
```

### Performance Tests Only
```bash
npm run test tests/performance
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Categories

### Unit Tests
- Test individual modules and functions in isolation
- Mock external dependencies
- Fast execution and focused testing
- Located in `tests/unit/`

### Integration Tests
- Test interactions between multiple modules
- Use real implementations with mocked external services
- Test complete workflows and use cases
- Located in `tests/integration/`

### E2E Tests
- Test the complete CLI application
- Use real binaries and processes
- Test user workflows from command line perspective
- Located in `tests/e2e/`

### Performance Tests
- Test performance characteristics
- Measure response times and resource usage
- Test under load and stress conditions
- Located in `tests/performance/`

## Test Utilities

### Mock Helpers
- `mockFetchGlobal()` - Mock global fetch API
- `mockFileSystem()` - Mock file system operations
- `mockPrompts()` - Mock CLI prompts
- `mockProcess()` - Mock process operations

### Test Helpers
- `createMockFetch()` - Create mock fetch responses
- `createMockStream()` - Create mock streaming responses
- `captureStdout()` - Capture stdout output
- `captureStderr()` - Capture stderr output

### Assertions
- `assertValidDate()` - Assert valid date format
- `assertValidUuid()` - Assert valid UUID format
- `assertValidEmail()` - Assert valid email format
- `assertPaginatedResponse()` - Assert paginated API response

## Fixtures

### Authentication Data
- User profiles and authentication tokens
- API keys and credentials
- Login/logout response data

### Organization Data
- Organizations and workspaces
- Teams and roles
- Permissions and policies

### Deployment Data
- Deployments and containers
- Functions and services
- Metrics and logs

### API Responses
- Success and error responses
- Paginated responses
- Streaming responses

## Mock Implementations

### API Client Mock
- Mock HTTP methods (GET, POST, PUT, DELETE)
- Mock streaming and file operations
- Mock error scenarios

### Configuration Mock
- Mock config file operations
- Mock profile management
- Mock configuration validation

### Command Mock
- Mock CLI commands and options
- Mock prompt interactions
- Mock output formatting

## Best Practices

### Writing Tests
1. **Use descriptive test names** - Test names should clearly describe what is being tested
2. **Follow AAA pattern** - Arrange, Act, Assert
3. **Mock external dependencies** - Use mocks for external services
4. **Test edge cases** - Test error conditions and boundary cases
5. **Keep tests focused** - Each test should focus on one specific behavior

### Test Data
1. **Use fixtures** - Store test data in fixture files
2. **Avoid magic strings** - Use constants for test values
3. **Keep data realistic** - Use realistic test data
4. **Clean up after tests** - Ensure tests don't leave side effects

### Mock Usage
1. **Mock at the right level** - Mock external dependencies, not implementation details
2. **Use consistent mocks** - Use the same mock setup across related tests
3. **Verify mock calls** - Assert that mocks were called correctly
4. **Clean up mocks** - Restore mocks after each test

## Coverage Requirements

- **Statement coverage**: > 90%
- **Branch coverage**: > 85%
- **Function coverage**: > 90%
- **Line coverage**: > 90%

## Continuous Integration

Tests run automatically on:
- Pull requests
- Main branch commits
- Release branches

Coverage reports are generated and uploaded to maintain quality standards.

## Troubleshooting

### Common Issues

1. **Mock not working**: Ensure mocks are set up before importing the module
2. **Test timeout**: Increase timeout or fix async issues
3. **Flaky tests**: Check for race conditions or timing issues
4. **Coverage low**: Add tests for uncovered code paths

### Debug Tips

1. **Use console.log** - Add debug output in tests
2. **Check mock calls** - Verify mocks are called as expected
3. **Run single test** - Isolate failing tests
4. **Check dependencies** - Ensure test dependencies are properly mocked

## Contributing

When adding new features:
1. Write unit tests for new functions
2. Add integration tests for new workflows
3. Update fixtures and mocks as needed
4. Ensure coverage requirements are met
5. Update this documentation if needed

## Test Configuration

The test suite is configured in `vitest.config.ts`:
- Test environment: Node.js
- Global setup files: `tests/setup/global.ts`, `tests/setup/after-env.ts`
- Coverage provider: v8
- Path aliases: `@/` points to `src/`
