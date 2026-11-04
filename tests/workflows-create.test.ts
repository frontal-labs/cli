import { describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli.js";

const INVALID_DEFINITION = /Invalid workflow definition/;

describe("workflows create", () => {
  it("rejects an invalid definition locally, before any request", async () => {
    const result = await runCli([
      "workflows",
      "create",
      "--body",
      '{"name":"nightly"}',
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.join("\n")).toMatch(INVALID_DEFINITION);
  });
});
