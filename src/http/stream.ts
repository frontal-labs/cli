export interface SSEEvent {
  data: string;
  id?: string;
  type: string;
}

export async function* parseSSEStream(
  response: Response
): AsyncIterable<SSEEvent> {
  const body = response.body;
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: Partial<SSEEvent> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line === "") {
          if (currentEvent.data !== undefined) {
            yield {
              type: currentEvent.type ?? "message",
              data: currentEvent.data,
              id: currentEvent.id,
            };
          }
          currentEvent = {};
          continue;
        }

        if (line.startsWith(":")) {
          continue;
        }

        const colonIdx = line.indexOf(":");
        if (colonIdx === -1) {
          continue;
        }

        const field = line.slice(0, colonIdx);
        const value = line.slice(colonIdx + 1).replace(/^ /, "");

        switch (field) {
          case "event":
            currentEvent.type = value;
            break;
          case "data":
            currentEvent.data =
              currentEvent.data === undefined
                ? value
                : `${currentEvent.data}\n${value}`;
            break;
          case "id":
            currentEvent.id = value;
            break;
        }
      }
    }

    if (currentEvent.data !== undefined) {
      yield {
        type: currentEvent.type ?? "message",
        data: currentEvent.data,
        id: currentEvent.id,
      };
    }
  } finally {
    reader.releaseLock();
  }
}
