import { z } from "zod";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import {
  ENV_NAMES,
  findProjectRoot,
  type LoadProjectOptions,
  loadRawProjectConfig,
  PROJECT_CONFIG_FILE,
  PROJECT_SCHEMA_URL,
  SERVICE_KEYS,
} from "@/lib/project.js";
import { getCoreModule } from "@/lib/sdk.js";

export type {
  EnvName,
  LoadProjectOptions,
  ServiceKey,
} from "@/lib/project.js";

const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const SERVICE_KEY_SET: ReadonlySet<string> = new Set(SERVICE_KEYS);

export const serviceConfigSchema = z
  .object({
    /** Proxy this service to the remote API during `frontal dev`. */
    remote: z.boolean().default(false),
  })
  .strict();

const servicesSchema = z
  .record(z.string(), serviceConfigSchema)
  .superRefine((services, ctx) => {
    for (const key of Object.keys(services)) {
      if (!SERVICE_KEY_SET.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `Unknown service "${key}". Valid services: ${SERVICE_KEYS.join(", ")}.`,
        });
      }
    }
  });

type ClientConfigSchema =
  typeof import("@frontal-labs/core").clientConfigSchema;

/**
 * Builds the `frontal.jsonc` schema. Connection rules (`apiUrl`, `sdk.*`)
 * are reused from the SDK's own `clientConfigSchema` so the CLI never forks
 * them. The SDK module is loaded lazily (see `getCoreModule`).
 */
export function buildProjectConfigSchema(
  clientConfigSchema: ClientConfigSchema
) {
  return z
    .object({
      $schema: z.string().optional(),
      name: z
        .string()
        .min(1)
        .regex(
          PROJECT_NAME_PATTERN,
          "name must be lowercase letters, digits and dashes"
        ),
      env: z.enum(ENV_NAMES).default("dev"),
      apiUrl: clientConfigSchema.shape.baseUrl,
      services: servicesSchema.default({}),
      vars: z
        .record(
          z
            .string()
            .regex(
              ENV_VAR_NAME_PATTERN,
              "vars keys must be UPPER_SNAKE_CASE environment variable names"
            ),
          z.string()
        )
        .default({}),
      secrets: z
        .object({
          required: z
            .array(z.string().regex(ENV_VAR_NAME_PATTERN))
            .default(["FRONTAL_API_KEY"]),
        })
        .strict()
        .default({ required: ["FRONTAL_API_KEY"] }),
      sdk: clientConfigSchema
        .pick({
          timeout: true,
          maxRetries: true,
          retryDelay: true,
          headers: true,
        })
        .partial()
        .strict()
        .optional(),
    })
    .strict();
}

export type ProjectConfigSchema = ReturnType<typeof buildProjectConfigSchema>;
export type ProjectConfig = z.output<ProjectConfigSchema>;
export type ProjectConfigInput = z.input<ProjectConfigSchema>;

let schemaPromise: Promise<ProjectConfigSchema> | undefined;

export function getProjectConfigSchema(): Promise<ProjectConfigSchema> {
  schemaPromise ??= getCoreModule().then((core) =>
    buildProjectConfigSchema(core.clientConfigSchema)
  );
  return schemaPromise;
}

export interface LoadedProject {
  config: ProjectConfig;
  /** Config files that were merged, in order. */
  files: string[];
  root: string;
}

export function formatConfigIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("\n");
}

/** Validates a raw config object, converting Zod issues into a CliError. */
export async function validateProjectConfig(
  raw: unknown,
  source = PROJECT_CONFIG_FILE
): Promise<ProjectConfig> {
  const schema = await getProjectConfigSchema();
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  const unknownService = result.error.issues.find((issue) =>
    issue.message.startsWith("Unknown service")
  );
  throw new CliError(
    "CONFIG_INVALID",
    `Invalid ${source}:\n${formatConfigIssues(result.error)}`,
    {
      fix: unknownService
        ? `Remove or rename the service. Valid services: ${SERVICE_KEYS.join(", ")}.`
        : `Fix the listed fields; see ${PROJECT_SCHEMA_URL} for the full schema.`,
      exitCode: EXIT_CODES.CONFIG_ERROR,
      cause: result.error,
    }
  );
}

/**
 * Loads `frontal.jsonc` (plus `frontal.<env>.jsonc` when `env` is given)
 * from the nearest project root and validates the merged result.
 */
export async function loadProjectConfig(
  options: LoadProjectOptions = {}
): Promise<LoadedProject> {
  const { root, files, raw } = loadRawProjectConfig(options);
  const config = await validateProjectConfig(raw, files.join(" + "));
  return { root, files, config };
}

/** Like `loadProjectConfig` but resolves undefined when not inside a project. */
export async function tryLoadProjectConfig(
  options: LoadProjectOptions = {}
): Promise<LoadedProject | undefined> {
  if (!findProjectRoot(options.cwd)) {
    return;
  }
  return await loadProjectConfig(options);
}

export function checkRequiredSecrets(
  config: ProjectConfig,
  env: Record<string, string | undefined>
): { missing: string[] } {
  const missing = config.secrets.required.filter((key) => !env[key]);
  return { missing };
}
