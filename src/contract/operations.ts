import { OPENAPI_OPERATION_KEYS } from "../generated/openapi-operations.generated.js";

function normalizePath(path: string): string {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function toContractPath(cliPath: string): string {
  const normalized = normalizePath(cliPath);
  if (normalized.startsWith("/v1/")) {
    return normalized;
  }
  return normalizePath(`/v1${normalized}`);
}

export function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

export function assertOperationSupported(method: string, path: string): void {
  const key = operationKey(method, toContractPath(path));
  if (!OPENAPI_OPERATION_KEYS.has(key)) {
    throw new Error(
      `Command binding is not in public OpenAPI contract: ${key}`
    );
  }
}
