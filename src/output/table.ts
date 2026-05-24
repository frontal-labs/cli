import Table from "cli-table3";
import { theme } from "@/output/theme.js";

export interface Column {
  formatter?: (value: unknown) => string;
  header: string;
  key: string;
  width?: number;
}

export function renderTable(
  data: Record<string, unknown>[],
  columns: Column[]
): string {
  const table = new Table({
    head: columns.map((c) => theme.bold(c.header)),
    style: { head: [], border: [] },
  });

  for (const row of data) {
    table.push(
      columns.map((col) => {
        const value = row[col.key];
        if (col.formatter) {
          return col.formatter(value);
        }
        if (value === null || value === undefined) {
          return theme.dim("-");
        }
        return String(value);
      })
    );
  }

  return table.toString();
}
