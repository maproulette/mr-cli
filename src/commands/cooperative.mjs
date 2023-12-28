import { commands } from './cooperative_commands/index.mjs'

export const command = 'cooperative <command> [--out <challenge-file>] <input-files..>'
export const aliases = ['coop']
export const desc = 'Generate a cooperative challenge'
export function builder(yargs) {
  return yargs
    .boolean('josm')
    .describe('josm', 'Force input files to be treated as JOSM Change files')
    .boolean('osc')
    .describe('osc', 'Force input files to be treated as OSM Change files')
    .boolean('dev')
    .describe('dev', 'Use development OSM servers instead of production servers')
    .commands(commands)
}
export function handler(argv) { }
