const glob = require('glob')
const Base64 = require('js-base64').Base64
const fs = require('fs')
const readline = require('readline')
const turf = require('@turf/turf')
const { v4: uuidv4 } = require('uuid')
const Spinner = require('../../common/spinner')
const Utils = require('../../common/utils')
const Constants = require('../../common/constants')
const JOSMFileParser = require('../../common/josm_file_parser')
const OSCFileParser = require('../../common/osc_file_parser')

function matchingTaskAttachment(context, task) {
  let property = context.property
  if (!property) {
    // If no property was specified, extract reference from file pattern
    const referencedProperty = /\{([^}]+)\}/.exec(context.filePattern)
    if (!referencedProperty) {
      throw new Error("A property must either be referenced in the file pattern or specified with --property")
    }

    property = referencedProperty[1]
  }
  const re = context.propertyPattern ? new RegExp(context.propertyPattern) : null
  let matchingFilename = null
  turf.propEach(task, properties => {
    if (properties[property]) {
      if (!re) {
        matchingFilename = context.filePattern.replace(`{${property}}`, properties[property])
        return
      }

      const match = properties[property].match(re)
      if (match) {
        // if no capture groups, just replace property reference with property value
        if (match.length === 1) {
          matchingFilename = context.filePattern.replace(`{${property}}`, properties[property])
        }
        else {
          let filename = context.filePattern

          // replace any property reference with just the captured data
          filename = filename.replace(`{${property}}`, match.slice(1).join(''))

          // replace any capture group references
          for (let i = 1; i < match.length; i++) {
            filename = filename.replace(new RegExp(`\\\\${i}`, 'g'), match[i])
          }
          matchingFilename = filename
        }
      }
    }
  })

  return matchingFilename
}

function autoDetectType(rawAttachment) {
  if (/<gpx /.test(rawAttachment)) {
    return { type: 'gpx', format: 'xml' }
  }

  if (/<osm /.test(rawAttachment)) {
    return { type: 'osm', format: 'xml' }
  }

  try {
    const jsonData = JSON.parse(rawAttachment)
    if (Constants.geoJSON.types.indexOf(jsonData.type) !== -1) {
      return { type: 'geojson', format: 'json' }
    }
  }
  catch(err) {} // ignore

  return null // auto-detection failed
}

function asAttachment(context, filename) {
  const rawAttachment = fs.readFileSync(filename, "utf8")
  if (context.asIs) {
    const attachment = JSON.parse(rawAttachment)
    if (!attachment.id) {
      attachment.id = uuidv4()
    }
    return attachment
  }

  const attachment = {
    id: uuidv4(),
    kind: context.kind,
    type: context.type,
    format: context.format,
  }

  if (!context.kind) {
    throw new Error("kind is required if as-is option is not used")
  }

  if (context.kind === 'blob') {
    if (context.encode || context.format === 'xml') {
      attachment.data = Base64.encode(rawAttachment)
      attachment.encoding = 'base64'
    }
    else {
      attachment.data = rawAttachment
    }
  }
  else {
    if (context.autoDetect) {
      const detectedType = autoDetectType(rawAttachment)
      if (!detectedType) {
        throw new Error(`Failed to auto-detect type of data for file "${filename}"`)
      }

      Object.assign(attachment, detectedType)
    }
    else if (!context.type) {
      throw new Error("type is required if auto-detect option is not used")
    }

    switch (attachment.type) {
      case 'geojson':
        attachment.data = JSON.parse(rawAttachment)
        if (!attachment.format) {
          attachment.format = 'json'
        }
        break
      case 'osm':
      case 'gpx':
        attachment.data = Base64.encode(rawAttachment)
        if (!attachment.format) {
          attachment.format = 'xml'
        }

        if (!attachment.encoding) {
          attachment.encoding = 'base64'
        }
        break
      default:
        throw new Error(`Unsupported type "${context.type}"`)
    }
  }

  return attachment
}

async function processLineByLine(context) {
  const rl = readline.createInterface({
    input: context.in,
    crlfDelay: Infinity, // Always treat \r\n as \n
  })

  for await (const line of rl) {
    // Strip leading RS character if present
    const normalizedLine = line[0] === Constants.controlChars.RS ? line.slice(1) : line
    const task = JSON.parse(normalizedLine)
    const attachmentName = matchingTaskAttachment(context, task)
    if (attachmentName) {
      const filenames = glob.sync(attachmentName)
      if (filenames.length > 0) {
        if (!task.attachments) {
          task.attachments = []
        }
        task.attachments = task.attachments.concat(
          filenames.map(filename => asAttachment(context, filename))
        )
      }
    }

    if (context.rfc7464) {
      context.out.write(Constants.controlChars.RS, "utf8")
    }
    context.out.write(JSON.stringify(task), "utf8")
    context.out.write("\n", "utf8")
  }
}

// yargs command-module functions. See:
// https://github.com/yargs/yargs/blob/master/docs/advanced.md#providing-a-command-module
exports.command = 'task [--out <challenge-file>] [--in <challenge-file>]'

exports.describe = 'Add attachments to tasks'

exports.builder = function(yargs) {
  return yargs
    .describe('in', 'challenge GeoJSON to which task attachments are to be added')
    .describe({
      'out': 'Output path for updated challenge GeoJSON file with task attachments',
    })
    .help()
}

exports.handler = async function(argv) {
  // Startup a progress spinner
  const spinner = new Spinner('Initialize', { quiet: argv.quiet }).start()

  // Setup read stream for input containing line-by-line GeoJSON entries
  const input = argv.in ? fs.createReadStream(argv.in) : process.stdin

  // Setup write stream for output containing line-by-line GeoJSON entries
  const out = argv.out ? fs.createWriteStream(argv.out) : process.stdout

  const context = {
    in: input,
    out,
    spinner,
    property: argv.property,
    propertyPattern: argv['property-pattern'],
    filePattern: argv['file-pattern'],
    asIs: argv['as-is'],
    kind: argv.kind,
    type: argv.type,
    format: argv.format,
    encode: argv.encode,
    autoDetect: argv['auto-detect'],
    rfc7464: argv.rfc7464,
  }

  spinner.succeed()
  try {
    spinner.start("Add attachments")
    await processLineByLine(context)
    spinner.succeed()
  }
  catch(exception) {
    spinner.fail(`Add attachments: ${exception.message}`)
    process.exit(2)
  }

  // Clean up and shut down
  spinner.start("Finish up")
  out.end(() => {
    spinner.succeed()
    process.exit(0);
  })
}
