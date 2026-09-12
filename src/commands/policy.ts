import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import type { Command } from "commander";
import { CliError } from "@/errors/cli-error.js";
import { EXIT_CODES } from "@/errors/exit-codes.js";
import { type CommandContext, runAction } from "@/lib/command.js";
import { loadProjectConfig, type ProjectConfig } from "@/lib/config.js";
import { withExamples } from "@/lib/output.js";
import { PROJECT_STATE_DIR } from "@/lib/project.js";
import type { SdkHandle } from "@/lib/sdk.js";
import { theme } from "@/output/theme.js";

type Obj = Record<string, unknown>;

export type RuleResult = "pass" | "warn" | "deny";

export interface RuleReport {
  fix?: string;
  passed: boolean;
  reason?: string;
  resource?: string;
  result: RuleResult;
  ruleId: string;
}

export interface PolicyCheckReport {
  /** Mirrors the SDK's `PolicyEvaluationResult` shape. */
  passed: boolean;
  policyId: string;
  ruleResults: RuleReport[];
  strict: boolean;
  summary: { deny: number; pass: number; warn: number };
  userId: string;
}

export interface PolicyCheckOptions {
  env?: string;
  role?: string[];
  strict?: boolean;
  user?: string;
}

const POLICY_FORMATS: Record<string, "rego" | "json_schema" | "cel"> = {
  ".cel": "cel",
  ".json": "json_schema",
  ".rego": "rego",
};
const MIN_COMPLIANCE_SCORE = 70;
const CHECKED_ACTION = "deploy";

function policyFiles(root: string): string[] {
  const dir = join(root, PROJECT_STATE_DIR, "policies");
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => POLICY_FORMATS[extname(name)] !== undefined)
    .sort()
    .map((name) => join(dir, name));
}

interface Identity {
  roleNames: string[];
  userId: string;
}

function pickString(source: Obj, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
}

function pickRoles(profile: Obj): string[] {
  const candidates = [profile.roleNames, profile.roles, profile.role];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((role) =>
          typeof role === "string"
            ? role
            : String((role as Obj).name ?? (role as Obj).id ?? "")
        )
        .filter(Boolean);
    }
    if (typeof candidate === "string" && candidate.length > 0) {
      return [candidate];
    }
  }
  return [];
}

/** Resolves who the checks run as: flags first, then the account profile. */
export async function resolveIdentity(
  handle: SdkHandle,
  options: PolicyCheckOptions
): Promise<Identity> {
  let userId = options.user;
  let roleNames = options.role ?? [];
  if (!userId || roleNames.length === 0) {
    const profile = await handle.frontal.auth.account.getProfile();
    userId ??= pickString(profile, ["id", "userId", "user_id", "sub", "email"]);
    if (roleNames.length === 0) {
      roleNames = pickRoles(profile);
    }
  }
  if (!userId) {
    throw new CliError(
      "NO_IDENTITY",
      "Could not determine the user to evaluate policies for.",
      {
        exitCode: EXIT_CODES.AUTH_ERROR,
        fix: "Pass --user <id> (and --role <name>) or sign in with `frontal auth login`.",
      }
    );
  }
  if (roleNames.length === 0) {
    roleNames = ["member"];
  }
  return { roleNames, userId };
}

