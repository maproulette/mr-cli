/**
 * Represents the top-level `cooperative` command, which simply delegates to
 * the various sub-command modules
 */
exports.command = 'cooperative <command> [--out <challenge-file>] <input-files..>'
exports.aliases = ['coop']
exports.desc = 'Generate a cooperative challenge'
exports.builder = function (yargs) {
  return yargs
    .boolean('josm')
    .describe('josm', 'Force input files to be treated as JOSM Change files')
    .boolean('osc')
    .describe('osc', 'Force input files to be treated as OSM Change files')
    .boolean('dev')
    .describe('dev', 'Use development OSM servers instead of production servers')
    .commandDir('cooperative_commands')
}
exports.handler = function (argv) {}
