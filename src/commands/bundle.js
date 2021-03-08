/**
 * Represents the top-level `bundle` command, which simply delegates to
 * the various sub-command modules
 */
exports.command = "bundle <command> [--out <challenge-file>] <input-files..>";
exports.aliases = ["bundle"];
exports.desc = "Generate bundle files";
exports.builder = function (yargs) {
  return yargs
    .boolean("dev")
    .describe(
      "dev",
      "Use development OSM servers instead of production servers"
    )
    .commandDir("bundle_commands");
};
exports.handler = function (argv) {};
