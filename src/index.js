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
  .describe(
    'rfc7464',
    'Output RFC 7464 compliant format (MapRoulette v3.6.5+)'
  )
  .wrap(yargs.terminalWidth())
  .argv
