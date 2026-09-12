import { describe, expect, it } from "vitest";
import { createSdkHandle } from "@/lib/sdk.js";

/**
 * Live smoke against a real Frontal environment. Skipped unless
 * FRONTAL_LIVE=1 and TEST_API_KEY (or FRONTAL_API_KEY) are set:
 *
 *   FRONTAL_LIVE=1 TEST_API_KEY=frt_... TEST_API_URL=https://api.staging.frontal.dev/v1 bun run test tests/live
 */
const apiKey = process.env.TEST_API_KEY ?? process.env.FRONTAL_API_KEY;
const baseUrl =
  process.env.TEST_API_URL ??
  process.env.FRONTAL_API_URL ??
  "https://api.frontal.dev/v1";
const live = process.env.FRONTAL_LIVE === "1" && Boolean(apiKey);

describe.skipIf(!live)(
  "live: staging API",
  () => {
    const sdk = () =>
      createSdkHandle({
        credential: { kind: "api-key", apiKey: apiKey as string },
        baseUrl,
        maxRetries: 1,
        timeout: 20_000,
      });

    it("authenticates and returns the account profile", async () => {
      const handle = await sdk();
      const profile = await handle.frontal.auth.account.getProfile();
      expect(profile).toBeTypeOf("object");
      expect(handle.lastRequestId ?? "").not.toBe("");
    });

    it("queries logs for the last hour", async () => {
      const handle = await sdk();
      const page = await handle.frontal.observability.logs.query({
        query: "*",
        timeFrom: new Date(Date.now() - 3_600_000).toISOString(),
        timeTo: new Date().toISOString(),
        limit: 5,
      });
      expect(Array.isArray(page.data)).toBe(true);
    });

    it("lists active policies and reads the compliance score", async () => {
      const handle = await sdk();
      const policies = await handle.frontal.governance.policies.list({
        status: "active",
      });
      expect(Array.isArray(policies.data)).toBe(true);
      const score = await handle.frontal.governance.compliance.score();
      expect(score).toBeTypeOf("object");
    });
  },
  60_000
);
