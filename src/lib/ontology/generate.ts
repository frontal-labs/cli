import type { OntologyFileKey } from "@/lib/ontology/constants.js";
import type { NormalizedOntology } from "@/lib/ontology/model.js";
import { renderClientModule } from "@/lib/ontology/render/client.js";
import type { RenderMeta } from "@/lib/ontology/render/header.js";
import { renderOntologyTypes } from "@/lib/ontology/render/types.js";
import { renderVersionJson } from "@/lib/ontology/render/version.js";

/** Files produced from the normalized model. `document` is rendered from the raw input. */
export type GeneratedKey = Exclude<OntologyFileKey, "document">;

/**
 * Renders every generated file that derives from the model. Pure: the same
 * model and meta always produce the same bytes.
 */
export function generateFiles(
  model: NormalizedOntology,
  meta: RenderMeta
): Record<GeneratedKey, string> {
  return {
    client: renderClientModule(model, meta),
    types: renderOntologyTypes(model, meta),
    version: renderVersionJson(model, meta),
  };
}
