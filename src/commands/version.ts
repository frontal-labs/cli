import type { Command } from "commander";
import { runAction } from "@/lib/command.js";
import { withExamples } from "@/lib/output.js";
import { runtimeInfo, runtimeLabel } from "@/output/help.js";
import { theme } from "@/output/theme.js";
import { VERSION } from "@/version.js";

export function registerVersionCommand(program: Command): void {
  withExamples(
    program
      .command("version")
      .description("Show the CLI version and runtime")
      .action((_opts, cmd) =>
        runAction(cmd, ({ fmt, globalOpts }) => {
          if (globalOpts.json) {
            fmt.raw({ version: VERSION, ...runtimeInfo() });
            return;
          }
          console.log(
            `${theme.bold("Frontal CLI")} ${theme.id(`v${VERSION}`)}`
          );
          console.log(`${theme.dim("runtime")}  ${runtimeLabel()}`);
        })
      ),
    ["frontal version", "frontal version --json"]
  );
}
