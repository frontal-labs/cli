import { type RenderMeta, renderHeader } from "@/lib/ontology/render/header.js";

/**
 * The file a project imports or includes so the compiler sees the generated
 * `FrontalOntologyRegistry` augmentation. `typesPath` is the path from this file
 * to `ontology.d.ts`, with forward slashes.
 */
export function renderTypesReference(
  typesPath: string,
  meta: RenderMeta
): string {
  return [
    renderHeader(meta),
    `/// <reference path="${typesPath}" />`,
    "export {};",
    "",
  ].join("\n");
}
