import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { renderSSEStream } from "../output/stream.js";
import { confirmAction } from "../utils/interactive.js";

export function registerFunctionsCommands(program: Command): void {
  const functions = program
    .command("functions")
    .description("Manage serverless functions");

  functions
    .command("deploy")
    .description("Deploy a serverless function")
    .requiredOption("--name <n>", "Function name")
    .requiredOption("--runtime <r>", "Runtime (e.g., node18, python3.11)")
    .requiredOption("--handler <h>", "Handler entry point")
    .requiredOption("--source <path>", "Source path")
    .option("--memory <mb>", "Memory in MB")
    .option("--timeout <ms>", "Timeout in ms")
    .option(
      "--env <K=V...>",
      "Environment variables",
      (val: string, acc: string[]) => {
        acc.push(val);
        return acc;
      },
      [] as string[]
    )
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {
          name: opts.name,
          runtime: opts.runtime,
          handler: opts.handler,
          source: opts.source,
        };
        if (opts.memory) {
          body.memory = Number(opts.memory);
        }
        if (opts.timeout) {
          body.timeout = Number(opts.timeout);
        }
        if (opts.env && opts.env.length > 0) {
          const env: Record<string, string> = {};
          for (const entry of opts.env) {
            const [k, ...v] = entry.split("=");
            env[k] = v.join("=");
          }
          body.env = env;
        }
        const result = await api.post<Record<string, unknown>>(
          "/functions",
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  functions
    .command("list")
    .description("List all functions")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/functions"
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "runtime", header: "RUNTIME" },
          { key: "status", header: "STATUS" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  functions
    .command("get")
    .description("Get function details")
    .argument("<id>", "Function ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/functions/${id}`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  functions
    .command("delete")
    .description("Delete a function")
    .argument("<id>", "Function ID")
    .option("--force", "Skip confirmation")
    .action(async (id, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete function ${id}?`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/functions/${id}`);
        fmt.success(`Function ${id} deleted.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  functions
    .command("invoke")
    .description("Invoke a function")
    .argument("<id>", "Function ID")
    .option("--payload <json>", "JSON payload")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body = opts.payload ? JSON.parse(opts.payload) : undefined;
        const result = await api.post(`/functions/${id}/invoke`, body);
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  functions
    .command("invoke:stream")
    .description("Invoke a function with streaming output")
    .argument("<id>", "Function ID")
    .option("--payload <json>", "JSON payload")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const body = opts.payload ? JSON.parse(opts.payload) : undefined;
        const globalOpts = cmd.optsWithGlobals();
        const events = api.postStream(`/functions/${id}/invoke`, body);
        await renderSSEStream(events, {
          json: globalOpts.json as boolean,
          quiet: globalOpts.quiet as boolean,
        });
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  functions
    .command("stats")
    .description("Get function metrics")
    .argument("<id>", "Function ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/functions/${id}/metrics`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
