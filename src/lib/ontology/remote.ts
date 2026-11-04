import { assertOperationSupported } from "@/contract/operations.js";
import { objectTypeListSchema } from "@/lib/ontology/backend.js";
import { OBJECT_TYPES_SDK_PATH } from "@/lib/ontology/constants.js";
import {
  isUnauthorizedError,
  malformedResponse,
  unauthorized,
} from "@/lib/ontology/errors.js";
import type { SdkHandle } from "@/lib/sdk.js";

/**
 * Reads every object type in one request. The list is unpaged and returns a
 * bare array of snake_case records (docs/backend-spec).
 *
 * The HTTP client's JSON helpers rename snake_case keys to camelCase at every
 * depth, which would also rename the ontology's own field names inside
 * `schema`. So the body is read from the raw response and parsed here.
 */
export async function fetchObjectTypes(handle: SdkHandle): Promise<unknown[]> {
  assertOperationSupported("GET", OBJECT_TYPES_SDK_PATH);
  const response = await handle.http
    .getRaw(OBJECT_TYPES_SDK_PATH)
    .catch((err: unknown) => {
      throw isUnauthorizedError(err) ? unauthorized(err) : err;
    });
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = objectTypeListSchema.safeParse(body);
  if (!parsed.success) {
    throw malformedResponse(
      "Frontal returned an object-type list that is not a JSON array."
    );
  }
  return parsed.data;
}
