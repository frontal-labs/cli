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
  PROJECT_NAME: /^[a-z0-9-]+$/,
  ENV_VAR_NAME: /^[A-Z_][A-Z0-9_]*$/,
  HEADER_NAME: /^[A-Za-z-]+$/,
  FUNCTION_PATH: /^[^*]+\*?[^/]*\.(js|ts)$/,
  EXPIRATION: /^\d+[dwmy]$/,
  REGEX: /.*/,
};

const DEFAULTS = {
  OUTPUT_DIRECTORY: "dist",
  INSTALL_COMMAND: "npm install",
  MAX_DURATION: 10,
  MEMORY: 512 as const,
  ENVIRONMENT_ENABLED: true,
  AUTO_ASSIGN_DOMAIN: false,
  EDGE_FUNCTIONS: false,
  IMAGE_OPTIMIZATION: true,
  ANALYTICS: false,
  REDIRECT_PERMANENT: false,
};

const CONSTRAINTS = {
  PROJECT_NAME_MIN_LENGTH: 1,
  PROJECT_NAME_MAX_LENGTH: 255,
  MAX_DURATION_MIN: 1,
  MAX_DURATION_MAX: 300,
};

export const SCHEMA_URL = "https://openapi.frontal.dev/frontal.json";

// Sub-schemas
export const environmentConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULTS.ENVIRONMENT_ENABLED),
  domain: z.string().optional(),
  autoDeployOn: z.array(z.string()).optional(),
  autoAssignDomain: z.boolean().default(DEFAULTS.AUTO_ASSIGN_DOMAIN),
  expiration: z.string().regex(REGEX_PATTERNS.EXPIRATION).optional(),
});

export const headerRuleSchema = z.object({
  source: z.string().regex(REGEX_PATTERNS.REGEX),
  headers: z.record(z.string().regex(REGEX_PATTERNS.HEADER_NAME), z.string()),
});

export const rewriteRuleSchema = z.object({
  source: z.string().regex(REGEX_PATTERNS.REGEX),
  destination: z.string(),
});

export const redirectRuleSchema = z.object({
  source: z.string().regex(REGEX_PATTERNS.REGEX),
  destination: z.string(),
  permanent: z.boolean().default(DEFAULTS.REDIRECT_PERMANENT),
});

export const functionConfigSchema = z.object({
  runtime: z.enum(RUNTIMES).optional(),
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
});

export const buildConfigSchema = z.object({
  command: z.string().optional(),
  outputDirectory: z.string().default(DEFAULTS.OUTPUT_DIRECTORY),
  installCommand: z.string().default(DEFAULTS.INSTALL_COMMAND),
  devCommand: z.string().optional(),
  env: z
    .record(z.string().regex(REGEX_PATTERNS.ENV_VAR_NAME), z.string())
    .optional(),
});

export const deploymentConfigSchema = z.object({
  preview: environmentConfigSchema.optional(),
  production: environmentConfigSchema.optional(),
  staging: environmentConfigSchema.optional(),
});

export const featuresConfigSchema = z.object({
  edgeFunctions: z.boolean().default(DEFAULTS.EDGE_FUNCTIONS),
  imageOptimization: z.boolean().default(DEFAULTS.IMAGE_OPTIMIZATION),
  analytics: z.boolean().default(DEFAULTS.ANALYTICS),
});

export const frontalConfigSchema = z.object({
  $schema: z.string().url().optional(),
  name: z
    .string()
    .min(CONSTRAINTS.PROJECT_NAME_MIN_LENGTH)
    .max(CONSTRAINTS.PROJECT_NAME_MAX_LENGTH)
    .regex(REGEX_PATTERNS.PROJECT_NAME),
  framework: z.enum(FRAMEWORKS).optional(),
  build: buildConfigSchema.optional(),
  deployment: deploymentConfigSchema.optional(),
  headers: z.array(headerRuleSchema).optional(),
  rewrites: z.array(rewriteRuleSchema).optional(),
  redirects: z.array(redirectRuleSchema).optional(),
  functions: z
    .record(
      z.string().regex(REGEX_PATTERNS.FUNCTION_PATH),
      functionConfigSchema
    )
    .optional(),
  regions: z.array(z.enum(REGIONS)).optional(),
  features: featuresConfigSchema.optional(),
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
