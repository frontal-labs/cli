import { isatty } from "node:tty";

export function isInteractive(): boolean {
  return isatty(0) && isatty(1) && !process.env.CI;
}

export async function confirmAction(
  message: string,
  force?: boolean
): Promise<boolean> {
  if (force) {
    return true;
  }

  if (!isInteractive()) {
    console.error(
      "Confirmation required. Use --force to skip in non-interactive mode."
    );
    return false;
  }

  const { confirm } = await import("@clack/prompts");
  const result = await confirm({ message });
  return result === true;
}

export async function promptSecret(message: string): Promise<string> {
  const { password } = await import("@clack/prompts");
  const result = await password({ message });
  if (typeof result !== "string") {
    throw new Error("Input cancelled.");
  }
  return result;
}

export async function promptText(
  message: string,
  defaultValue?: string
): Promise<string> {
  const { text } = await import("@clack/prompts");
  const result = await text({
    message,
    defaultValue,
    placeholder: defaultValue,
  });
  if (typeof result !== "string") {
    throw new Error("Input cancelled.");
  }
  return result;
}
