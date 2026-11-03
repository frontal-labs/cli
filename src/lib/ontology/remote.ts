import { assertOperationSupported } from "@/contract/operations.js";
import { OBJECT_TYPES_SDK_PATH } from "@/lib/ontology/constants.js";
import { collectPages } from "@/lib/ontology/paging.js";
import type { SdkHandle } from "@/lib/sdk.js";

/** Reads every object type from Frontal, across all pages. */
export async function fetchObjectTypes(handle: SdkHandle): Promise<unknown[]> {
  assertOperationSupported("GET", OBJECT_TYPES_SDK_PATH);
  const first = await handle.frontal.ontology.objects.listObjectTypes();
  return collectPages(first);
}