async function validatePolicyFiles(
  handle: SdkHandle,
  root: string
): Promise<RuleReport[]> {
  const reports: RuleReport[] = [];
  for (const file of policyFiles(root)) {
    const rel = relative(root, file);
    const format = POLICY_FORMATS[extname(file)] as
      | "rego"
      | "json_schema"
      | "cel";
    const text = readFileSync(file, "utf-8");
    let definition: unknown = text;
    if (format === "json_schema") {
      try {
        definition = JSON.parse(text);
      } catch (err) {
        reports.push({
          fix: `Fix the JSON syntax in ${rel}.`,
          passed: false,
          reason: `not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
          resource: rel,
          result: "deny",
          ruleId: `policy-file:${rel}`,
        });
        continue;
      }
    }
    // biome-ignore lint/performance/noAwaitInLoops: ordered output, rate-limited API
    const result = await handle.frontal.governance.policies.validate({
      definition,
      definitionFormat: format,
    });
    const errors = (result.errors ?? []).map((e) =>
      typeof e === "string"
        ? e
        : String((e as Obj).message ?? JSON.stringify(e))
    );
    reports.push({
      fix: result.valid
        ? undefined
        : `Fix the policy definition in ${rel} (format: ${format}).`,
      passed: Boolean(result.valid),
      reason: result.valid
        ? `valid ${format} policy`
        : errors.join("; ") || "invalid policy",
      resource: rel,
      result: result.valid ? "pass" : "deny",
      ruleId: `policy-file:${rel}`,
    });
  }
  return reports;
}

async function checkAccess(
  handle: SdkHandle,
  config: ProjectConfig,
  identity: Identity
): Promise<RuleReport[]> {
  const reports: RuleReport[] = [];
  for (const service of Object.keys(config.services).sort()) {
    // biome-ignore lint/performance/noAwaitInLoops: ordered output, rate-limited API
    const result = await handle.frontal.governance.access.check({
      action: CHECKED_ACTION,
      resourceType: service,
      roleNames: identity.roleNames,
      userId: identity.userId,
    });
    reports.push({
      fix: result.allowed
        ? undefined
        : `Ask an admin to grant "${CHECKED_ACTION}" on ${service} to ${identity.roleNames.join(", ")}, or adjust the denying policy.`,
      passed: Boolean(result.allowed),
      reason: result.allowed
        ? `${identity.roleNames.join(", ")} may ${CHECKED_ACTION} ${service}`
        : (result.reason ?? `${CHECKED_ACTION} on ${service} denied`),
      resource: service,
      result: result.allowed ? "pass" : "deny",
      ruleId: `access:${CHECKED_ACTION}:${service}`,
    });
  }
  return reports;
}

async function checkActivePolicies(handle: SdkHandle): Promise<RuleReport> {
  const page = await handle.frontal.governance.policies.list({
    status: "active",
  });
  const count = page.data.length;
  return {
    fix:
      count > 0
        ? undefined
        : "Create a policy with `frontal governance` in the dashboard or from a template.",
    passed: count > 0,
    reason:
      count > 0
        ? `${count} active polic${count === 1 ? "y" : "ies"}`
        : "no active policies in this workspace",
    result: count > 0 ? "pass" : "warn",
    ruleId: "policies:active",
  };
}

async function checkCompliance(handle: SdkHandle): Promise<RuleReport> {
  const result = await handle.frontal.governance.compliance.score();
  const score = Number(result.score ?? result.value ?? Number.NaN);
  if (Number.isNaN(score)) {
    return {
      fix: "Run a compliance assessment for this workspace.",
      passed: false,
      reason: "compliance score unavailable",
      result: "warn",
      ruleId: "compliance:score",
    };
  }
  const ok = score >= MIN_COMPLIANCE_SCORE;
  return {
    fix: ok
      ? undefined
      : `Resolve open violations to reach at least ${MIN_COMPLIANCE_SCORE}/100.`,
    passed: ok,
    reason: `compliance score ${score}/100`,
    result: ok ? "pass" : "warn",
    ruleId: "compliance:score",
  };
}

/**
 * Dry-run governance evaluation for the project: validates local policy
 * files, checks that the current identity may deploy each enabled service,
 * and reports the workspace's active policies and compliance score.
 */
export async function runPolicyCheck(
  ctx: CommandContext,
  options: PolicyCheckOptions
): Promise<PolicyCheckReport> {
  const { config, root } = await loadProjectConfig({ env: options.env });
  const handle = await ctx.sdk();
  const identity = await resolveIdentity(handle, options);

  const rules: RuleReport[] = [
    ...(await validatePolicyFiles(handle, root)),
    await checkActivePolicies(handle),
    ...(await checkAccess(handle, config, identity)),
    await checkCompliance(handle),
  ];

  const strict = Boolean(options.strict);
  const effective = rules.map((rule) =>
    strict && rule.result === "warn"
      ? {
          ...rule,
          passed: false,
          reason: `${rule.reason} (warning treated as error by --strict)`,
          result: "deny" as const,
        }
      : rule
  );
  const summary = {
    deny: effective.filter((r) => r.result === "deny").length,
    pass: effective.filter((r) => r.result === "pass").length,
    warn: effective.filter((r) => r.result === "warn").length,
  };
  return {
    passed: summary.deny === 0,
    policyId: `project:${config.name}:${config.env}`,
    ruleResults: effective,
    strict,
    summary,
    userId: identity.userId,
  };
}

const MARK: Record<RuleResult, string> = {
  deny: theme.error("✗"),
  pass: theme.success("✓"),
  warn: theme.warn("!"),
};

export function printPolicyReport(report: PolicyCheckReport): void {
  for (const rule of report.ruleResults) {
    const line = `${MARK[rule.result]} ${rule.ruleId}${rule.reason ? theme.dim(` — ${rule.reason}`) : ""}`;
    console.log(line);
    if (rule.fix && rule.result !== "pass") {
      console.log(theme.dim(`    fix: ${rule.fix}`));
    }
  }
  const { pass, warn, deny } = report.summary;
  console.log("");
  console.log(
    report.passed
      ? theme.success(
          `policy check passed (${pass} ok, ${warn} warning${warn === 1 ? "" : "s"})`
        )
      : theme.error(
          `policy check failed (${deny} denied, ${warn} warning${warn === 1 ? "" : "s"}, ${pass} ok)`
        )
  );
}

export function registerPolicyCommands(program: Command): void {
  const policy = program
    .command("policy")
    .description("Governance checks for this project");

  withExamples(
    policy
      .command("check")
      .description(
        "Dry-run governance evaluation: policy files, deploy access per service, compliance"
      )
      .option("--strict", "Treat warnings as errors")
      .option("--user <id>", "Evaluate as this user id (default: your account)")
      .option(
        "--role <name>",
        "Role to evaluate with (repeatable)",
        (value: string, previous: string[] = []) => [...previous, value]
      )
      .action((opts: PolicyCheckOptions, cmd) =>
        runAction(cmd, async (ctx) => {
          const report = await runPolicyCheck(ctx, {
            ...opts,
            env: ctx.globalOpts.env,
          });
          if (ctx.globalOpts.json) {
            ctx.fmt.raw(report);
          } else {
            printPolicyReport(report);
          }
          if (!report.passed) {
            process.exit(EXIT_CODES.GENERAL_ERROR);
          }
        })
      ),
    [
      "frontal policy check",
      "frontal policy check --strict --env prod",
      "frontal policy check --user usr_123 --role admin --json",
    ]
  );
}
