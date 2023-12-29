import test from 'ava';

import { OSMChange } from '../src/common/osm/change.mjs';

// read in test data from data/josmchange.xml
import fs from 'fs';

const josmChangeData = fs.readFileSync(new URL('./data/josmchange.xml', import.meta.url));
const osmChangeData = fs.readFileSync(new URL('./data/osmchange.xml', import.meta.url));

test('OSMChange.create', async t => {
    const osm_change = await OSMChange.create(osmChangeData);
    t.is(osm_change.constructor.name, 'OSMChange');
});

// test initialize with josm change data
test('OSMChange.create with josm change data', async t => {
    const osm_change = await OSMChange.create(josmChangeData);
    t.is(osm_change.constructor.name, 'OSMChange');
});

// test initialize with osm change data
test('OSMChange.create with osm change data', async t => {
    const osm_change = await OSMChange.create(osmChangeData);
    t.is(osm_change.constructor.name, 'OSMChange');
});