import { z } from "zod";

const profileSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  orgId: z.string().optional(),
  workspaceId: z.string().optional(),
  debug: z.boolean().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.number().optional(),
  authUrl: z.string().url().optional(),
});

export type ProfileConfig = z.infer<typeof profileSchema>;

const configSchema = z.object({
  activeProfile: z.string().default("default"),
  profiles: z.record(z.string(), profileSchema).default({}),
  defaults: z
    .object({
      outputFormat: z.enum(["table", "json", "yaml"]).default("table"),
      paginationLimit: z.number().int().positive().default(25),
    })
    .default({}),
});

export type FrontalConfig = z.infer<typeof configSchema>;

export { configSchema, profileSchema };
