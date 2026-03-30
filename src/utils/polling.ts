export interface UntilCondition {
  field: string;
  value: string;
}

export function parseUntilCondition(expr: string): UntilCondition {
  const eqIndex = expr.indexOf("=");
  if (eqIndex === -1) {
    throw new Error(
      `Invalid --until condition: "${expr}". Expected format: field=value`
    );
  }
  return {
    field: expr.slice(0, eqIndex),
    value: expr.slice(eqIndex + 1),
  };
}

export function evaluateCondition(
  data: unknown,
  condition: UntilCondition
): boolean {
  const parts = condition.field.split(".");
  let current: unknown = data;

  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return false;
    }
    if (Array.isArray(current)) {
      return current.some((item) => evaluateCondition(item, condition));
    }
    current = (current as Record<string, unknown>)[part];
  }

  return String(current) === condition.value;
}

export async function* poll<T>(
  fn: () => Promise<T>,
  opts: {
    interval?: number;
    until?: (data: T) => boolean;
    maxAttempts?: number;
  } = {}
): AsyncGenerator<T> {
  const interval = opts.interval ?? 2000;
  const maxAttempts = opts.maxAttempts ?? 150;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await fn();
    yield result;

    if (opts.until?.(result)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
