#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { commands } from './commands/index.mjs';

const yargsInstance = yargs(hideBin(process.argv));
const argv = yargsInstance
  .scriptName("mr")
  .command(commands)
  .demandCommand()
  .boolean('quiet')
  .alias('quiet', 'silent')
  .describe('quiet', 'Quiet mode: suppress status messages')
  .boolean('rfc7464')
  .default('rfc7464', true)
  .describe('rfc7464', 'Output RFC 7464 compliant format (use --no-rfc7464 for old format)')
  .wrap(yargsInstance.terminalWidth())
  .argv;
