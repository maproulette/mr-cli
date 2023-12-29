import { createWriteStream, readFileSync } from 'fs'
import _differenceBy from 'lodash.differenceby'
import _differenceWith from 'lodash.differencewith'
import _flatten from 'lodash.flatten'
import _fromPairs from 'lodash.frompairs'
import _isEqual from 'lodash.isequal'
import _isFinite from 'lodash.isfinite'
import JOSMFileParser from '../../common/josm_file_parser.mjs'
import OSCFileParser from '../../common/osc_file_parser.mjs'
import Spinner from '../../common/spinner.mjs'
import Utils from '../../common/utils.mjs'

// Kick off throttling of operations, one of which is executed every 250ms so as
// to not overwhelm the OSM API
Utils.startOperationRunner(250)

/**
 * Generate and write line-by-line GeoJSON entries describing each change,
 * including cooperative work for realizing the change, to the output stream
 * using the intermediate data structures from parseJOSMChanges
 */
const generateCooperativeWork = async (context, { changes, elementMaps, elementDataSetsByType, references }) => {
  // Tag fixes can only reference a single element per change, so flatten the
  // changes
  const allChanges = _flatten(changes)
  context.spinner.start(`${context.filename}: ${0}/${allChanges.length} elements`)

  for (let i = 0; i < allChanges.length; i++) {
    context.spinner.start(`${context.filename}: ${i}/${allChanges.length} elements`)
    const currentChange = allChanges[i]
    const operation = {
      operationType: operationTypeFor(currentChange),
      data: {
        id: idStringFor(currentChange),
      }
    }

    try {
      const dependentOperations = await operationsFor(currentChange, context)
      if (dependentOperations && dependentOperations.length > 0) {
        operation.data.operations = dependentOperations
      }
    }
    catch (exception) {
      // If user wants to skip missing, just ignore
      if (context.skip) {
        context.spinner.warn(`Skipping: ${exception.message}`)
        continue
      }
      else {
        throw exception
      }
    }

    const cooperativeWork = {
      meta: {
        version: 2,
        type: Constants.cooperativeType.tags,
      },
      operations: [operation],
    }

    const geometry = await geoJSONGeometryFor(currentChange, elementDataSetsByType)
    const geoJSON = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: geoJSONPropertiesFor(currentChange),
        geometry,
      }],
      cooperativeWork,
    }

    if (context.rfc7464) {
      // RFC 7464 start of sequence
      context.out.write(Constants.controlChars.RS, "utf8")
    }
    context.out.write(JSON.stringify(geoJSON), "utf8")
    context.out.write("\n", "utf8")
  }

  context.spinner.text = `${context.filename}: ${allChanges.length}/${allChanges.length} elements`
}

/**
 * Determines the needed independent operation for the given change
 */
const operationTypeFor = change => {
  if (change.operation === osm.operations.delete) {
    return 'deleteElement'
  }
  else if (change.element.id < 0) {
    return 'createElement'
  }
  else {
    return 'modifyElement'
  }
}

/**
 * Generates and returns an array of dependent operations needed based on a
 * diff of the element referenced by the given change and the data contained in
 * the change
 */
const operationsFor = async change => {
  if (change.operation !== osm.operations.modify ||
    change.elementId < 0 ||
    (_isFinite(change.element.version) && change.element.version < 1)) {
    throw new Error("only tag changes are allowed. Use a changefile-style cooperative challenge for more complex edits.")
  }

  const priorData = await fetchReferencedElement(change)

  if (hasGeometryChanges(priorData, change)) {
    throw new Error("only tag changes are allowed. Use a changefile-style cooperative challenge for more complex edits.")
  }

  return tagChangeOperations(priorData, change)
}

/**
 * Generates and returns an array of tag-change operations needed for the given
 * change
 */
const tagChangeOperations = (priorData, change) => {
  // Nothing to do for element deletions
  if (change.operation !== osm.operations.modify) {
    return []
  }

  let toSet = null
  let toUnset = null
  if (change.elementId < 0) {
    // New node, all element tags are new
    toSet = change.element.tag
  }
  else {
    if (!priorData) {
      throw new Error("missing prior data for existing element")
    }

    if (!_isEqual(priorData.tag, change.element.tag)) {
      toSet = _differenceWith(change.element.tag, priorData.tag, _isEqual)
      toUnset = _differenceBy(priorData.tag, change.element.tag, 'k')
    }
  }

  const operations = []
  if (toSet && toSet.length > 0) {
    operations.push({
      operation: "setTags",
      data: _fromPairs(toSet.map(tag => [tag.k, normalizeTagValue(tag.v)])),
    })
  }

  if (toUnset && toUnset.length > 0) {
    operations.push({
      operation: "unsetTags",
      data: toUnset.map(tag => tag.k),
    })
  }

  return operations
}

/**
 * Determines if the given change contains any geometry changes
 */
const hasGeometryChanges = (priorData, change) => {
  // New or deleted elements
  if (change.operation !== osm.operations.modify || change.elementId < 0) {
    return true
  }

  switch (change.elementType) {
    case 'node':
      if (priorData.lat !== change.element.lat || priorData.lon !== change.element.lon) {
        return true
      }
      break
    case 'way':
      if (!_isEqual(priorData.nd, change.element.nd)) {
        return true
      }
      break
    case 'relation':
      if (!_isEqual(priorData.member, change.element.member)) {
        return true
      }
      break
    default:
      throw new Error(`unrecognized element type ${change.elementType}`)
  }

  return false
}

export const command = 'tag [--out <challenge-file>] <input-files..>'

export const describe = 'Tasks with tag-only fixes'

export function builder(yargs) {
  return yargs
    .positional('input-files', {
      describe: 'One or more JOSM .osm files to process',
    })
    .describe({
      'out': 'Output path for MapRoulette challenge GeoJSON file',
    })
    .boolean('skip')
    .describe('skip', 'Skip problematic elements when possible')
    .help()
}

export async function handler(argv) {
  // Startup a progress spinner
  const spinner = new Spinner('Initialize', { quiet: argv.quiet }).start()

  // Point to different OSM server if needed
  if (argv.dev) {
    osmServer = osm.devServer
  }

  // Setup write stream for output containing line-by-line GeoJSON entries
  const out = argv.out ? createWriteStream(argv.out) : process.stdout

  // Read the input file(s) and kick things off
  if (!argv.inputFiles || argv.inputFiles.length === 0) {
    spinner.fail("Initialize: missing input file")
    process.exit(1)
  }

  const context = {
    out,
    spinner,
    osmChange: argv.osc,
    josmChange: argv.josm,
    skip: argv.skip,
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
      const parser = context.osmChange ? OSCFileParser : JOSMFileParser
      const parsed = await parser.parse(changeData)
      await generateCooperativeWork(context, parsed)
      spinner.succeed()
    }
  }
  catch (exception) {
    context.spinner.fail(`${context.filename}: ${exception.message}`)
    stopOperationRunner()
    process.exit(2)
  }

  // Clean up and shut down
  spinner.start('Finish up')
  out.end(() => {
    stopOperationRunner()
    spinner.succeed('Finish up')
    process.exit(0);
  })
}
