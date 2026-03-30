import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { readDefinitionFile } from "../utils/file.js";
import { confirmAction } from "../utils/interactive.js";

export function registerOntologyCommands(program: Command): void {
  const ontology = program
    .command("ontology")
    .description("Ontology and model management");

  ontology
    .command("create")
    .description("Create an ontology model")
    .requiredOption("--name <n>", "Model name")
    .option("--fields <json>", "Fields as JSON")
    .option("--from-file <path>", "Load definition from file")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        let body: Record<string, unknown>;
        if (opts.fromFile) {
          body = { name: opts.name, ...readDefinitionFile(opts.fromFile) };
        } else {
          body = { name: opts.name, fields: JSON.parse(opts.fields ?? "{}") };
        }
        const result = await api.post<Record<string, unknown>>(
          "/ontology",
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("list")
    .description("List ontology models")
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
          "/ontology",
          params
        );
        fmt.table(result.data ?? [], [
          { key: "name", header: "NAME" },
          { key: "status", header: "STATUS" },
          { key: "version", header: "VERSION" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("get")
    .description("Get model details")
    .argument("<name>", "Model name")
    .option("--version <n>", "Specific version")
    .action(async (name, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const params: Record<string, string> = {};
        if (opts.version) {
          params.version = opts.version;
        }
        const result = await api.get<Record<string, unknown>>(
          `/models/${name}`,
          params
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("update")
    .description("Update a model")
    .argument("<name>", "Model name")
    .option("--fields <json>", "Updated fields as JSON")
    .option("--from-file <path>", "Load definition from file")
    .action(async (name, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        let body: Record<string, unknown>;
        if (opts.fromFile) {
          body = readDefinitionFile(opts.fromFile);
        } else {
          body = { fields: JSON.parse(opts.fields ?? "{}") };
        }
        const result = await api.put<Record<string, unknown>>(
          `/models/${name}`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("delete")
    .description("Delete a model")
    .argument("<name>", "Model name")
    .option("--force", "Skip confirmation")
    .action(async (name, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete model ${name}?`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/models/${name}`);
        fmt.success(`Model ${name} deleted.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("validate")
    .description("Validate a model definition")
    .requiredOption("--from-file <path>", "Definition file to validate")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const definition = readDefinitionFile(opts.fromFile);
        const result = await api.post<Record<string, unknown>>(
          "/ontology/validate",
          definition
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("integrity")
    .description("Check ontology integrity")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          "/ontology/integrity"
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("versions")
    .description("List model versions")
    .argument("<name>", "Model name")
    .action(async (name, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/models/${name}/versions`
        );
        fmt.table(result.data ?? [], [
          { key: "version", header: "VERSION" },
          { key: "createdAt", header: "CREATED" },
          { key: "changedBy", header: "CHANGED BY" },
          { key: "changesSummary", header: "CHANGES" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("relationships")
    .description("List model relationships")
    .argument("<name>", "Model name")
    .action(async (name, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/models/${name}/relationships`
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "type", header: "TYPE" },
          { key: "target", header: "TARGET" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("validate-data")
    .description("Validate data against a model")
    .argument("<name>", "Model name")
    .action(async (name, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          `/models/${name}/validate-data`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("migration:plan")
    .description("Plan a migration")
    .option("--model <n>", "Model name")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {};
        if (opts.model) {
          body.model = opts.model;
        }
        const result = await api.post<Record<string, unknown>>(
          "/ontology/migrations/plan",
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("migration:apply")
    .description("Apply a migration plan")
    .argument("<plan-id>", "Migration plan ID")
    .option("--strategy <s>", "Migration strategy")
    .action(async (planId, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = { planId };
        if (opts.strategy) {
          body.strategy = opts.strategy;
        }
        const result = await api.post<Record<string, unknown>>(
          "/ontology/migrations/apply",
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("migration:rollback")
    .description("Rollback a migration")
    .argument("<mid>", "Migration ID")
    .action(async (mid, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          `/ontology/migrations/${mid}/rollback`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("migration:history")
    .description("View migration history")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/ontology/migrations/history"
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "modelId", header: "MODEL" },
          { key: "fromVersion", header: "FROM" },
          { key: "toVersion", header: "TO" },
          { key: "status", header: "STATUS" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("rules")
    .description("List ontology rules")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/ontology/rules"
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "type", header: "TYPE" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("rule:create")
    .description("Create an ontology rule")
    .requiredOption("--name <n>", "Rule name")
    .requiredOption("--entity-types <t>", "Entity types")
    .requiredOption("--condition <c>", "Rule condition")
    .requiredOption("--action <a>", "Rule action")
    .requiredOption("--severity <s>", "Severity level")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          "/ontology/rules",
          {
            name: opts.name,
            entityTypes: opts.entityTypes.split(","),
            condition: opts.condition,
            action: opts.action,
            severity: opts.severity,
          }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("rule:update")
    .description("Update an ontology rule")
    .argument("<id>", "Rule ID")
    .option("--name <n>", "New rule name")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {};
        if (opts.name) {
          body.name = opts.name;
        }
        const result = await api.put<Record<string, unknown>>(
          `/ontology/rules/${id}`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("rule:delete")
    .description("Delete an ontology rule")
    .argument("<id>", "Rule ID")
    .action(async (id, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/ontology/rules/${id}`);
        fmt.success("Rule deleted.");
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("rule:evaluate")
    .description("Evaluate ontology rules")
    .option("--entity-type <t>", "Entity type to evaluate")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {};
        if (opts.entityType) {
          body.entityType = opts.entityType;
        }
        const result = await api.post<Record<string, unknown>>(
          "/ontology/rules/evaluate",
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("mixins")
    .description("List ontology mixins")
    .action(async (_opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/ontology/mixins"
        );
        fmt.table(result.data ?? [], [
          { key: "name", header: "NAME" },
          { key: "fields", header: "FIELDS" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("mixin:create")
    .description("Create an ontology mixin")
    .requiredOption("--name <n>", "Mixin name")
    .requiredOption("--fields <json>", "Mixin fields as JSON")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.post<Record<string, unknown>>(
          "/ontology/mixins",
          { name: opts.name, fields: JSON.parse(opts.fields) }
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("generate")
    .description("Generate an ontology from description")
    .argument("<description>", "Natural language description")
    .option("--context <json>", "Additional context as JSON")
    .action(async (description, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = { description };
        if (opts.context) {
          body.context = JSON.parse(opts.context);
        }
        const result = await api.post<Record<string, unknown>>(
          "/ontology/generate",
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  ontology
    .command("infer")
    .description("Infer ontology from substrates")
    .option("--substrates <list>", "Comma-separated substrate list")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {};
        if (opts.substrates) {
          body.substrates = opts.substrates.split(",");
        }
        const result = await api.post<Record<string, unknown>>(
          "/ontology/infer",
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
