import { CONTRACT_VERSION, SDK_RANGE } from "@/lib/ontology/constants.js";
import { sortKeysDeep } from "@/lib/ontology/hash.js";
import type { NormalizedOntology } from "@/lib/ontology/model.js";
import type { RenderMeta } from "@/lib/ontology/render/header.js";

/**
 * Renders `version.json`: hashes, versions and the contract/SDK range.
 * JSON has no comments, so this file carries the header values as fields.
 * There are no timestamps, so the file only changes when the ontology does.
 */
export function renderVersionJson(
  model: NormalizedOntology,
  meta: RenderMeta
): string {
  const entities: Record<string, number | null> = {};
  for (const entity of model.entities) {
    entities[entity.name] = entity.version;
  }
  const body = {
    contractVersion: CONTRACT_VERSION,
    entities,
    generatorVersion: meta.generatorVersion,
    schemaHash: meta.schemaHash,
    sdkRange: SDK_RANGE,
  };
  return `${JSON.stringify(sortKeysDeep(body), null, 2)}\n`;
}
