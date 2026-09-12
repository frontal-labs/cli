import { z } from "zod";

const profileSchema = z.object({
  accessToken: z.string().optional(),
  apiKey: z.string().optional(),
  authUrl: z.string().url().optional(),
  baseUrl: z.string().url().optional(),
  debug: z.boolean().optional(),
  orgId: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.number().optional(),
  workspaceId: z.string().optional(),
});

export type ProfileConfig = z.infer<typeof profileSchema>;

const configSchema = z.object({
  activeProfile: z.string().default("default"),
  defaults: z
    .object({
      outputFormat: z.enum(["table", "json", "yaml"]).default("table"),
      paginationLimit: z.number().int().positive().default(25),
    })
    .default({ outputFormat: "table", paginationLimit: 25 }),
  profiles: z.record(z.string(), profileSchema).default({}),
  schemaVersion: z.number().int().positive().default(2),
  telemetry: z
    .object({
      enabled: z.boolean().default(false),
    })
    .default({ enabled: false }),
});

export type FrontalConfig = z.infer<typeof configSchema>;

export { configSchema, profileSchema };
