const Constants = Object.freeze({
  cooperativeType: Object.freeze({
    tags: 1,
    changeFile: 2,
  }),

  fileType: Object.freeze({
    xml: 'xml',
  }),

  format: Object.freeze({
    josm: 'josm',
    osmChange: 'osc',
  }),

  encoding: Object.freeze({
    base64: 'base64',
  }),

  osm: Object.freeze({
    productionServer: 'https://api.openstreetmap.org',
    devServer: 'https://master.apis.dev.openstreetmap.org',

    elements: Object.freeze({
      node: 'node',
      way: 'way',
      relation: 'relation',
      all: ['node', 'way', 'relation'],
    }),

    operations: Object.freeze({
      create: 'create',
      modify: 'modify',
      delete: 'delete',
    }),
  }),

  controlChars: Object.freeze({
    RS: String.fromCharCode(0x1E), // RS (record separator) control char
  }),

  geoJSON: Object.freeze({
    types: Object.freeze([ // https://tools.ietf.org/html/rfc7946#section-1.4
      "Point",
      "MultiPoint",
      "LineString",
      "MultiLineString",
      "Polygon",
      "MultiPolygon",
      "GeometryCollection",
      "Feature",
      "FeatureCollection",
    ]),
  }),
})

export default Constants