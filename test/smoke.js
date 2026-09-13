const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const mr = path.join(root, 'src', 'index.js')

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mr-cli-test-'))
}

function runMr(args) {
  return execFileSync(mr, ['--quiet'].concat(args), {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function readTask(filename) {
  const raw = fs.readFileSync(filename, 'utf8').trim()
  return JSON.parse(raw.replace(/^\x1e/, ''))
}

function writeFile(filename, content) {
  fs.writeFileSync(filename, content.trimStart())
}

function assertChangeWorkflow() {
  const dir = tempDir()
  const input = path.join(dir, 'new-node.osm')
  const output = path.join(dir, 'new-node.geojson')
  writeFile(input, `
    <?xml version='1.0' encoding='UTF-8'?>
    <osm version='0.6' generator='smoke'>
      <node id='-1' action='modify' lat='40.7608' lon='-111.8910'>
        <tag k='amenity' v='bench'/>
      </node>
    </osm>
  `)

  runMr(['cooperative', 'change', '--out', output, input])

  const task = readTask(output)
  assert.strictEqual(task.features[0].geometry.type, 'Point')
  assert.strictEqual(task.features[0].properties.amenity, 'bench')
  assert.strictEqual(task.cooperativeWork.meta.type, 2)
}

function assertBaselineTagWorkflow() {
  const dir = tempDir()
  const baseline = path.join(dir, 'baseline.osm')
  const proposed = path.join(dir, 'proposed.osm')
  const output = path.join(dir, 'tag.geojson')

  writeFile(baseline, `
    <?xml version='1.0' encoding='UTF-8'?>
    <osm version='0.6' generator='smoke'>
      <node id='12106020' visible='true' version='15' lat='15.1760340' lon='120.5220963'>
        <tag k='crossing' v='uncontrolled'/>
        <tag k='crossing_ref' v='zebra'/>
        <tag k='highway' v='crossing'/>
      </node>
    </osm>
  `)

  writeFile(proposed, `
    <?xml version='1.0' encoding='UTF-8'?>
    <osm version='0.6' generator='smoke'>
      <node id='12106020' visible='true' version='15' lat='15.1760340' lon='120.5220963'>
        <tag k='crossing' v='marked'/>
        <tag k='highway' v='crossing'/>
        <tag k='source' v='survey'/>
      </node>
    </osm>
  `)

  runMr(['cooperative', 'tag', '--baseline', baseline, '--out', output, proposed])

  const task = readTask(output)
  const operations = task.cooperativeWork.operations[0].data.operations
  assert.deepStrictEqual(operations, [
    {
      operation: 'setTags',
      data: {
        crossing: 'marked',
        source: 'survey',
      },
    },
    {
      operation: 'unsetTags',
      data: ['crossing_ref'],
    },
  ])
}

function assertBaselineWayGeometryWorkflow() {
  const dir = tempDir()
  const baseline = path.join(dir, 'baseline-way.osm')
  const proposed = path.join(dir, 'proposed-way.osm')
  const output = path.join(dir, 'tag-way.geojson')

  writeFile(baseline, `
    <?xml version='1.0' encoding='UTF-8'?>
    <osm version='0.6' generator='smoke'>
      <node id='1' visible='true' version='1' lat='40.0' lon='-111.0'/>
      <node id='2' visible='true' version='1' lat='40.1' lon='-111.1'/>
      <way id='10' visible='true' version='3'>
        <nd ref='1'/>
        <nd ref='2'/>
        <tag k='highway' v='residential'/>
        <tag k='name' v='Old Road'/>
      </way>
    </osm>
  `)

  writeFile(proposed, `
    <?xml version='1.0' encoding='UTF-8'?>
    <osm version='0.6' generator='smoke'>
      <way id='10' visible='true' version='3'>
        <nd ref='1'/>
        <nd ref='2'/>
        <tag k='highway' v='residential'/>
        <tag k='name' v='New Road'/>
      </way>
    </osm>
  `)

  runMr(['cooperative', 'tag', '--baseline', baseline, '--out', output, proposed])

  const task = readTask(output)
  assert.strictEqual(task.features[0].geometry.type, 'LineString')
  assert.deepStrictEqual(task.features[0].geometry.coordinates, [
    [-111.0, 40.0],
    [-111.1, 40.1],
  ])
  assert.deepStrictEqual(task.cooperativeWork.operations[0].data.operations, [
    {
      operation: 'setTags',
      data: {
        name: 'New Road',
      },
    },
  ])
}

assertChangeWorkflow()
assertBaselineTagWorkflow()
assertBaselineWayGeometryWorkflow()
console.log('smoke tests passed')
