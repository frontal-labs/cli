import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { readDefinitionFile } from "../utils/file.js";

export function registerMarketplaceCommands(program: Command): void {
  const marketplace = program
    .command("marketplace")
    .description("Package marketplace");

  marketplace
    .command("search")
    .description("Search marketplace packages")
    .argument("[query]", "Search query")
    .option("--category <c>", "Filter by category")
    .action(async (query, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const params: Record<string, string> = {};
        if (query) {
          params.query = query;
        }
        if (opts.category) {
          params.category = opts.category;
        }
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          "/marketplace/packages",
          params
        );
        fmt.table(result.data ?? [], [
          { key: "slug", header: "SLUG" },
          { key: "name", header: "NAME" },
          { key: "description", header: "DESCRIPTION" },
          { key: "downloads", header: "DOWNLOADS" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  marketplace
    .command("get")
    .description("Get package details")
    .argument("<slug>", "Package slug")
    .action(async (slug, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/marketplace/packages/${slug}`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  marketplace
    .command("install")
    .description("Install a marketplace package")
    .argument("<slug>", "Package slug")
    .option("--version <v>", "Package version")
    .action(async (slug, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {};
        if (opts.version) {
          body.version = opts.version;
        }
        await api.post(`/marketplace/packages/${slug}/install`, body);
        fmt.success(`Package "${slug}" installed.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  marketplace
    .command("uninstall")
    .description("Uninstall a marketplace package")
    .argument("<slug>", "Package slug")
    .action(async (slug, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/marketplace/packages/${slug}/install`);
        fmt.success(`Package "${slug}" uninstalled.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  marketplace
    .command("publish")
    .description("Publish a package to the marketplace")
    .requiredOption("--from-file <path>", "Path to package definition file")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const data = readDefinitionFile(opts.fromFile);
        const result = await api.post<Record<string, unknown>>(
          "/marketplace/packages",
          data
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  marketplace
    .command("versions")
    .description("List package versions")
    .argument("<slug>", "Package slug")
    .action(async (slug, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/marketplace/packages/${slug}/versions`
        );
        fmt.table(result.data ?? [], [
          { key: "version", header: "VERSION" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  marketplace
    .command("reviews")
    .description("List package reviews")
    .argument("<slug>", "Package slug")
    .action(async (slug, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/marketplace/packages/${slug}/reviews`
        );
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "rating", header: "RATING" },
          { key: "comment", header: "COMMENT" },
          { key: "author", header: "AUTHOR" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  marketplace
    .command("review")
    .description("Submit a package review")
    .argument("<slug>", "Package slug")
    .requiredOption("--rating <n>", "Rating (1-5)")
    .option("--comment <text>", "Review comment")
    .action(async (slug, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {
          rating: Number(opts.rating),
        };
        if (opts.comment) {
          body.comment = opts.comment;
        }
        const result = await api.post<Record<string, unknown>>(
          `/marketplace/packages/${slug}/reviews`,
          body
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
