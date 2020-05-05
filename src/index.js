#!/usr/bin/env node
const yargs = require('yargs')

/**
 * Pull in the various command modules, adding in only global options
 */
const argv =
  yargs
  .scriptName("mr")
  .commandDir('commands')
  .demandCommand()
  .boolean('quiet')
  .alias('quiet', 'silent')
  .describe('quiet', 'Quiet mode: suppress status messages')
  .wrap(yargs.terminalWidth())
  .argv
