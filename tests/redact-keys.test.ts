import { describe, expect, it } from "vitest";
import { isSensitiveKey, redactRecord } from "../src/output/redact.js";

describe("isSensitiveKey", () => {
  it.each([
    "clientSecret",
    "sessionToken",
    "idToken",
    "webhookSecret",
    "accessToken",
    "FRONTAL_API_KEY",
    "api_key",
  ])("treats %s as sensitive", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(["email", "status", "companyId", "createdAt"])(
    "leaves %s alone",
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    }
  );
});

describe("redactRecord", () => {
  it("masks camelCase credentials in a record", () => {
    const out = redactRecord({ clientSecret: "s3cr3t", name: "acme" });
    expect(out).toEqual({ clientSecret: "[REDACTED]", name: "acme" });
  });
});

describe("redactRecord flags", () => {
  it("keeps a boolean presence flag under a sensitive-looking name", () => {
    expect(redactRecord({ apiKey: "frt_abc12345", hasApiKey: true })).toEqual({
      apiKey: "[REDACTED]",
      hasApiKey: true,
    });
  });
});
