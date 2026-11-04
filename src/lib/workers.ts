import { isJsonRecord, type JsonRecord, jsonField } from "@/lib/json.js";
import type { SdkHandle } from "@/lib/sdk.js";

export interface DeployWorkerInput {
  code: string;
  entrypoint: string;
  envVars: Record<string, string>;
  name: string;
}

export interface DeployedWorker {
  name: string;
  url?: string;
  version?: number;
  [key: string]: unknown;
}

/**
 * Deploys a worker through the SDK's HTTP client.
 *
 * `workers.deploy()` in @frontal-labs/sdk 1.0.4 runs the request body through
 * the camelCase→snake_case transform, which also rewrites the *keys inside*
 * `env_vars` (`LOG_LEVEL` becomes `log_level`). `postRaw` sends the body
 * verbatim, so variable names reach the platform intact.
 */
export async function deployWorker(
  handle: SdkHandle,
  input: DeployWorkerInput
): Promise<DeployedWorker> {
  const response = await handle.http.postRaw("/workers", {
    code: input.code,
    entrypoint: input.entrypoint,
    env_vars: input.envVars,
    name: input.name,
  });
  const requestId = response.headers.get("x-request-id");
  if (requestId) {
    handle.lastRequestId = requestId;
  }
  const text = await response.text();
  const raw: unknown = text.length > 0 ? JSON.parse(text) : {};
  const parsed: JsonRecord = isJsonRecord(raw) ? raw : {};
  return { ...parsed, name: String(jsonField(parsed, "name") ?? input.name) };
}
