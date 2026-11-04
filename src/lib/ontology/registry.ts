/** The npm registry document for a package, as far as this module reads it. */
const NPM_REGISTRY = "https://registry.npmjs.org";

/** Versions of `pkg` that the registry lists, or `undefined` when it cannot be read. */
export async function fetchPublishedVersions(
  pkg: string,
  fetchFn: typeof fetch = fetch
): Promise<readonly string[] | undefined> {
  try {
    const res = await fetchFn(`${NPM_REGISTRY}/${encodeURIComponent(pkg)}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return;
    }
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null || !("versions" in body)) {
      return;
    }
    const { versions } = body;
    if (typeof versions !== "object" || versions === null) {
      return;
    }
    return Object.keys(versions);
  } catch {
    // Offline or blocked: an unknown registry state is no information, not a
    // failure.
    return undefined;
  }
}

/** True when `version` appears in the list of published versions. */
export function isVersionPublished(
  versions: readonly string[],
  version: string
): boolean {
  return versions.includes(version);
}
