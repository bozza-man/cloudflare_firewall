#!/usr/bin/env node

import { createGatewayCommands } from './cli/gateway-commands.js';
import { validateConfig } from './utils/config.js';
import chalk from 'chalk';

async function main() {
  try {
    validateConfig();
    
    const program = createGatewayCommands();
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  }
}

main();