import { z } from "zod";
import { getProjectConfigSchema } from "@/lib/config.js";
import {
  isJsonRecord,
  type JsonRecord,
  jsonObject,
  setJsonField,
} from "@/lib/json.js";
import { ENV_NAMES, PROJECT_SCHEMA_URL, SERVICE_KEYS } from "@/lib/project.js";

/** A generated schema member that must exist; its absence is a generator bug. */
function objectMember(record: JsonRecord, key: string): JsonRecord {
  const value = jsonObject(record, key);
  if (value === undefined) {
    throw new Error(`Generated JSON Schema is missing "${key}".`);
  }
  return value;
}

const PROPERTY_DOCS: Record<string, string> = {
  $schema: "JSON Schema used by editors for validation and completions.",
  agents:
    "Agent ids owned by this project. `frontal rollback` reverts them to their previous version.",
  apiUrl:
    "Frontal API base URL. Environment variables and flags take precedence (FRONTAL_API_URL, --api-url).",
  build:
    "Legacy web-deploy setting (from frontal.json). Validated and typed; no command acts on it yet.",
  deployment:
    "Legacy web-deploy setting (from frontal.json). Validated and typed; no command acts on it yet.",
  entry:
    "Entry file bundled by `frontal deploy` (Bun.build, ESM). Defaults to src/index.ts.",
  env: `Default environment. Overridden per command with --env; selects the config.<env>.jsonc overlay. One of: ${ENV_NAMES.join(", ")}.`,
  features:
    "Legacy web-deploy setting (from frontal.json). Validated and typed; no command acts on it yet.",
  framework:
    "Legacy web-deploy setting (from frontal.json). Validated and typed; no command acts on it yet.",
  functions:
    "Legacy web-deploy setting (from frontal.json). Validated and typed; no command acts on it yet.",
  headers:
    "Legacy web-deploy setting (from frontal.json). Validated and typed; no command acts on it yet.",
  name: "Project name: lowercase letters, digits and dashes. Also the worker name used by `frontal deploy`.",
  redirects:
    "Legacy web-deploy setting (from frontal.json). Validated and typed; no command acts on it yet.",
  regions:
    "Legacy web-deploy setting (from frontal.json). Validated and typed; no command acts on it yet.",
  rewrites:
    "Legacy web-deploy setting (from frontal.json). Validated and typed; no command acts on it yet.",
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
  if (!isJsonRecord(node)) {
    return node;
  }
  const out: JsonRecord = {};
  for (const [key, value] of Object.entries(node)) {
    // Zod emits the JS integer ceiling for unbounded positive ints; drop it.
    if (key === "maximum" && value === MAX_SAFE_INTEGER_MARKER) {
      continue;
    }
    out[key] = tidy(value);
  }
  return out;
}

/**
 * JSON Schema (draft 2020-12) for `.frontal/config.jsonc`, derived from the same Zod
 * schema the CLI validates with, plus documentation and the service-key
 * enum that Zod expresses as a refinement.
 */
export async function buildFrontalJsonSchema(): Promise<JsonRecord> {
  const zodSchema = await getProjectConfigSchema();
  const generated = tidy(
    z.toJSONSchema(zodSchema, {
      io: "input",
      target: "draft-2020-12",
      unrepresentable: "any",
    })
  );
  if (!isJsonRecord(generated)) {
    throw new Error("Zod did not produce a JSON Schema object.");
  }

  const properties = objectMember(generated, "properties");
  for (const [key, doc] of Object.entries(PROPERTY_DOCS)) {
    const current = jsonObject(properties, key);
    if (current) {
      setJsonField(properties, key, { description: doc, ...current });
    }
  }

  const services = objectMember(properties, "services");
  setJsonField(services, "propertyNames", {
    enum: [...SERVICE_KEYS],
    type: "string",
  });
  const serviceEntry = objectMember(services, "additionalProperties");
  const serviceProps = objectMember(serviceEntry, "properties");
  const remote = jsonObject(serviceProps, "remote") ?? {};
  setJsonField(serviceProps, "remote", {
    description: "Proxy this service to the remote API during `frontal dev`.",
    ...remote,
  });

  const secrets = objectMember(properties, "secrets");
  const secretProps = objectMember(secrets, "properties");
  const required = jsonObject(secretProps, "required") ?? {};
  setJsonField(secretProps, "required", {
    description: "Environment variable names that must be set.",
    ...required,
  });

  const { $schema: draft, ...rest } = generated;
  return {
    $id: PROJECT_SCHEMA_URL,
    $schema: draft,
    description:
      "Schema for .frontal/config.jsonc (JSON with comments and trailing commas). Environment overlays use the same shape in .frontal/config.<env>.jsonc.",
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
