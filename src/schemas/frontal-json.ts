import { z } from "zod";

// Constants (ported from openapi service)
export const FRAMEWORKS = [
  "nextjs",
  "react",
  "vue",
  "svelte",
  "angular",
  "nuxt",
  "gatsby",
  "vite",
  "custom",
] as const;

export const REGIONS = [
  "us-east-1",
  "us-west-2",
  "eu-west-1",
  "eu-central-1",
  "ap-southeast-1",
] as const;

export const RUNTIMES = ["nodejs18.x", "nodejs20.x", "edge"] as const;

export const MEMORY_SIZES = [128, 256, 512, 1024, 2048] as const;

const REGEX_PATTERNS = {
  ENV_VAR_NAME: /^[A-Z_][A-Z0-9_]*$/,
  EXPIRATION: /^\d+[dwmy]$/,
  FUNCTION_PATH: /^[^*]+\*?[^/]*\.(js|ts)$/,
  HEADER_NAME: /^[A-Za-z-]+$/,
  PROJECT_NAME: /^[a-z0-9-]+$/,
  REGEX: /.*/,
};

const DEFAULTS = {
  ANALYTICS: false,
  AUTO_ASSIGN_DOMAIN: false,
  EDGE_FUNCTIONS: false,
  ENVIRONMENT_ENABLED: true,
  IMAGE_OPTIMIZATION: true,
  INSTALL_COMMAND: "npm install",
  MAX_DURATION: 10,
  MEMORY: 512 as const,
  OUTPUT_DIRECTORY: "dist",
  REDIRECT_PERMANENT: false,
};

const CONSTRAINTS = {
  MAX_DURATION_MAX: 300,
  MAX_DURATION_MIN: 1,
  PROJECT_NAME_MAX_LENGTH: 255,
  PROJECT_NAME_MIN_LENGTH: 1,
};

export const SCHEMA_URL = "https://openapi.frontal.dev/frontal.json";

// Sub-schemas
export const environmentConfigSchema = z.object({
  autoAssignDomain: z.boolean().default(DEFAULTS.AUTO_ASSIGN_DOMAIN),
  autoDeployOn: z.array(z.string()).optional(),
  domain: z.string().optional(),
  enabled: z.boolean().default(DEFAULTS.ENVIRONMENT_ENABLED),
  expiration: z.string().regex(REGEX_PATTERNS.EXPIRATION).optional(),
});

export const headerRuleSchema = z.object({
  headers: z.record(z.string().regex(REGEX_PATTERNS.HEADER_NAME), z.string()),
  source: z.string().regex(REGEX_PATTERNS.REGEX),
});

export const rewriteRuleSchema = z.object({
  destination: z.string(),
  source: z.string().regex(REGEX_PATTERNS.REGEX),
});

export const redirectRuleSchema = z.object({
  destination: z.string(),
  permanent: z.boolean().default(DEFAULTS.REDIRECT_PERMANENT),
  source: z.string().regex(REGEX_PATTERNS.REGEX),
});

export const functionConfigSchema = z.object({
  maxDuration: z
    .number()
    .int()
    .min(CONSTRAINTS.MAX_DURATION_MIN)
    .max(CONSTRAINTS.MAX_DURATION_MAX)
    .default(DEFAULTS.MAX_DURATION),
  memory: z
    .enum(MEMORY_SIZES.map(String) as [string, ...string[]])
    .transform(Number)
    .default(DEFAULTS.MEMORY),
  runtime: z.enum(RUNTIMES).optional(),
});

export const buildConfigSchema = z.object({
  command: z.string().optional(),
  devCommand: z.string().optional(),
  env: z
    .record(z.string().regex(REGEX_PATTERNS.ENV_VAR_NAME), z.string())
    .optional(),
  installCommand: z.string().default(DEFAULTS.INSTALL_COMMAND),
  outputDirectory: z.string().default(DEFAULTS.OUTPUT_DIRECTORY),
});

export const deploymentConfigSchema = z.object({
  preview: environmentConfigSchema.optional(),
  production: environmentConfigSchema.optional(),
  staging: environmentConfigSchema.optional(),
});

export const featuresConfigSchema = z.object({
  analytics: z.boolean().default(DEFAULTS.ANALYTICS),
  edgeFunctions: z.boolean().default(DEFAULTS.EDGE_FUNCTIONS),
  imageOptimization: z.boolean().default(DEFAULTS.IMAGE_OPTIMIZATION),
});

export const frontalConfigSchema = z.object({
  $schema: z.string().url().optional(),
  build: buildConfigSchema.optional(),
  deployment: deploymentConfigSchema.optional(),
  features: featuresConfigSchema.optional(),
  framework: z.enum(FRAMEWORKS).optional(),
  functions: z
    .record(
      z.string().regex(REGEX_PATTERNS.FUNCTION_PATH),
      functionConfigSchema
    )
    .optional(),
  headers: z.array(headerRuleSchema).optional(),
  name: z
    .string()
    .min(CONSTRAINTS.PROJECT_NAME_MIN_LENGTH)
    .max(CONSTRAINTS.PROJECT_NAME_MAX_LENGTH)
    .regex(REGEX_PATTERNS.PROJECT_NAME),
  redirects: z.array(redirectRuleSchema).optional(),
  regions: z.array(z.enum(REGIONS)).optional(),
  rewrites: z.array(rewriteRuleSchema).optional(),
});

// Exported types
export type FrontalProjectConfig = z.infer<typeof frontalConfigSchema>;
export type Framework = (typeof FRAMEWORKS)[number];
export type Region = (typeof REGIONS)[number];
export type Runtime = (typeof RUNTIMES)[number];
export type EnvironmentConfig = z.infer<typeof environmentConfigSchema>;
export type BuildConfig = z.infer<typeof buildConfigSchema>;
export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;
export type FeaturesConfig = z.infer<typeof featuresConfigSchema>;
