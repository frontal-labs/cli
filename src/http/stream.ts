export interface SSEEvent {
  data: string;
  id?: string;
  type: string;
}

const LEADING_SPACE = /^ /;

function processSSELine(line: string, currentEvent: Partial<SSEEvent>): void {
  if (line === "") {
    return;
  }

  if (line.startsWith(":")) {
    return;
  }

  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) {
    return;
  }

  const field = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1).replace(LEADING_SPACE, "");

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
    default:
      break;
  }
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

        processSSELine(line, currentEvent);
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
