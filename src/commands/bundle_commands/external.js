const glob = require("glob");
const Base64 = require("js-base64").Base64;
const fsPromise = require("fs").promises;
const fs = require("fs");
const Spinner = require("../../common/spinner");
const Utils = require("../../common/utils");
const Constants = require("../../common/constants");

const bundleTasks = (tasks, externalId) => {
  const bundled = [];
  let leftoverTasks = tasks;
  let infiniteLoopCount = 0;
  let prevLength = leftoverTasks.length;

  while (leftoverTasks.length) {
    const task = leftoverTasks[0];
    const id = task.properties[externalId];

    const matchingTasks = leftoverTasks.filter((t) => {
      if (t.properties[externalId] === id) {
        return true;
      }

      return false;
    });

    let bundledTask;

    if (matchingTasks.length > 1) {
      let features = [];

      for (let j = 0; j < matchingTasks.length; j++) {
        features = features.concat(matchingTasks[j]);
      }

      bundledTask = {
        type: "FeatureCollection",
        features,
      };
    } else {
      bundledTask = matchingTasks[0];
    }

    const nonMatchingTasks = leftoverTasks.filter((t) => {
      if (t.properties[externalId] !== id) {
        return true;
      }

      return false;
    });

    bundled.push(bundledTask);
    leftoverTasks = nonMatchingTasks;

    if (leftoverTasks.length === prevLength) {
      infiniteLoopCount++;

      if (infiniteLoopCount > 10) {
        console.log(
          "There was a problem with your data that caused an infinite loop.  Process stopped"
        );
        break;
      }
    } else {
      infiniteLoopCount = 0;
    }
  }

  return bundled;
};

/**
 * Generate bundled line-by-line geojson tasks that combine tasks
 * of the same external id
 */
const generateBundleWork = async (context, changeData) => {
  try {
    const fileObj = JSON.parse(changeData);
    const bundledTasks = bundleTasks(fileObj.features, context.externalId);

    context.out.write("[", "utf8");
    context.out.write("\n", "utf8");

    for (let i = 0; i < bundledTasks.length; i++) {
      context.out.write(JSON.stringify(bundledTasks[i]), "utf8");
      if (i !== bundledTasks.length - 1) {
        context.out.write(",", "utf8");
      }
      context.out.write("\n", "utf8");
    }

    context.out.write("]", "utf8");
    context.out.write("\n", "utf8");
  } catch (exception) {
    context.spinner.fail(`${context.filename}: ${exception.message}`);
    process.exit(2);
  }
};

// yargs command-module functions. See:
// https://github.com/yargs/yargs/blob/master/docs/advanced.md#providing-a-command-module
exports.command = "external [<externalId>] [outputFile] [<inputFiles..>]";

exports.describe = "Tasks with change files";

exports.builder = function (yargs) {
  return yargs.help();
};

exports.handler = async function (argv) {
  // Startup a progress spinner
  const spinner = new Spinner("Initialize", { quiet: argv.quiet }).start();

  // Point to different OSM server if needed
  if (argv.dev) {
    Utils.osmServer = Constants.osm.devServer;
  }

  // Read the input file(s) and kick things off
  if (!argv.inputFiles || argv.inputFiles.length === 0) {
    spinner.fail("Initialize: missing input file");
    process.exit(1);
  }

  spinner.succeed();
  spinner.start("Generate tasks");

  // Setup write stream for output containing line-by-line GeoJSON entries
  const out = argv.outputFile
    ? fs.createWriteStream(argv.outputFile)
    : process.stdout;

  const context = {
    out,
    externalId: argv.externalId,
    spinner,
    bijective: argv.bijective,
    rfc7464: argv.rfc7464,
  };

  try {
    for (let i = 0; i < argv.inputFiles.length; i++) {
      context.filename = argv.inputFiles[i];

      const config = {
        encoding: "utf-8",
        flag: "r",
      };
      const changeData = await fsPromise.readFile(context.filename, config);

      await generateBundleWork(context, changeData);
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
