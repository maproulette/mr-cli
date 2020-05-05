const { DOMParser, XMLSerializer } = require('xmldom')
const xmlToJSON = require('xmlToJSON')
const _fromPairs = require('lodash.frompairs')
const _find = require('lodash.find')
const _filter = require('lodash.filter')
const Utils = require('./utils')
const Constants = require('./constants')

// Setup xmlToJSON make use of the DOMParser package since there's no browser
xmlToJSON.stringToXML = (string) => new DOMParser().parseFromString(string, 'text/xml')

const JOSMFileParser = {
  /**
   * Parse JSON representation of JOSM change file, returning intermediate data
   * structures used for conversion
   */
  parse: async function(josmData) {
    const json = Utils.normalizeAttributes(xmlToJSON.parseString(josmData.toString()))

    const elementMaps = {
      node: new Map(),
      way: new Map(),
      relation: new Map()
    }
    const changes = []
    const references = []

    const data = json.osm[0]
    const elementDataSets = ['node', 'way', 'relation'].map(
      elementType => ({elementType, map: elementMaps[elementType], elements: data[elementType]})
    )

    elementDataSets.forEach((elementSet, index) => {
      if (elementSet.elements) {
        elementSet.elements.forEach(element => {
          elementSet.map.set(element.id, element)
          // Treat negative ids as automatic modify action even if action attribute is missing
          const action =
            element.action ?
            element.action :
            (element.id < 0 ? Constants.osm.operations.modify : null)

          if (action) {
            changes.push([{
              elementType: elementSet.elementType,
              elementId: element.id,
              element,
              operation: action,
            }])

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
          }
        })
      }
    })

    // Build array of top-level elements that aren't referenced by other
    // elements
    const topLevelElements = []
    const topLevelElementTypedIds = new Set()
    changes.forEach(changeElements => {
      changeElements.forEach(element => {
        const isReferenced = _find(references, ref =>
          ref.elementType === element.elementType && ref.elementId === element.elementId
        )

        if (!isReferenced) {
          topLevelElements.push(element)
          topLevelElementTypedIds.add(`${element.elementType}/${element.elementId}`)
        }
      })
    })

    return ({
      elementMaps,
      elementDataSetsByType: _fromPairs(elementDataSets.map(es => [es.elementType, es])),
      changes,
      references,
      topLevelElements,
      topLevelElementTypedIds,
    })
  },

  /**
   * Explode a single JOSM change XML document with multiple changes into
   * multiple XML documents, with one change per document (plus OSM elements
   * referenced by the change)
   */
  explode: async function(xmlString, atTopLevel=false) {
    // Note that "nodes" here refer to XML nodes, not OSM nodes
    const doc = new DOMParser().parseFromString(xmlString)
    const parentNode = doc.getElementsByTagName('osm').item(0)

    const nodesById = new Map()
    const supportingNodeReferences = new Set()
    const actionNodes = []
    for (let i = 0; i < parentNode.childNodes.length; i++) {
      const currentNode = parentNode.childNodes.item(i)

      // skip extraneous XML nodes, such as text nodes
      if (currentNode.nodeName !== 'node' &&
          currentNode.nodeName !== 'way' &&
          currentNode.nodeName !== 'relation') {
        continue
      }

      // If an XML node has a negative id, but no action attribute, normalize it
      // to have an action attribute
      if (!currentNode.attributes.getNamedItem('action') &&
          parseInt(currentNode.attributes.getNamedItem('id').nodeValue) < 0 ) {
        const normalizedAction = doc.createAttribute("action")
        normalizedAction.value = Constants.osm.operations.modify // JOSM uses modify for creates
        currentNode.attributes.setNamedItem(normalizedAction)
      }

      if (currentNode.attributes.getNamedItem('action')) {
        // XML nodes with an action attribute will become candidates for separate docs
        actionNodes.push(currentNode)
        for (let j = 0; j < currentNode.childNodes.length; j++) {
          supportingNodeReferences.add(
            Utils.supportingNodeReference(currentNode.childNodes.item(j))
          )
        }
      }

      nodesById.set(
        `${currentNode.nodeName}/${currentNode.attributes.getNamedItem('id').nodeValue}`,
        currentNode
      )
    }

    // By default, generate a document for each modified XML node. However, if
    // atTopLevel is true, then generate docs only for top-level changes (that
    // is, modified nodes not referenced by other nodes)
    let docNodes = actionNodes
    if (atTopLevel) {
      docNodes = _filter(actionNodes, node =>
        !supportingNodeReferences.has(`${node.nodeName}/${node.attributes.getNamedItem('id').nodeValue}`)
      )
    }

    const serializer = new XMLSerializer()
    const separateDocs = []
    docNodes.forEach(node => {
      const change =
        "<?xml version='1.0' encoding='UTF-8'?>\n" +
        "<osm version='0.6' generator='JOSM'>\n" +
          Utils.serializeSupportingNodes(node, nodesById, serializer) +
          serializer.serializeToString(node) + "\n" +
        "</osm>"

      separateDocs.push(change)
    })

    return separateDocs
  },
}

module.exports = JOSMFileParser
