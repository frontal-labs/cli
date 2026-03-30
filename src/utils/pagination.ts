import type { Command } from "commander";

export function addPaginationOptions(cmd: Command): Command {
  return cmd
    .option("--limit <n>", "Number of items per page", "25")
    .option("--cursor <cursor>", "Pagination cursor")
    .option("--all", "Fetch all pages");
}

export interface PaginatedResponse<T = Record<string, unknown>> {
  data: T[];
  pagination?: {
    cursor?: string;
    hasMore?: boolean;
    total?: number;
  };
}

export function buildPaginationParams(
  opts: Record<string, unknown>
): Record<string, string> {
  const params: Record<string, string> = {};
  if (opts.limit) {
    params.limit = String(opts.limit);
  }
  if (opts.cursor) {
    params.cursor = String(opts.cursor);
  }
  return params;
}

export async function fetchAllPages<T = Record<string, unknown>>(
  fetcher: (params: Record<string, string>) => Promise<PaginatedResponse<T>>,
  baseParams: Record<string, string> = {}
): Promise<PaginatedResponse<T>> {
  const allData: T[] = [];
  let cursor: string | undefined;

  do {
    const params = { ...baseParams };
    if (cursor) {
      params.cursor = cursor;
    }

    const result = await fetcher(params);
    allData.push(...result.data);

    cursor = result.pagination?.hasMore ? result.pagination.cursor : undefined;
  } while (cursor);

  return {
    data: allData,
    pagination: { hasMore: false, total: allData.length },
  };
}
