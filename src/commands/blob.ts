import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";
import { confirmAction } from "../utils/interactive.js";

export function registerBlobCommands(program: Command): void {
  const blob = program.command("blob").description("Manage blob storage");

  blob
    .command("upload")
    .description("Upload a file to blob storage")
    .argument("<bucket>", "Bucket name")
    .argument("<key>", "Object key")
    .argument("<file>", "Local file path")
    .option("--content-type <type>", "Content type", "application/octet-stream")
    .action(async (bucket, key, file, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const data = readFileSync(resolve(file));
        await api.upload(`/blob/${bucket}/${key}`, data, opts.contentType);
        fmt.success(`Uploaded ${file} to ${bucket}/${key}.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  blob
    .command("download")
    .description("Download a file from blob storage")
    .argument("<bucket>", "Bucket name")
    .argument("<key>", "Object key")
    .option("--output <path>", "Output file path")
    .action(async (bucket, key, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const blob = await api.download(`/blob/${bucket}/${key}`);
        const buffer = Buffer.from(await blob.arrayBuffer());
        if (opts.output) {
          writeFileSync(resolve(opts.output), buffer);
          fmt.success(`Downloaded to ${opts.output}.`);
        } else {
          fmt.object({ bucket, key, size: buffer.length });
        }
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  blob
    .command("delete")
    .description("Delete a blob object")
    .argument("<bucket>", "Bucket name")
    .argument("<key>", "Object key")
    .option("--force", "Skip confirmation")
    .action(async (bucket, key, opts, cmd) => {
      try {
        const confirmed = await confirmAction(
          `Delete ${bucket}/${key}?`,
          opts.force
        );
        if (!confirmed) {
          return;
        }
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.delete(`/blob/${bucket}/${key}`);
        fmt.success(`Deleted ${bucket}/${key}.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  blob
    .command("list")
    .description("List objects in a bucket")
    .argument("<bucket>", "Bucket name")
    .option("--prefix <prefix>", "Filter by prefix")
    .action(async (bucket, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const params: Record<string, string> = {};
        if (opts.prefix) {
          params.prefix = opts.prefix;
        }
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/blob/${bucket}`,
          params
        );
        fmt.table(result.data ?? [], [
          { key: "key", header: "KEY" },
          { key: "size", header: "SIZE" },
          { key: "contentType", header: "CONTENT TYPE" },
          { key: "lastModified", header: "LAST MODIFIED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  blob
    .command("copy")
    .description("Copy a blob object")
    .argument("<src-bucket>", "Source bucket")
    .argument("<src-key>", "Source key")
    .argument("<dst-bucket>", "Destination bucket")
    .argument("<dst-key>", "Destination key")
    .action(async (srcBucket, srcKey, dstBucket, dstKey, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.post("/blob/copy", {
          srcBucket,
          srcKey,
          dstBucket,
          dstKey,
        });
        fmt.success(`Copied ${srcBucket}/${srcKey} to ${dstBucket}/${dstKey}.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  blob
    .command("move")
    .description("Move a blob object")
    .argument("<src-bucket>", "Source bucket")
    .argument("<src-key>", "Source key")
    .argument("<dst-bucket>", "Destination bucket")
    .argument("<dst-key>", "Destination key")
    .action(async (srcBucket, srcKey, dstBucket, dstKey, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        await api.post("/blob/move", {
          srcBucket,
          srcKey,
          dstBucket,
          dstKey,
        });
        fmt.success(`Moved ${srcBucket}/${srcKey} to ${dstBucket}/${dstKey}.`);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  blob
    .command("metadata")
    .description("Get blob object metadata")
    .argument("<bucket>", "Bucket name")
    .argument("<key>", "Object key")
    .action(async (_bucket, key, _opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const result = await api.get<Record<string, unknown>>(
          `/blob/${key}/metadata`
        );
        fmt.object(result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  blob
    .command("signed-url")
    .description("Generate a signed URL for a blob")
    .argument("<bucket>", "Bucket name")
    .requiredOption("--key <key>", "Object key")
    .option("--expires <sec>", "Expiry in seconds")
    .action(async (bucket, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const api = new ApiClient(config);
        const fmt = Formatter.from(cmd.optsWithGlobals());
        const body: Record<string, unknown> = {
          bucket,
          key: opts.key,
        };
        if (opts.expires) {
          body.expires = Number(opts.expires);
        }
        const result = await api.post<{ url: string }>(
          "/blob/signed-url",
          body
        );
        fmt.raw(result.url ?? result);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
