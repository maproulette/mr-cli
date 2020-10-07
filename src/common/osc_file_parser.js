const { DOMParser, XMLSerializer } = require('xmldom')
const xmlToJSON = require('xmltojson')
const _fromPairs = require('lodash.frompairs')
const _find = require('lodash.find')
const _flatten = require('lodash.flatten')
const Utils = require('./utils')
const Constants = require('./constants')

// Setup xmlToJSON make use of the DOMParser package since there's no browser
xmlToJSON.stringToXML = (string) => new DOMParser().parseFromString(string, 'text/xml')

const OSCFileParser = {
  /**
   * Parse OSMChange (.osc) change file, returning intermediate data structures
   * used for conversion
   */
  parse: async function(oscData) {
    const json = Utils.normalizeAttributes(xmlToJSON.parseString(oscData.toString()))
    const elementMaps = {
      node: new Map(),
      way: new Map(),
      relation: new Map()
    }
    const changes = []
    const references = []

    const data = json.osmChange[0]
    const operations = ['modify', 'create', 'delete']
    const elementTypes = ['node', 'way', 'relation']
    operations.forEach(operation => {
      if (!data[operation] || data[operation].length === 0) {
        return
      }

      data[operation].forEach(change => {
        const changeElements = []
        elementTypes.forEach(elementType => {
          if (!change[elementType]) {
            return
          }

          change[elementType].forEach(element => {
            elementMaps[elementType].set(element.id, element)
            changeElements.push({elementType, elementId: element.id, element, operation})

            if (element.nd) {
              element.nd.forEach(nodeRef => {
                references.push({elementType: 'node', elementId: nodeRef.ref})
              })
            }
            else if (element.member) {
              element.member.forEach(member => {
                references.push({elementType: member.type, elementId: member.ref})
              })
            }
          })
        })

        if (changeElements.length > 0) {
          changes.push(changeElements)
        }
      })
    })

    const elementDataSets = elementTypes.map(elementType => ({
      elementType,
      map: elementMaps[elementType],
      elements: Array.from(elementMaps[elementType].values()),
    }))

    // Build array of top-level elements that aren't referenced by other
    // elements
    const topLevelElements = []
    changes.forEach(changeElements => {
      changeElements.forEach(element => {
        const isReferenced = _find(references, ref =>
          ref.elementType === element.elementType && ref.elementId === element.elementId
        )

        if (!isReferenced) {
          topLevelElements.push(element)
        }
      })
    })

    return ({
      elementMaps,
      elementDataSetsByType: _fromPairs(elementDataSets.map(es => [es.elementType, es])),
      changes,
      references,
      topLevelElements,
    })
  },

  /**
   * Explode a single OSMchange XML document with multiple changes into
   * multiple XML documents, with one change per document
   */
  explode: async function(xmlString) {
    // Note that "nodes" here refer to XML nodes, not OSM nodes
    const doc = new DOMParser().parseFromString(xmlString)
    const serializer = new XMLSerializer()
    const separateChanges = []

    const parentNode = doc.getElementsByTagName('osmChange').item(0)
    for (let i = 0; i < parentNode.childNodes.length; i++) {
      const currentNode = parentNode.childNodes.item(i)

      // skip extraneous XML nodes, such as text nodes
      if (currentNode.nodeName !== 'modify' &&
          currentNode.nodeName !== 'create' &&
          currentNode.nodeName !== 'delete') {
        continue
      }

      const change =
        "<?xml version='1.0' encoding='UTF-8'?>\n" +
        "<osmChange version='0.6'>\n" +
          serializer.serializeToString(currentNode) + "\n" +
        "</osmChange>"

      separateChanges.push(change)
    }

    return separateChanges
  },

  josmToOSC: function(xmlString) {
    const doc = new DOMParser().parseFromString(xmlString)
    const serializer = new XMLSerializer()
    const changeOperations = []

    const parentNode = doc.getElementsByTagName('osm').item(0)
    for (let i = 0; i < parentNode.childNodes.length; i++) {
      const currentNode = parentNode.childNodes.item(i)

      // skip extraneous XML nodes, such as text nodes
      if (currentNode.nodeName !== 'node' &&
          currentNode.nodeName !== 'way' &&
          currentNode.nodeName !== 'relation') {
        continue
      }

      // XML nodes with an action attribute will become osmChange operations
      const action = currentNode.attributes.getNamedItem('action')
      if (action) {
        let operationType = action.value

        // osmChange doesn't use action attributes
        currentNode.attributes.removeNamedItem('action')

        // JOSM uses `modify` actions for creation as well, but osmChange uses
        // `create`. So switch if we're creating elements (ids are negative)
        if (operationType === Constants.osm.operations.modify) {
          const nodeId = currentNode.attributes.getNamedItem('id').value
          if (parseInt(nodeId) < 0) {
            operationType = Constants.osm.operations.create
          }
        }

        changeOperations.push({operationType, node: currentNode})
      }
    }

    const oscLines = [
      "<?xml version='1.0' encoding='UTF-8'?>",
      "<osmChange version='0.6'>",
    ].concat(_flatten(changeOperations.map(operation => [
      `  <${operation.operationType}>`,
      '  ' + serializer.serializeToString(operation.node),
      `  </${operation.operationType}>`
    ]))).concat([
      "</osmChange>"
    ])

    return oscLines.join("\n")
  },
}

module.exports = OSCFileParser
