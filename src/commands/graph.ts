import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { readDefinitionFile } from "../utils/file.js";
import { confirmAction } from "../utils/interactive.js";

export function registerGraphCommands(program: Command): void {
  const graph = program
    .command("graph")
    .description("Knowledge graph operations");

  graph
    .command("entity:create")
    .description("Create a graph entity")
    .argument("<type>", "Entity type")
    .requiredOption("--fields <json>", "Entity fields as JSON")
    .action(async (type, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const fields = JSON.parse(opts.fields);
        const result = await api.post<Record<string, unknown>>(
          `/graph/entities/${type}`,
          fields
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("entity:get")
    .description("Get a graph entity")
    .argument("<type>", "Entity type")
    .argument("<id>", "Entity ID")
    .action(async (type, id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/graph/entities/${type}/${id}`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("entity:update")
    .description("Update a graph entity")
    .argument("<type>", "Entity type")
    .argument("<id>", "Entity ID")
    .requiredOption("--fields <json>", "Updated fields as JSON")
    .action(async (type, id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const fields = JSON.parse(opts.fields);
        const result = await api.put<Record<string, unknown>>(
          `/graph/entities/${type}/${id}`,
          fields
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("entity:delete")
    .description("Delete a graph entity")
    .argument("<type>", "Entity type")
    .argument("<id>", "Entity ID")
    .option("--force", "Skip confirmation")
    .action(async (type, id, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete ${type}/${id}?`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/graph/entities/${type}/${id}`);
        fmt.success(`Entity ${type}/${id} deleted.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("entity:list")
    .description("List entities by type")
    .argument("<type>", "Entity type")
    .option("--limit <n>", "Maximum results")
    .action(async (type, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const params: Record<string, string> = {};
        if (opts.limit) {
          params.limit = opts.limit;
        }
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/graph/entities/${type}`,
          params
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "type", header: "TYPE" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("query")
    .description("Query the knowledge graph")
    .requiredOption("--entity-type <t>", "Entity type to query")
    .option("--where <json>", "Filter conditions as JSON")
    .option("--include <rels>", "Relationships to include")
    .option("--order-by <f>", "Order by field")
    .option("--limit <n>", "Maximum results")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {
          entityType: opts.entityType,
        };
        if (opts.where) {
          body.where = JSON.parse(opts.where);
        }
        if (opts.include) {
          body.include = opts.include.split(",");
        }
        if (opts.orderBy) {
          body.orderBy = opts.orderBy;
        }
        if (opts.limit) {
          body.limit = Number(opts.limit);
        }
        const result = await api.post("/graph/query", body);
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("nl-query")
    .description("Natural language query")
    .argument("<question>", "Natural language question")
    .option("--entity-type <t>", "Hint entity type")
    .action(async (question, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = { question };
        if (opts.entityType) {
          body.entityType = opts.entityType;
        }
        const result = await api.post("/graph/nl-query", body);
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("search")
    .description("Semantic search the graph")
    .argument("<query>", "Search query")
    .option("--entity-type <t>", "Filter by entity type")
    .option("--limit <n>", "Maximum results")
    .option("--min-score <f>", "Minimum score threshold")
    .action(async (query, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = { query };
        if (opts.entityType) {
          body.entityType = opts.entityType;
        }
        if (opts.limit) {
          body.limit = Number(opts.limit);
        }
        if (opts.minScore) {
          body.minScore = Number(opts.minScore);
        }
        const result = await api.post("/graph/semantic-search", body);
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("traverse")
    .description("Traverse the graph")
    .requiredOption("--start <type:id>", "Start node (type:id)")
    .option("--direction <d>", "Traversal direction")
    .option("--edge-types <t>", "Edge types to follow")
    .option("--max-depth <n>", "Maximum traversal depth")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const [startType, startId] = opts.start.split(":");
        const body: Record<string, unknown> = {
          startType,
          startId,
        };
        if (opts.direction) {
          body.direction = opts.direction;
        }
        if (opts.edgeTypes) {
          body.edgeTypes = opts.edgeTypes.split(",");
        }
        if (opts.maxDepth) {
          body.maxDepth = Number(opts.maxDepth);
        }
        const result = await api.post("/graph/traverse", body);
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("find-path")
    .description("Find path between two nodes")
    .requiredOption("--from <type:id>", "Source node (type:id)")
    .requiredOption("--to <type:id>", "Target node (type:id)")
    .option("--max-depth <n>", "Maximum search depth")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const [fromType, fromId] = opts.from.split(":");
        const [toType, toId] = opts.to.split(":");
        const body: Record<string, unknown> = {
          fromType,
          fromId,
          toType,
          toId,
        };
        if (opts.maxDepth) {
          body.maxDepth = Number(opts.maxDepth);
        }
        const result = await api.post("/graph/find-path", body);
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("batch")
    .description("Execute batch operations")
    .requiredOption("--operations <json-file>", "Operations JSON file")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const operations = readDefinitionFile(opts.operations);
        const result = await api.post("/graph/batch", operations);
        fmt.raw(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("history")
    .description("View entity history")
    .argument("<type>", "Entity type")
    .argument("<id>", "Entity ID")
    .action(async (type, id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/graph/history/${type}/${id}`
        );
        fmt.table(result.data ?? [], [
          { key: "version", header: "VERSION" },
          { key: "changedBy", header: "CHANGED BY" },
          { key: "changedAt", header: "CHANGED AT" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  graph
    .command("history:revert")
    .description("Revert entity to a previous version")
    .argument("<type>", "Entity type")
    .argument("<id>", "Entity ID")
    .requiredOption("--to-version <n>", "Target version")
    .action(async (type, id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          `/graph/history/${type}/${id}/revert`,
          { toVersion: Number(opts.toVersion) }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
