import { z } from "zod";
import { ProjectState } from "@/lib/state.js";

const deployTargetSchema = z.enum(["preview", "prod"]);
export type DeployTarget = z.infer<typeof deployTargetSchema>;

/**
 * Record of a deployment made from this project, kept under
 * `.frontal/state/deploys/`. `frontal deploy` writes it; `env push`,
 * `promote` and `rollback` read it.
 */
const deployRecordSchema = z
  .object({
    /** Directory holding the bundled artifact that was deployed. */
    artifactDir: z.string(),
    createdAt: z.string(),
    entrypoint: z.string(),
    env: z.string(),
    id: z.string(),
    /** Worker name on the platform. */
    name: z.string(),
    requestId: z.string().optional(),
    /** Content hash of the artifact. */
    sha: z.string(),
    target: deployTargetSchema,
    url: z.string(),
  })
  .loose();

export type DeployRecord = z.infer<typeof deployRecordSchema>;

function parseDeployRecord(value: unknown): DeployRecord | undefined {
  const parsed = deployRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

const CURRENT_PREFIX = "current-";

/**
 * Latest deployment for an environment; with `target`, the latest of that
 * kind (`preview` or `prod`).
 */
export function readCurrentDeploy(
  root: string,
  env: string,
  target?: DeployTarget
): DeployRecord | undefined {
  const state = new ProjectState(root);
  const key = target
    ? `${CURRENT_PREFIX}${env}-${target}`
    : `${CURRENT_PREFIX}${env}`;
  return state.readAs("deploys", key, parseDeployRecord);
}

export function writeCurrentDeploy(root: string, record: DeployRecord): void {
  const state = new ProjectState(root);
  state.write("deploys", record.id, record);
  state.write("deploys", `${CURRENT_PREFIX}${record.env}`, record);
  state.write(
    "deploys",
    `${CURRENT_PREFIX}${record.env}-${record.target}`,
    record
  );
}

export function findDeploy(
  root: string,
  ref: string
): DeployRecord | undefined {
  return listDeploys(root).find(
    (record) => record.url === ref || record.id === ref || record.name === ref
  );
}

export function listDeploys(root: string): DeployRecord[] {
  const state = new ProjectState(root);
  return state
    .ids("deploys")
    .filter((id) => !id.startsWith(CURRENT_PREFIX))
    .map((id) => state.readAs("deploys", id, parseDeployRecord))
    .filter((record): record is DeployRecord => record !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
