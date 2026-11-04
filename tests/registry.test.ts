import { describe, expect, it } from "vitest";
import {
  fetchPublishedVersions,
  isVersionPublished,
} from "../src/lib/ontology/registry.js";

function fakeFetch(respond: () => Response | Promise<Response>): typeof fetch {
  return (async () => await respond()) as typeof fetch;
}

describe("fetchPublishedVersions", () => {
  it("lists the versions in the registry document", async () => {
    const versions = await fetchPublishedVersions(
      "@frontal-labs/sdk",
      fakeFetch(() =>
        Response.json({
          name: "@frontal-labs/sdk",
          versions: { "2.0.0": {}, "2.2.0": {} },
        })
      )
    );
    expect(versions).toEqual(["2.0.0", "2.2.0"]);
  });

  it("returns undefined when the registry answers with an error", async () => {
    const versions = await fetchPublishedVersions(
      "@frontal-labs/sdk",
      fakeFetch(() => new Response("nope", { status: 500 }))
    );
    expect(versions).toBeUndefined();
  });

  it("returns undefined when the document has no versions", async () => {
    const versions = await fetchPublishedVersions(
      "@frontal-labs/sdk",
      fakeFetch(() => Response.json({ name: "@frontal-labs/sdk" }))
    );
    expect(versions).toBeUndefined();
  });

  it("returns undefined when the request fails (offline)", async () => {
    const versions = await fetchPublishedVersions(
      "@frontal-labs/sdk",
      fakeFetch(() => {
        throw new TypeError("fetch failed");
      })
    );
    expect(versions).toBeUndefined();
  });
});

describe("isVersionPublished", () => {
  it("is true only for an exact listed version", () => {
    expect(isVersionPublished(["2.0.0", "2.2.0"], "2.2.0")).toBe(true);
    expect(isVersionPublished(["2.0.0"], "2.2.0")).toBe(false);
  });
});
