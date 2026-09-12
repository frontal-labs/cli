import { ProjectState } from "@/lib/state.js";

export type DeployTarget = "preview" | "prod";

/**
 * Record of a deployment made from this project, kept under
 * `.frontal/state/deploys/`. `frontal deploy` writes it; `env push`,
 * `promote` and `rollback` read it.
 */
export interface DeployRecord {
  /** Directory holding the bundled artifact that was deployed. */
  artifactDir: string;
  createdAt: string;
  entrypoint: string;
  env: string;
  id: string;
  /** Worker name on the platform. */
  name: string;
  requestId?: string;
  /** Content hash of the artifact. */
  sha: string;
  target: DeployTarget;
  url: string;
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
  return state.read<DeployRecord>("deploys", key);
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
    .map((id) => state.read<DeployRecord>("deploys", id))
    .filter((record): record is DeployRecord => record !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
