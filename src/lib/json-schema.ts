import { z } from "zod";
import { getProjectConfigSchema } from "@/lib/config.js";
import {
  ENV_NAMES,
  PROJECT_CONFIG_FILE,
  PROJECT_SCHEMA_URL,
  SERVICE_KEYS,
} from "@/lib/project.js";

type JsonObject = Record<string, unknown>;

const PROPERTY_DOCS: Record<string, string> = {
  $schema: "JSON Schema used by editors for validation and completions.",
  agents:
    "Agent ids owned by this project. `frontal rollback` reverts them to their previous version.",
  apiUrl:
    "Frontal API base URL. Environment variables and flags take precedence (FRONTAL_API_URL, --api-url).",
  entry:
    "Entry file bundled by `frontal deploy` (Bun.build, ESM). Defaults to src/index.ts.",
  env: `Default environment. Overridden per command with --env; selects the frontal.<env>.jsonc overlay. One of: ${ENV_NAMES.join(", ")}.`,
  name: "Project name: lowercase letters, digits and dashes. Also the worker name used by `frontal deploy`.",
  sdk: "Optional overrides forwarded to the @frontal-labs/sdk client.",
  secrets:
    "Secrets that must be present in the environment. Only the names live here; values are read from .env.local or the shell.",
  services: `Services this project uses, keyed by name. Valid keys: ${SERVICE_KEYS.join(", ")}. \`remote: true\` proxies the service to the real API during \`frontal dev\`.`,
  vars: "Non-secret configuration written to .env.local by `frontal env pull` and shipped with deployments. Keys are UPPER_SNAKE_CASE.",
};

const MAX_SAFE_INTEGER_MARKER = Number.MAX_SAFE_INTEGER;

function tidy(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(tidy);
  }
  if (typeof node !== "object" || node === null) {
    return node;
  }
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node as JsonObject)) {
    // Zod emits the JS integer ceiling for unbounded positive ints; drop it.
    if (key === "maximum" && value === MAX_SAFE_INTEGER_MARKER) {
      continue;
    }
    out[key] = tidy(value);
  }
  return out;
}

/**
 * JSON Schema (draft 2020-12) for `frontal.jsonc`, derived from the same Zod
 * schema the CLI validates with, plus documentation and the service-key
 * enum that Zod expresses as a refinement.
 */
export async function buildFrontalJsonSchema(): Promise<JsonObject> {
  const zodSchema = await getProjectConfigSchema();
  const generated = tidy(
    z.toJSONSchema(zodSchema, {
      io: "input",
      target: "draft-2020-12",
      unrepresentable: "any",
    })
  ) as JsonObject;

  const properties = generated.properties as Record<string, JsonObject>;
  for (const [key, doc] of Object.entries(PROPERTY_DOCS)) {
    if (properties[key]) {
      properties[key] = { description: doc, ...properties[key] };
    }
  }

  const services = properties.services as JsonObject;
  services.propertyNames = { enum: [...SERVICE_KEYS], type: "string" };
  const serviceEntry = services.additionalProperties as JsonObject;
  const serviceProps = serviceEntry.properties as Record<string, JsonObject>;
  const { remote } = serviceProps;
  serviceProps.remote = {
    description: "Proxy this service to the remote API during `frontal dev`.",
    ...remote,
  };

  const secrets = properties.secrets as JsonObject;
  const secretProps = secrets.properties as Record<string, JsonObject>;
  const { required } = secretProps;
  secretProps.required = {
    description: "Environment variable names that must be set.",
    ...required,
  };

  const { $schema: draft, ...rest } = generated;
  return {
    $id: PROJECT_SCHEMA_URL,
    $schema: draft,
    description: `Schema for ${PROJECT_CONFIG_FILE} (JSON with comments and trailing commas). Environment overlays use the same shape in frontal.<env>.jsonc.`,
    title: "Frontal project configuration",
    ...rest,
    examples: [
      {
        $schema: PROJECT_SCHEMA_URL,
        apiUrl: "https://api.frontal.dev/v1",
        env: "dev",
        name: "my-app",
        secrets: { required: ["FRONTAL_API_KEY"] },
        services: {
          agents: { remote: false },
          ai: { remote: false },
          graph: { remote: false },
        },
        vars: {},
      },
    ],
  };
}
