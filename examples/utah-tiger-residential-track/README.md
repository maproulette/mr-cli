# Utah TIGER residential-to-track tag-fix example

This example builds a MapRoulette cooperative tag-fix challenge from a local
Geofabrik Utah PBF. It looks for candidate ways that are likely old TIGER road
imports:

- `highway=residential`
- `tiger:reviewed=no`
- no `name=*`

The proposed tag-only fix changes:

```text
highway=residential
```

to:

```text
highway=track
```

This is a candidate-generation example, not an automatic-edit recipe. The OSM
Wiki notes that TIGER overused `highway=residential`, especially in rural areas,
and that `highway=track` is appropriate for land-access roads such as farm,
forest, fire, conservation, desert, and mountain tracks. Mappers still need to
verify each task from imagery, local knowledge, or survey before applying it.

## Build the baseline from the Utah PBF

The commands assume the Utah PBF is present locally at:

```text
examples/utah-tiger-residential-track/work/utah-260912.osm.pbf
```

If needed, download a fresh one:

```sh
mkdir -p examples/utah-tiger-residential-track/work

curl -L \
  -o examples/utah-tiger-residential-track/work/utah-latest.osm.pbf \
  https://download.geofabrik.de/north-america/us/utah-latest.osm.pbf
```

If you use a fresh download instead of the dated local file, substitute
`utah-latest.osm.pbf` for `utah-260912.osm.pbf` below.

`osmium tags-filter` expressions are OR-style, so this uses staged filters to
model the AND conditions:

```sh
OSM_PBF=examples/utah-tiger-residential-track/work/utah-260912.osm.pbf

osmium tags-filter -R \
  -e examples/utah-tiger-residential-track/residential.osmium-tags \
  -o examples/utah-tiger-residential-track/work/residential-ways.osm.pbf \
  -O \
  "$OSM_PBF"

osmium tags-filter -R \
  -e examples/utah-tiger-residential-track/tiger-unreviewed.osmium-tags \
  -o examples/utah-tiger-residential-track/work/tiger-residential-ways.osm.pbf \
  -O \
  examples/utah-tiger-residential-track/work/residential-ways.osm.pbf

osmium tags-filter -R -i \
  -e examples/utah-tiger-residential-track/named-way.osmium-tags \
  -o examples/utah-tiger-residential-track/work/candidate-ways.osm.pbf \
  -O \
  examples/utah-tiger-residential-track/work/tiger-residential-ways.osm.pbf
```

The intermediate `candidate-ways.osm.pbf` intentionally contains only the
matching ways. Pull the full referenced geometry from the original PBF for the
mr-cli baseline:

```sh
osmium getid \
  -I examples/utah-tiger-residential-track/work/candidate-ways.osm.pbf \
  -r \
  -o examples/utah-tiger-residential-track/real-baseline.osm \
  -f osm \
  -O \
  "$OSM_PBF"
```

## Generate a proposed tag-only file

For this example, the proposed file is just the baseline with `highway=track` on
the candidate ways:

```sh
node -e "const fs=require('fs'); const i='examples/utah-tiger-residential-track/real-baseline.osm'; const o='examples/utah-tiger-residential-track/real-proposed.osm'; fs.writeFileSync(o, fs.readFileSync(i, 'utf8').replace(/<tag k=\"highway\" v=\"residential\"\\/>/g, '<tag k=\"highway\" v=\"track\"/>'))"
```

Then generate the line-by-line GeoJSON for MapRoulette:

```sh
npm run mr -- --quiet cooperative tag \
  --baseline examples/utah-tiger-residential-track/real-baseline.osm \
  --out examples/utah-tiger-residential-track/real-out.geojson \
  examples/utah-tiger-residential-track/real-proposed.osm
```

With `utah-260912.osm.pbf`, this produced 688 candidate tasks.
