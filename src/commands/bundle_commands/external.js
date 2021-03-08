const glob = require("glob");
const Base64 = require("js-base64").Base64;
const fs = require("fs");
const Spinner = require("../../common/spinner");
const Utils = require("../../common/utils");
const Constants = require("../../common/constants");
const MRFileParser = require("../../common/mr_file_parser");
const OSCFileParser = require("../../common/osc_file_parser");

const bundleTasks = (tasks, externalId = "externalId") => {
  const bundled = [];
  let leftoverTasks = tasks;

  while (leftoverTasks.length) {
    const task = leftoverTasks[0];
    const id = task[externalId];

    const matchingTasks = leftoverTasks.filter((t) => {
      if (t[externalId] === id) {
        return true;
      }

      return false;
    });

    let features = [];

    for (let j = 0; j < matchingTasks.length; j++) {
      features = features.concat(matchingTasks[j].features);
    }

    const bundledTask = {
      ...task,
      features,
    };

    const nonMatchingTasks = leftoverTasks.filter((t) => {
      if (t[externalId] !== id) {
        return true;
      }

      return false;
    });

    bundled.push(bundledTask);
    leftoverTasks = nonMatchingTasks;
  }

  return bundled;
};

/**
 * Generate bundled line-by-line geojson tasks that combine tasks
 * of the same external id
 */
const generateBundleWork = async (context, changeData) => {
  try {
    const parser = MRFileParser;
    // for bijective, everything will become one task; otherwise we
    // break up the changes into separate tasks

    const tasks = context.bijective
      ? [changeData]
      : await parser.explode(changeData, true);

    const bundledTasks = bundleTasks(tasks);

    bundledTasks.forEach((task) => {
      writeTaskGeoJSON(task, Constants.format.osmChange, context);
    });
  } catch (exception) {
    context.spinner.fail(`${context.filename}: ${exception.message}`);
    process.exit(2);
  }
};

function writeTaskGeoJSON(task, context) {
  console.log("final", task);

  if (context.rfc7464) {
    // RFC 7464 start of sequence
    context.out.write(Constants.controlChars.RS, "utf8");
  }
  context.out.write(JSON.stringify(task), "utf8");
  context.out.write("\n", "utf8");
}

// yargs command-module functions. See:
// https://github.com/yargs/yargs/blob/master/docs/advanced.md#providing-a-command-module
exports.command = "external [--out <challenge-file>] <input-files..>";

exports.describe = "Tasks with change files";

exports.builder = function (yargs) {
  return yargs
    .positional("input-files", {
      describe: "One or more JOSM .osm files to process",
    })
    .boolean("bijective")
    .describe(
      "bijective",
      "Create one task per osm file (all changes in file go into single task)"
    )
    .describe({
      out: "Output path for MapRoulette challenge GeoJSON file",
    })
    .help();
};

exports.handler = async function (argv) {
  // Startup a progress spinner
  const spinner = new Spinner("Initialize", { quiet: argv.quiet }).start();

  // Point to different OSM server if needed
  if (argv.dev) {
    Utils.osmServer = Constants.osm.devServer;
  }

  // Setup write stream for output containing line-by-line GeoJSON entries
  const out = argv.out ? fs.createWriteStream(argv.out) : process.stdout;

  // Read the input file(s) and kick things off
  if (!argv.inputFiles || argv.inputFiles.length === 0) {
    spinner.fail("Initialize: missing input file");
    process.exit(1);
  }

  spinner.succeed();
  spinner.start("Generate tasks");

  const context = {
    out,
    spinner,
    bijective: argv.bijective,
    rfc7464: argv.rfc7464,
  };

  try {
    for (let i = 0; i < argv.inputFiles.length; i++) {
      context.filename = argv.inputFiles[i];

      const changeData = fs.readFileSync(context.filename);

      await generateBundleWork(context, changeData.toString());
    }
    spinner.succeed();
  } catch (exception) {
    spinner.fail(`Generate tasks: ${exception.message}`);
    process.exit(2);
  }

  // Clean up and shut down
  spinner.start("Finish up");
  out.end(() => {
    spinner.succeed();
    process.exit(0);
  });
};
