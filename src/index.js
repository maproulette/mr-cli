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
  .describe(
    'quiet',
    'Quiet mode: suppress status messages'
  )
  .boolean('rfc7464')
  .default('rfc7464', true)
  .describe(
    'rfc7464',
    'Output RFC 7464 compliant format (use --no-rfc7464 for old format)'
  )
  .wrap(yargs.terminalWidth())
  .argv
