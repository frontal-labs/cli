import { redact } from "@/output/redact.js";
import { theme } from "@/output/theme.js";

export interface StreamEvent {
  data: unknown;
  id?: string;
  type: string;
}

export interface StreamRenderOptions {
  json?: boolean;
  quiet?: boolean;
}

function formatData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  return JSON.stringify(redact(data));
}

/**
 * Renders SSE events from the SDK (`{ type, data, id }`, data already
 * JSON-parsed) as human lines or NDJSON.
 */
export async function renderSSEStream(
  events: AsyncIterable<StreamEvent>,
  opts: StreamRenderOptions = {}
): Promise<void> {
  for await (const event of events) {
    if (opts.quiet) {
      continue;
    }

    if (opts.json) {
      console.log(
        JSON.stringify(
          redact({ data: event.data, id: event.id, type: event.type })
        )
      );
    } else {
      const prefix = theme.dim(`[${event.type}]`);
      console.log(`${prefix} ${formatData(event.data)}`);
    }
  }
}
