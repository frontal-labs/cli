import { exec } from "node:child_process";

export function openBrowser(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const command =
      process.platform === "darwin"
        ? `open "${url}"`
        : process.platform === "win32"
          ? `start "" "${url}"`
          : `xdg-open "${url}"`;

    exec(command, (error) => {
      resolve(!error);
    });
  });
}
