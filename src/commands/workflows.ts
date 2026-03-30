import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { renderSSEStream } from "../output/stream.js";
import { readDefinitionFile } from "../utils/file.js";
import { confirmAction } from "../utils/interactive.js";

export function registerWorkflowsCommands(program: Command): void {
  const workflows = program
    .command("workflows")
    .description("Manage workflows");

  workflows
    .command("create")
    .description("Create a workflow")
    .requiredOption("--name <n>", "Workflow name")
    .option("--from-file <path>", "Load definition from file")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = opts.fromFile
          ? { name: opts.name, ...readDefinitionFile(opts.fromFile) }
          : { name: opts.name };
        const result = await api.post<Record<string, unknown>>(
          "/workflows",
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("list")
    .description("List workflows")
    .option("--status <s>", "Filter by status")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const params: Record<string, string> = {};
        if (opts.status) {
          params.status = opts.status;
        }
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/workflows",
          params
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "status", header: "STATUS" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("get")
    .description("Get workflow details")
    .argument("<id>", "Workflow ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/workflows/${id}`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("update")
    .description("Update a workflow")
    .argument("<id>", "Workflow ID")
    .option("--from-file <path>", "Load definition from file")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body = opts.fromFile ? readDefinitionFile(opts.fromFile) : {};
        const result = await api.put<Record<string, unknown>>(
          `/workflows/${id}`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("delete")
    .description("Delete a workflow")
    .argument("<id>", "Workflow ID")
    .option("--force", "Skip confirmation")
    .action(async (id, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete workflow ${id}?`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/workflows/${id}`);
        fmt.success(`Workflow ${id} deleted.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("activate")
    .description("Activate a workflow")
    .argument("<id>", "Workflow ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.put(`/workflows/${id}`, { status: "active" });
        fmt.success(`Workflow ${id} activated.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("pause")
    .description("Pause a workflow")
    .argument("<id>", "Workflow ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.put(`/workflows/${id}`, { status: "paused" });
        fmt.success(`Workflow ${id} paused.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("trigger")
    .description("Trigger a workflow execution")
    .argument("<id>", "Workflow ID")
    .option("--input <json>", "Input payload as JSON")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body = opts.input ? JSON.parse(opts.input) : undefined;
        const result = await api.post<Record<string, unknown>>(
          `/workflows/${id}/execute`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("executions")
    .description("List workflow executions")
    .argument("<id>", "Workflow ID")
    .option("--status <s>", "Filter by status")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const params: Record<string, string> = {};
        if (opts.status) {
          params.status = opts.status;
        }
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/workflows/${id}/executions`,
          params
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "status", header: "STATUS" },
          { key: "startedAt", header: "STARTED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("execution")
    .description("Get execution details")
    .argument("<wf-id>", "Workflow ID")
    .argument("<exec-id>", "Execution ID")
    .action(async (wfId, execId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/workflows/${wfId}/executions/${execId}`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("watch")
    .description("Watch execution events in real-time")
    .argument("<wf-id>", "Workflow ID")
    .argument("<exec-id>", "Execution ID")
    .action(async (wfId, execId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const globalOpts = cmd.optsWithGlobals();
        const events = api.stream(
          `/workflows/${wfId}/executions/${execId}/events`
        );
        await renderSSEStream(events, {
          json: globalOpts.json as boolean,
          quiet: globalOpts.quiet as boolean,
        });
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("approvals")
    .description("List workflow approvals")
    .option("--status <s>", "Filter by status")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const params: Record<string, string> = {};
        if (opts.status) {
          params.status = opts.status;
        }
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/workflows/approvals",
          params
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "workflowId", header: "WORKFLOW" },
          { key: "status", header: "STATUS" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("approval:approve")
    .description("Approve a workflow approval")
    .argument("<id>", "Approval ID")
    .option("--comment <text>", "Approval comment")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {};
        if (opts.comment) {
          body.comment = opts.comment;
        }
        const result = await api.post<Record<string, unknown>>(
          `/workflows/approvals/${id}/approve`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("approval:reject")
    .description("Reject a workflow approval")
    .argument("<id>", "Approval ID")
    .option("--comment <text>", "Rejection comment")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {};
        if (opts.comment) {
          body.comment = opts.comment;
        }
        const result = await api.post<Record<string, unknown>>(
          `/workflows/approvals/${id}/reject`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("steps")
    .description("List workflow steps")
    .argument("<id>", "Workflow ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/workflows/${id}/steps`
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "type", header: "TYPE" },
          { key: "status", header: "STATUS" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("templates")
    .description("List workflow templates")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/workflows/templates"
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "description", header: "DESCRIPTION" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  workflows
    .command("template:use")
    .description("Instantiate a workflow from a template")
    .argument("<tid>", "Template ID")
    .requiredOption("--name <name>", "Workflow name")
    .action(async (tid, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          `/workflows/templates/${tid}/instantiate`,
          { name: opts.name }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
