import { commands } from './attach_commands/index.mjs';

export const command = 'attach <command> [--out <challenge-file>]';
export const desc = 'Attach data to tasks';

export const builder = (yargs) => {
  return yargs
    .string('property')
    .describe('property', 'Task property to reference for attachment matching')
    .string('property-pattern')
    .describe('property-pattern', 'Regex to select parts of property value to use when matching')
    .string('file-pattern')
    .describe('file-pattern', 'Filename pattern for matching attachments to tasks via property value')
    .boolean('as-is')
    .describe('as-is', 'Use attachment file as-is (must be properly structured attachment JSON)')
    .string('kind')
    .describe('kind', 'Specify the kind of file (referenceLayer, blob, etc.)')
    .boolean('auto-detect')
    .describe('auto-detect', 'Auto-detect type of data (kind must still be specified)')
    .string('type')
    .describe('type', 'Specify the file type (geojson, osm, gpx, etc.)')
    .string('format')
    .describe('format', 'Specify the file format (xml, json, etc.)')
    .boolean('encode')
    .describe('encode', 'Base64-encode data (needed for blob kind with non-JSON data)')
    .demand('file-pattern')
    .commands(commands);
};

export const handler = (argv) => { };
