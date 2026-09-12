import ora, { type Ora } from "ora";

let suppressed = false;

export function suppressSpinner(value: boolean): void {
  suppressed = value;
}

export function createSpinner(text: string): Ora {
  if (suppressed) {
    return ora({ isEnabled: false, text });
  }
  return ora(text);
}
