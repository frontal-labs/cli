import { GENERATED_BANNER } from "@/lib/ontology/constants.js";

/** Values every generated file records, so a file can be traced to its inputs. */
export interface RenderMeta {
  generatorVersion: string;
  schemaHash: string;
}

/**
 * The header every generated TypeScript file starts with. JSON files cannot
 * hold comments, so they carry the same two values as fields instead.
 */
export function renderHeader(meta: RenderMeta): string {
  return [
    `// ${GENERATED_BANNER}`,
    `// Ontology hash: ${meta.schemaHash}`,
    `// Generator version: ${meta.generatorVersion}`,
  ].join("\n");
}
