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

export function readCurrentDeploy(
  root: string,
  env: string
): DeployRecord | undefined {
  const state = new ProjectState(root);
  return state.read<DeployRecord>("deploys", `${CURRENT_PREFIX}${env}`);
}

export function writeCurrentDeploy(root: string, record: DeployRecord): void {
  const state = new ProjectState(root);
  state.write("deploys", record.id, record);
  state.write("deploys", `${CURRENT_PREFIX}${record.env}`, record);
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
