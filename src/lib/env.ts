import { z } from "zod";

/**
 * Environment variables the CLI reads. `process.env` is an index signature, so
 * reads go through this schema, which gives every name a checked type.
 */
const cliEnvSchema = z.object({
  CI: z.string().optional(),
  FRONTAL_API_KEY: z.string().optional(),
  FRONTAL_API_URL: z.string().optional(),
  FRONTAL_AUTH_URL: z.string().optional(),
  FRONTAL_CLI_VERSION: z.string().optional(),
  FRONTAL_CONFIG_DIR: z.string().optional(),
  FRONTAL_DEBUG: z.string().optional(),
  FRONTAL_ENV: z.string().optional(),
  FRONTAL_ORG_ID: z.string().optional(),
  FRONTAL_PROFILE: z.string().optional(),
  FRONTAL_WORKSPACE_ID: z.string().optional(),
  NO_COLOR: z.string().optional(),
});

export type CliEnv = z.infer<typeof cliEnvSchema>;

/**
 * Reads the CLI's environment at call time, so changes to `process.env`
 * (including in tests) are seen by every caller.
 */
export function readCliEnv(source: NodeJS.ProcessEnv = process.env): CliEnv {
  return cliEnvSchema.parse(source);
}
