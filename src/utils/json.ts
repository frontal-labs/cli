export function parseJsonInput(
  value: string | undefined,
  label: string
): unknown {
  if (!value) {
    return;
  }

  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`Invalid JSON for ${label}.`, { cause: err });
  }
}
