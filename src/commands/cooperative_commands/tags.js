const { DOMParser } = require('xmldom')
const xmlToJSON = require('xmlToJSON')
const _fromPairs = require('lodash.frompairs')
const _isEqual = require('lodash.isequal')
const _differenceWith = require('lodash.differencewith')
const _differenceBy = require('lodash.differenceby')
const _pick = require('lodash.pick')
const _isFinite = require('lodash.isfinite')
const _flatten = require('lodash.flatten')
const fs = require('fs')
const Spinner = require('../../common/spinner')
const Utils = require('../../common/utils')
const Constants = require('../../common/constants')
const JOSMFileParser = require('../../common/josm_file_parser')
const OSCFileParser = require('../../common/osc_file_parser')

// Setup xmlToJSON make use of the DOMParser package since there's no browser
xmlToJSON.stringToXML = (string) => new DOMParser().parseFromString(string, 'text/xml')

// Kick off throttling of operations, one of which is executed every 250ms so as
// to not overwhelm the OSM API
Utils.startOperationRunner(250)

/**
 * Generate and write line-by-line GeoJSON entries describing each change,
 * including cooperative work for realizing the change, to the output stream
 * using the intermediate data structures from parseJOSMChanges
 */
const generateCooperativeWork = async (context, {changes, elementMaps, elementDataSetsByType, references}) => {
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
        id: Utils.idStringFor(currentChange),
      }
    }

    try {
      const dependentOperations = await operationsFor(currentChange, context)
      if (dependentOperations && dependentOperations.length > 0) {
        operation.data.operations = dependentOperations
      }
    }
    catch(exception) {
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
      operations: [ operation ],
    }

    const geometry = await Utils.geoJSONGeometryFor(currentChange, elementDataSetsByType)
    const geoJSON = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: Utils.geoJSONPropertiesFor(currentChange),
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
  if (change.operation === Constants.osm.operations.delete) {
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
  if (change.operation !== Constants.osm.operations.modify ||
      change.elementId < 0 ||
      (_isFinite(change.element.version) && change.element.version < 1)) {
    throw new Error("only tag changes are allowed. Use a changefile-style cooperative challenge for more complex edits.")
  }

  const priorData = await Utils.fetchReferencedElement(change)

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
  if (change.operation !== Constants.osm.operations.modify) {
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
      data: _fromPairs(toSet.map(tag => [tag.k, Utils.normalizeTagValue(tag.v)])),
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
  if (change.operation !== Constants.osm.operations.modify || change.elementId < 0) {
    return true
  }

  switch(change.elementType) {
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

// yargs command-module functions. See:
// https://github.com/yargs/yargs/blob/master/docs/advanced.md#providing-a-command-module
exports.command = 'tag [--out <challenge-file>] <input-files..>'

exports.describe = 'Tasks with tag-only fixes'

exports.builder = function(yargs) {
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
      const changeData = fs.readFileSync(context.filename)
      const parser = context.osmChange ? OSCFileParser : JOSMFileParser
      const parsed = await parser.parse(changeData)
      await generateCooperativeWork(context, parsed)
      spinner.succeed()
    }
  }
  catch(exception) {
    context.spinner.fail(`${context.filename}: ${exception.message}`)
    Utils.stopOperationRunner()
    process.exit(2)
  }

  // Clean up and shut down
  spinner.start('Finish up')
  out.end(() => {
    Utils.stopOperationRunner()
    spinner.succeed('Finish up')
    process.exit(0);
  })
}
