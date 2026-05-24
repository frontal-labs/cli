import type { SSEEvent } from "@/http/stream.js";
import { theme } from "@/output/theme.js";

export interface StreamRenderOptions {
  json?: boolean;
  quiet?: boolean;
}

export async function renderSSEStream(
  events: AsyncIterable<SSEEvent>,
  opts: StreamRenderOptions = {}
): Promise<void> {
  for await (const event of events) {
    if (opts.quiet) {
      continue;
    }

    if (opts.json) {
      console.log(
        JSON.stringify({ type: event.type, data: event.data, id: event.id })
      );
    } else {
      const prefix = theme.dim(`[${event.type}]`);
      console.log(`${prefix} ${event.data}`);
    }
  }
}
