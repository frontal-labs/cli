import { exec } from "node:child_process";

export function openBrowser(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let command: string;
    if (process.platform === "darwin") {
      command = `open "${url}"`;
    } else if (process.platform === "win32") {
      command = `start "" "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    exec(command, (error) => {
      resolve(!error);
    });
  });
}
