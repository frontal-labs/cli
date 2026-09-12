import chalk from "chalk";

export const theme = {
  bold: chalk.bold,
  dim: chalk.dim,
  error: chalk.red,
  header: chalk.bold.underline,
  id: chalk.cyan,
  info: chalk.blue,
  status: {
    active: chalk.green,
    completed: chalk.green,
    deleted: chalk.dim,
    error: chalk.red,
    failed: chalk.red,
    healthy: chalk.green,
    paused: chalk.yellow,
    pending: chalk.yellow,
    running: chalk.green,
    stopped: chalk.dim,
  },
  success: chalk.green,
  warn: chalk.yellow,
};
