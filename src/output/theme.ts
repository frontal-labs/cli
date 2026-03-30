import chalk from "chalk";

export const theme = {
  success: chalk.green,
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.blue,
  dim: chalk.dim,
  bold: chalk.bold,
  header: chalk.bold.underline,
  id: chalk.cyan,
  status: {
    active: chalk.green,
    running: chalk.green,
    completed: chalk.green,
    healthy: chalk.green,
    pending: chalk.yellow,
    paused: chalk.yellow,
    failed: chalk.red,
    error: chalk.red,
    stopped: chalk.dim,
    deleted: chalk.dim,
  },
};
