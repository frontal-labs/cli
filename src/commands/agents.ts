import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { renderSSEStream } from "../output/stream.js";
import { readDefinitionFile } from "../utils/file.js";
import { confirmAction } from "../utils/interactive.js";

export function registerAgentsCommands(program: Command): void {
  const agents = program.command("agents").description("Manage AI agents");

  agents
    .command("create")
    .description("Create an agent")
    .requiredOption("--name <n>", "Agent name")
    .option("--from-file <path>", "Load config from file")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = opts.fromFile
          ? { name: opts.name, ...readDefinitionFile(opts.fromFile) }
          : { name: opts.name };
        const result = await api.post<Record<string, unknown>>("/agents", body);
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("list")
    .description("List agents")
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
          "/agents",
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

  agents
    .command("get")
    .description("Get agent details")
    .argument("<id>", "Agent ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(`/agents/${id}`);
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("update")
    .description("Update an agent")
    .argument("<id>", "Agent ID")
    .option("--from-file <path>", "Load config from file")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body = opts.fromFile ? readDefinitionFile(opts.fromFile) : {};
        const result = await api.put<Record<string, unknown>>(
          `/agents/${id}`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("delete")
    .description("Delete an agent")
    .argument("<id>", "Agent ID")
    .option("--force", "Skip confirmation")
    .action(async (id, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete agent ${id}?`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/agents/${id}`);
        fmt.success(`Agent ${id} deleted.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("deploy")
    .description("Deploy an agent")
    .argument("<id>", "Agent ID")
    .option("--environment <env>", "Target environment")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {};
        if (opts.environment) {
          body.environment = opts.environment;
        }
        const result = await api.post<Record<string, unknown>>(
          `/agents/${id}/deploy`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("pause")
    .description("Pause an agent")
    .argument("<id>", "Agent ID")
    .option("--reason <r>", "Reason for pausing")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {};
        if (opts.reason) {
          body.reason = opts.reason;
        }
        await api.post(`/agents/${id}/suspend`, body);
        fmt.success(`Agent ${id} paused.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("resume")
    .description("Resume an agent")
    .argument("<id>", "Agent ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.post(`/agents/${id}/resume`);
        fmt.success(`Agent ${id} resumed.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("rollback")
    .description("Rollback an agent")
    .argument("<id>", "Agent ID")
    .option("--to-version <n>", "Target version")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {};
        if (opts.toVersion) {
          body.toVersion = Number(opts.toVersion);
        }
        const result = await api.post<Record<string, unknown>>(
          `/agents/${id}/rollback`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("simulate")
    .description("Simulate an agent event")
    .argument("<id>", "Agent ID")
    .requiredOption("--event <e>", "Event type")
    .requiredOption("--payload <json>", "Event payload JSON")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          `/agents/${id}/simulate`,
          { event: opts.event, payload: JSON.parse(opts.payload) }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("executions")
    .description("List agent executions")
    .argument("<id>", "Agent ID")
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
          `/agents/${id}/executions`,
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

  agents
    .command("execution")
    .description("Get execution details")
    .argument("<agent-id>", "Agent ID")
    .argument("<exec-id>", "Execution ID")
    .action(async (agentId, execId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/agents/${agentId}/executions/${execId}`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("watch")
    .description("Watch execution events in real-time")
    .argument("<agent-id>", "Agent ID")
    .argument("<exec-id>", "Execution ID")
    .action(async (agentId, execId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const globalOpts = cmd.optsWithGlobals();
        const events = api.stream(
          `/agents/${agentId}/executions/${execId}/events`
        );
        await renderSSEStream(events, {
          json: globalOpts.json as boolean,
          quiet: globalOpts.quiet as boolean,
        });
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("message")
    .description("Send a message to an agent")
    .argument("<id>", "Agent ID")
    .requiredOption("--event <e>", "Event type")
    .requiredOption("--payload <json>", "Message payload JSON")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          `/agents/${id}/message`,
          { event: opts.event, payload: JSON.parse(opts.payload) }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("metrics")
    .description("Get agent metrics")
    .argument("<id>", "Agent ID")
    .option("--period <p>", "Time period")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const params: Record<string, string> = {};
        if (opts.period) {
          params.period = opts.period;
        }
        const result = await api.get<Record<string, unknown>>(
          `/agents/${id}/metrics`,
          params
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("escalations")
    .description("List escalations")
    .option("--agent <id>", "Filter by agent ID")
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
        const path = opts.agent
          ? `/agents/${opts.agent}/escalations`
          : "/agents/escalations";
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          path,
          params
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "type", header: "TYPE" },
          { key: "status", header: "STATUS" },
          { key: "urgency", header: "URGENCY" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("escalation:resolve")
    .description("Resolve an escalation")
    .argument("<esc-id>", "Escalation ID")
    .requiredOption("--decision <d>", "Resolution decision")
    .option("--reasoning <t>", "Reasoning text")
    .action(async (escId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = { decision: opts.decision };
        if (opts.reasoning) {
          body.reasoning = opts.reasoning;
        }
        const result = await api.put<Record<string, unknown>>(
          `/agents/escalations/${escId}`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("experiment:create")
    .description("Create an experiment")
    .argument("<agent-id>", "Agent ID")
    .requiredOption("--name <n>", "Experiment name")
    .requiredOption("--variants <json>", "Variants JSON")
    .action(async (agentId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          `/agents/${agentId}/experiments`,
          { name: opts.name, variants: JSON.parse(opts.variants) }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("experiment:get")
    .description("Get experiment details")
    .argument("<agent-id>", "Agent ID")
    .argument("<exp-id>", "Experiment ID")
    .action(async (agentId, expId, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/agents/${agentId}/experiments/${expId}`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  agents
    .command("experiment:conclude")
    .description("Conclude an experiment")
    .argument("<agent-id>", "Agent ID")
    .argument("<exp-id>", "Experiment ID")
    .requiredOption("--winner <v>", "Winning variant")
    .option("--promote", "Promote winner")
    .action(async (agentId, expId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = { winner: opts.winner };
        if (opts.promote) {
          body.promote = true;
        }
        const result = await api.post<Record<string, unknown>>(
          `/agents/${agentId}/experiments/${expId}/start`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
