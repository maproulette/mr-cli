import { createWriteStream, readFileSync } from 'fs'
import jsBase64 from 'js-base64'
import Constants from '../../common/constants.mjs'
import JOSMFileParser from '../../common/josm_file_parser.mjs'
import OSCFileParser from '../../common/osc_file_parser.mjs'
import Spinner from '../../common/spinner.mjs'
import Utils from '../../common/utils.mjs'

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
      let changeContent = Utils.featureChanges[index]
      if (!context.osmChange) {
        changeContent = parser.josmToOSC(Utils.featureChanges[index])
      }
      writeTaskGeoJSON(feature, changeContent, _format.osmChange, context)
    })
  }
  catch (exception) {
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
        type: cooperativeType.changeFile,
      },
      file: {
        type: fileType.xml,
        format,
        encoding: _encoding.base64,
        content: jsBase64.Base64.encode(change),
      }
    }
  }

  if (context.rfc7464) {
    // RFC 7464 start of sequence
    context.out.write(controlChars.RS, "utf8")
  }
  context.out.write(JSON.stringify(geoJSON), "utf8")
  context.out.write("\n", "utf8")
}

export const command = 'change [--out <challenge-file>] <input-files..>'

export const describe = 'Tasks with change files'

export function builder(yargs) {
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

export async function handler(argv) {
  // Startup a progress spinner
  const spinner = new Spinner('Initialize', { quiet: argv.quiet }).start()

  // Point to different OSM server if needed
  if (argv.dev) {
    osmServer = Constants.osm.devServer
  }

  // Setup write stream for output containing line-by-line GeoJSON entries
  const out = argv.out ? createWriteStream(argv.out) : process.stdout

  // Read the input file(s) and kick things off
  if (!argv.inputFiles || argv.inputFiles.length === 0) {
    spinner.fail("Initialize: missing input file")
    process.exit(1)
  }

  spinner.succeed()
  spinner.start("Generate tasks")

  const context = {
    out,
    spinner,
    bijective: argv.bijective,
    osmChange: argv.osc,
    josmChange: argv.josm,
    rfc7464: argv.rfc7464,
  }
  try {
    for (let i = 0; i < argv.inputFiles.length; i++) {
      context.filename = argv.inputFiles[i]

      // If user hasn't forced an input type, determine from file extension
      if (!context.osmChange && !context.josm) {
        if (context.filename.toLowerCase().endsWith(".osc")) {
          context.osmChange = true
        }
      }

      const changeData = readFileSync(context.filename)
      await generateCooperativeWork(context, changeData.toString())
    }
    spinner.succeed()
  }
  catch (exception) {
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
