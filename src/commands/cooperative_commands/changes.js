const glob = require('glob')
const Base64 = require('js-base64').Base64
const fs = require('fs')
const Spinner = require('../../common/spinner')
const Utils = require('../../common/utils')
const Constants = require('../../common/constants')
const JOSMFileParser = require('../../common/josm_file_parser')
const OSCFileParser = require('../../common/osc_file_parser')

/**
 * Generate and write line-by-line GeoJSON entries describing each change,
 * including cooperative work for realizing the change, to the output stream
 * using the intermediate data structures from parseJOSMChanges
 */
const generateCooperativeWork = async (context, changeData) => {
  try {
    const parser = context.osmChange ? OSCFileParser : JOSMFileParser
    // for bijective, everything will become one task; otherwise we
    // break up the changes into separate tasks
    const featureChanges = context.bijective ? [changeData] : await parser.explode(changeData, true)
    const features = await Promise.all(featureChanges.map(async (changes, index) => {
      const parsed = await parser.parse(changes)

      return await Promise.all(parsed.topLevelElements.map(async topLevelElement => {
        const geometry =
          await Utils.geoJSONGeometryFor(topLevelElement, parsed.elementDataSetsByType)

        return {
          type: "Feature",
          properties: Utils.geoJSONPropertiesFor(topLevelElement),
          geometry,
        }
      }))
    }))

    // Generate GeoJSON for feature(s), storing XML change content in osmChange
    // (.osc) format
    features.forEach((feature, index) => {
      let changeContent = featureChanges[index]
      if (!context.osmChange) {
        changeContent = OSCFileParser.josmToOSC(featureChanges[index])
      }
      writeTaskGeoJSON(feature, changeContent, Constants.format.osmChange, context)
    })
  }
  catch(exception) {
    context.spinner.fail(`${context.filename}: ${exception.message}`)
    process.exit(2)
  }
}

function writeTaskGeoJSON(features, change, format, context) {
  const geoJSON = {
    type: "FeatureCollection",
    features,
    cooperativeWork: {
      meta: {
        version: 2,
        type: Constants.cooperativeType.changeFile,
      },
      file: {
        type: Constants.fileType.xml,
        format,
        encoding: Constants.encoding.base64,
        content: Base64.encode(change),
      }
    }
  }

  context.out.write(JSON.stringify(geoJSON), "utf8")
  context.out.write("\n", "utf8")
}

// yargs command-module functions. See:
// https://github.com/yargs/yargs/blob/master/docs/advanced.md#providing-a-command-module
exports.command = 'change [--out <challenge-file>] <input-files..>'

exports.describe = 'Tasks with change files'

exports.builder = function(yargs) {
  return yargs
    .positional('input-files', {
      describe: 'One or more JOSM .osm files to process',
    })
    .boolean('bijective')
    .describe('bijective', 'Create one task per osm file (all changes in file go into single task)')
    .describe({
      'out': 'Output path for MapRoulette challenge GeoJSON file',
    })
    .help()
}

exports.handler = async function(argv) {
  // Startup a progress spinner
  const spinner = new Spinner('Initialize', { quiet: argv.quiet }).start()

  // Point to different OSM server if needed
  if (argv.dev) {
    Utils.osmServer = Constants.osm.devServer
  }

  // Setup write stream for output containing line-by-line GeoJSON entries
  const out = argv.out ? fs.createWriteStream(argv.out) : process.stdout

  // Read the input file(s) and kick things off
  if (!argv.inputFiles || argv.inputFiles.length === 0) {
    spinner.fail("Initialize: missing input file")
    process.exit(1)
  }

  spinner.succeed()
  spinner.start("Generate tasks")

  const context = { out, spinner, bijective: argv.bijective, osmChange: argv.osc, josmChange: argv.josm }
  try {
    for (let i = 0; i < argv.inputFiles.length; i++) {
      context.filename = argv.inputFiles[i]

      // If user hasn't forced an input type, determine from file extension
      if (!context.osmChange && !context.josm) {
        if (context.filename.toLowerCase().endsWith(".osc")) {
          context.osmChange = true
        }
      }

      const changeData = fs.readFileSync(context.filename)
      await generateCooperativeWork(context, changeData.toString())
    }
    spinner.succeed()
  }
  catch(exception) {
    spinner.fail(`Generate tasks: ${exception.message}`)
    process.exit(2)
  }

  // Clean up and shut down
  spinner.start("Finish up")
  out.end(() => {
    spinner.succeed()
    process.exit(0);
  })
}
