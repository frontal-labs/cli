import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import { resolveConfig } from "../config/resolve.js";
import { handleError } from "../errors/handler.js";
import { ApiClient } from "../http/client.js";
import { Formatter } from "../output/formatter.js";

function resolveOrgSlug(opts: Record<string, unknown>, cmd: Command): string {
  const config = resolveConfig(cmd.optsWithGlobals());
  const slug = (opts.org as string) ?? config.orgId;
  if (!slug) {
    throw new Error(
      "Organization slug required. Use --org or set via `orgs use`."
    );
  }
  return slug;
}

export function registerBillingCommands(program: Command): void {
  const billing = program
    .command("billing")
    .description("Billing and subscription management");

  // --- Invoices ---

  billing
    .command("invoices")
    .description("List invoices")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/organizations/${slug}/billing/invoices`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "status", header: "STATUS" },
          { key: "amount", header: "AMOUNT" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  billing
    .command("invoice:get")
    .description("Get invoice details")
    .argument("<id>", "Invoice ID")
    .option("--org <slug>", "Organization slug")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get(
          `/organizations/${slug}/billing/invoices/${id}`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  billing
    .command("invoice:pdf")
    .description("Download invoice PDF")
    .argument("<id>", "Invoice ID")
    .option("--output <path>", "Output file path")
    .option("--org <slug>", "Organization slug")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const blob = await api.download(
          `/organizations/${slug}/billing/invoices/${id}/pdf`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());

        if (opts.output) {
          const buffer = Buffer.from(await blob.arrayBuffer());
          writeFileSync(resolve(opts.output), buffer);
          fmt.success(`Invoice PDF saved to "${opts.output}".`);
        } else {
          // Print the download URL or raw data info
          const result = await api.get<Record<string, unknown>>(
            `/organizations/${slug}/billing/invoices/${id}`
          );
          const url = result.pdfUrl ?? result.pdf_url;
          if (url) {
            console.log(String(url));
          } else {
            fmt.info("Use --output <path> to save the PDF to a file.");
          }
        }
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  billing
    .command("invoice:finalize")
    .description("Finalize an invoice")
    .argument("<id>", "Invoice ID")
    .option("--org <slug>", "Organization slug")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.post(
          `/organizations/${slug}/billing/invoices/${id}/finalize`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  billing
    .command("invoice:void")
    .description("Void an invoice")
    .argument("<id>", "Invoice ID")
    .option("--org <slug>", "Organization slug")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.post(
          `/organizations/${slug}/billing/invoices/${id}/void`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  // --- Plans ---

  billing
    .command("plans")
    .description("List billing plans")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/organizations/${slug}/billing/plans`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "price", header: "PRICE" },
          { key: "interval", header: "INTERVAL" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  billing
    .command("plan:get")
    .description("Get plan details")
    .argument("<id>", "Plan ID")
    .option("--org <slug>", "Organization slug")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get(
          `/organizations/${slug}/billing/plans/${id}`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  // --- Features & Entitlements ---

  billing
    .command("features")
    .description("List billing features")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/organizations/${slug}/billing/features`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "type", header: "TYPE" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  billing
    .command("entitlements")
    .description("View billing entitlements")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get(
          `/organizations/${slug}/billing/entitlements`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  // --- Coupons ---

  billing
    .command("coupons")
    .description("List coupons")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/organizations/${slug}/billing/coupons`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "code", header: "CODE" },
          { key: "discount", header: "DISCOUNT" },
          { key: "status", header: "STATUS" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  billing
    .command("coupon:create")
    .description("Create a coupon")
    .requiredOption("--code <code>", "Coupon code")
    .requiredOption("--discount <discount>", "Discount value")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.post(
          `/organizations/${slug}/billing/coupons`,
          {
            code: opts.code,
            discount: opts.discount,
          }
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  // --- Credits ---

  billing
    .command("credits")
    .description("List credit grants")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/organizations/${slug}/billing/credit-grants`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "amount", header: "AMOUNT" },
          { key: "reason", header: "REASON" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  billing
    .command("credit:create")
    .description("Create a credit grant")
    .requiredOption("--amount <amount>", "Credit amount")
    .requiredOption("--reason <reason>", "Reason for credit")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.post(
          `/organizations/${slug}/billing/credit-grants`,
          {
            amount: opts.amount,
            reason: opts.reason,
          }
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  // --- Payments ---

  billing
    .command("payments")
    .description("List payments")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/organizations/${slug}/billing/payments`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "amount", header: "AMOUNT" },
          { key: "status", header: "STATUS" },
          { key: "createdAt", header: "CREATED" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  // --- Meters ---

  billing
    .command("meters")
    .description("List billing meters")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get<{ data: Record<string, unknown>[] }>(
          `/organizations/${slug}/billing/meters`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.table(result.data ?? [], [
          { key: "id", header: "ID" },
          { key: "name", header: "NAME" },
          { key: "aggregation", header: "AGGREGATION" },
        ]);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  billing
    .command("meter:get")
    .description("Get meter details")
    .argument("<id>", "Meter ID")
    .option("--org <slug>", "Organization slug")
    .action(async (id, opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.get(
          `/organizations/${slug}/billing/meters/${id}`
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  billing
    .command("meter:create")
    .description("Create a billing meter")
    .requiredOption("--name <name>", "Meter name")
    .requiredOption("--aggregation <type>", "Aggregation type")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const result = await api.post(`/organizations/${slug}/billing/meters`, {
          name: opts.name,
          aggregation: opts.aggregation,
        });
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });

  // --- Costs ---

  billing
    .command("costs")
    .description("View billing costs")
    .option("--from <date>", "Start date (ISO 8601)")
    .option("--to <date>", "End date (ISO 8601)")
    .option("--org <slug>", "Organization slug")
    .action(async (opts, cmd) => {
      try {
        const config = resolveConfig(cmd.optsWithGlobals());
        const slug = resolveOrgSlug(opts, cmd);
        const api = new ApiClient(config);
        const params: Record<string, string> = {};
        if (opts.from) {
          params.from = opts.from;
        }
        if (opts.to) {
          params.to = opts.to;
        }
        const result = await api.get(
          `/organizations/${slug}/billing/costs`,
          params
        );
        const fmt = Formatter.from(cmd.optsWithGlobals());
        fmt.object(result as Record<string, unknown>);
      } catch (err) {
        handleError(err, cmd.optsWithGlobals());
      }
    });
}
