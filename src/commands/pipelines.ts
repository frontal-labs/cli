import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { renderSSEStream } from "../output/stream.js";
import { readDefinitionFile } from "../utils/file.js";
import { confirmAction } from "../utils/interactive.js";

export function registerPipelinesCommands(program: Command): void {
  const pipelines = program
    .command("pipelines")
    .description("Manage data pipelines");

  pipelines
    .command("create")
    .description("Create a pipeline")
    .requiredOption("--name <n>", "Pipeline name")
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
          "/pipelines",
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("list")
    .description("List pipelines")
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
          "/pipelines",
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

  pipelines
    .command("get")
    .description("Get pipeline details")
    .argument("<id>", "Pipeline ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/pipelines/${id}`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("update")
    .description("Update a pipeline")
    .argument("<id>", "Pipeline ID")
    .option("--from-file <path>", "Load definition from file")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body = opts.fromFile ? readDefinitionFile(opts.fromFile) : {};
        const result = await api.put<Record<string, unknown>>(
          `/pipelines/${id}`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("delete")
    .description("Delete a pipeline")
    .argument("<id>", "Pipeline ID")
    .option("--force", "Skip confirmation")
    .action(async (id, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete pipeline ${id}?`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/pipelines/${id}`);
        fmt.success(`Pipeline ${id} deleted.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("trigger")
    .description("Trigger a pipeline execution")
    .argument("<id>", "Pipeline ID")
    .option("--input <json>", "Input payload as JSON")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body = opts.input ? JSON.parse(opts.input) : undefined;
        const result = await api.post<Record<string, unknown>>(
          `/pipelines/${id}/execute`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("runs")
    .description("List pipeline runs")
    .argument("<id>", "Pipeline ID")
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
          `/pipelines/${id}/runs`,
          params
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "status", header: "STATUS" },
          { key: "startedAt", header: "STARTED" },
          { key: "completedAt", header: "COMPLETED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("run")
    .description("Get pipeline run details")
    .argument("<pipe-id>", "Pipeline ID")
    .argument("<run-id>", "Run ID")
    .action(async (pipeId, runId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/pipelines/${pipeId}/runs/${runId}`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("watch")
    .description("Watch pipeline run events")
    .argument("<pipe-id>", "Pipeline ID")
    .argument("<run-id>", "Run ID")
    .action(async (pipeId, runId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const globalOpts = cmd.optsWithGlobals();
        const events = api.stream(`/pipelines/${pipeId}/runs/${runId}/events`);
        await renderSSEStream(events, {
          json: globalOpts.json as boolean,
          quiet: globalOpts.quiet as boolean,
        });
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("backfill")
    .description("Create a backfill")
    .argument("<id>", "Pipeline ID")
    .requiredOption("--from <date>", "Start date")
    .requiredOption("--to <date>", "End date")
    .option("--strategy <s>", "Backfill strategy")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {
          from: opts.from,
          to: opts.to,
        };
        if (opts.strategy) {
          body.strategy = opts.strategy;
        }
        const result = await api.post<Record<string, unknown>>(
          `/pipelines/${id}/backfills`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("backfills")
    .description("List pipeline backfills")
    .argument("<id>", "Pipeline ID")
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
          `/pipelines/${id}/backfills`,
          params
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "status", header: "STATUS" },
          { key: "from", header: "FROM" },
          { key: "to", header: "TO" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("health")
    .description("Get pipeline health status")
    .argument("<id>", "Pipeline ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/pipelines/${id}/health`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("lineage")
    .description("Get full data lineage")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get("/pipelines/lineage");
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("lineage:upstream")
    .description("Get upstream lineage")
    .argument("<type>", "Entity type")
    .argument("<id>", "Entity ID")
    .action(async (type, id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get(
          `/pipelines/lineage/upstream/${type}/${id}`
        );
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  pipelines
    .command("lineage:downstream")
    .description("Get downstream lineage")
    .argument("<type>", "Entity type")
    .argument("<id>", "Entity ID")
    .action(async (type, id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get(
          `/pipelines/lineage/downstream/${type}/${id}`
        );
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
