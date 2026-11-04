/** The `code` of a Node system error (for example `ENOENT`), or `undefined`. */
export function systemErrorCode(err: unknown): string | undefined {
  return err instanceof Error && "code" in err && typeof err.code === "string"
    ? err.code
    : undefined;
}

/** The `requestId` an error carries, or `undefined`. */
export function errorRequestId(err: unknown): string | undefined {
  return typeof err === "object" &&
    err !== null &&
    "requestId" in err &&
    typeof err.requestId === "string"
    ? err.requestId
    : undefined;
}
