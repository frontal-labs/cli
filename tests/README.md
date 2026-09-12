# Tests

Vitest suites for the Frontal CLI. No test touches the network: commands run
in-process against the real `@frontal-labs/sdk` client with a mocked
transport from `@frontal-labs/testing`.

```
tests/
  helpers/cli.ts       runCli(), mockApi(), trapExit() — shared harness
  setup/               global console stubs + isolated FRONTAL_CONFIG_DIR
  lib/sdk.test.ts      credential precedence, env sanitizing, OAuth bridge
  errors/              error classification, exit codes, redaction
  commands/            one file per command family (auth, workflows, ...)
  unit/config/         ~/.frontal profile store
```

## Writing a command test

```ts
const mock = await mockApi([
  { method: "GET", path: "/workflows", body: mockPageResponse([...]) },
]);
const result = await runCli(["workflows", "list", "--json"]);

expect(result.exitCode).toBe(0);
mock.expectCalled("GET", "/workflows");
expect(lastJson(result.stdout)).toMatchObject({ ... });
```

- `mockApi(routes)` replaces `getSdk()` so the command uses `createMockFetch`.
  Every assertion is on a recorded request or on real CLI output.
- `runCli(args)` captures stdout/stderr lines and the exit code
  (`process.exit` is trapped).
- Error bodies follow the SDK contract: `{ code, message, requestId }`.
- Request bodies are recorded camelCased by the mock (the SDK sends
  snake_case on the wire).

Run with `bun run test` (or `bun run test:watch`).
