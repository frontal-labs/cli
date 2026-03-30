import ora, { type Ora } from "ora";

let suppressed = false;

export function suppressSpinner(value: boolean): void {
  suppressed = value;
}

export function createSpinner(text: string): Ora {
  if (suppressed) {
    return ora({ text, isEnabled: false });
  }
  return ora(text);
}
