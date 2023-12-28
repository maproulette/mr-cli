import { parseStringPromise } from 'xml2js';
import turf from '@turf/turf';
import fetch from 'node-fetch';
import isPlainObject from 'lodash.isplainobject';
import transform from 'lodash.transform';
import fromPairs from 'lodash.frompairs';
import isFinite from 'lodash.isfinite';

import Constants from './constants.mjs';

const Utils = {
  /* Map of OSM data that caches specific versions of elements */
  versionedElements: new Map(),

  /* The OSM server to contact when retrieving data */
  osmServer: Constants.osm.productionServer,

  /* Queue of pending operations */
  throttledOperations: [],

  /* Handle for throttled operation execution interval */
  operationRunner: null,

  /**
   * Start execution of operations from the throttled operation queue. Does
   * nothing if the operations have already been started and not yet stopped
   */
  startOperationRunner: function(delay=250) {
    if (Utils.operationRunner) {
      return
    }

    Utils.operationRunner = setInterval(() => {
      if (Utils.throttledOperations.length > 0) {
        (Utils.throttledOperations.shift())()
      }
    }, delay)
  },

  /**
   * Stop execution of operations from the throttled operations queue.
   * Does nothing if the operations have already been stopped (or were
   * never started)
   */
  stopOperationRunner: function() {
    if (!Utils.operationRunner) {
      return
    }

    clearInterval(Utils.operationRunner)
    Utils.operationRunner = null
  },

  /**
   * Normalize the xmlToJSON representation of XML attributes into key/value
   * pairs that are a bit easier to use during the generation process
   */
  normalizeAttributes: function(json) {
    if (Array.isArray(json)) {
      return json.map(value => Utils.normalizeAttributes(value))
    }

    if (!isPlainObject(json)) {
      return json
    }

    return transform(json, (result, value, key) => {
      if (key === '_attr') {
        Object.keys(value).forEach(attrName => {
          result[attrName] = value[attrName]['_value']
        })
      }
      else if (key !== '_text') { // Text nodes aren't used for anything meaningful
        result[key] = Utils.normalizeAttributes(value)
      }
    })
  },

  /**
   * Normalize tag values, converting numeric values to strings
   */
  normalizeTagValue: function(value) {
    return isFinite(value) ? value.toString() : value
  },

  /**
   * Generates a node-type/elementId formatted id string for the element
   * referenced by the given change (e.g. "way/12345")
   */
  idStringFor: function(change) {
    return `${change.elementType}/${change.elementId}`
  },

  /**
   * Generate GeoJSON feature geometry describing the OSM element referenced by
   * the change
   */
  geoJSONGeometryFor: async function(change, elementDataSetsByType) {
    try {
      switch(change.elementType) {
        case 'node':
          return turf.geometry('Point', Utils.nodeCoords(change.element))
        case 'way':
          // Use Polygon if way is closed, else LineString
          const points = await Utils.wayCoords(change.element, elementDataSetsByType)
          if (points.length > 1 &&
              turf.booleanEqual(turf.point(points[0]), turf.point(points[points.length - 1]))) {
            return turf.geometry('Polygon', [ points ])
          }
          else {
            return turf.geometry('LineString', points)
          }
        case 'relation':
          return turf.geometry(
            'MultiLineString',
            await Utils.relationCoords(change.element, elementDataSetsByType)
          )
        default:
          throw new Error(`unrecognized element type ${change.elementType}`)
      }
    }
    catch(error) {
      throw new Error(
        `failed to generate geometry for ${change.elementType}/${change.elementId}: ${error.message}`
      )
    }
  },

  /**
   * Generate GeoJSON feature properties describing the tags of the change's
   * referenced OSM element
   */
  geoJSONPropertiesFor: function(change) {
    const properties =
      change.element.tag ?
      fromPairs(change.element.tag.map(tag => [tag.k, Utils.normalizeTagValue(tag.v)])) :
      {}
    properties['@id'] = Utils.idStringFor(change)

    return properties
  },

  /**
   * Return array with lon/lat of a node element
   */
  nodeCoords: function(element) {
    return ([ element.lon, element.lat ])
  },

  /**
   * Return array of coordinate pairs for a way element
   */
  wayCoords: async function(element, elementDataSetsByType) {
    const referencedNodeIds = element.nd.map(nodeRef => nodeRef.ref)
    const referencedNodes = await Utils.fetchMultipleElements(
      Constants.osm.elements.node,
      referencedNodeIds,
      elementDataSetsByType.node.map
    )

    return element.nd.map(nodeRef => {
      const nodeElement = referencedNodes.get(nodeRef.ref)
      if (!nodeElement) {
        throw new Error(`node data missing for referenced node ${nodeRef.ref}`)
      }

      return Utils.nodeCoords(nodeElement)
    })
  },

  /**
   * Return array of node coordinate pairs for members of a relation element
   */
  relationCoords: async function(element, elementDataSetsByType) {
    const referencedElementIds = {
      [Constants.osm.elements.node]: [],
      [Constants.osm.elements.way]: [],
      [Constants.osm.elements.relation]: [],
    }
    element.member.forEach(member => {
      if (member.type === Constants.osm.elements.relation) {
        throw new Error('super-relations are not currently supported')
      }

      referencedElementIds[member.type].push(member.ref)
    })

    const referencedElements = {}
    await Promise.all(Constants.osm.elements.all.map(elementType => {
      return new Promise(async resolve => {
        if (referencedElementIds[elementType].length === 0) {
          referencedElements[elementType] = new Map()
        }
        else {
          referencedElements[elementType] = await Utils.fetchMultipleElements(
            elementType,
            referencedElementIds[elementType],
            elementDataSetsByType[elementType].map
          )
        }
        resolve()
      })
    }))

    return Promise.all(element.member.map(async member => {
      const memberElement = referencedElements[member.type].get(member.ref)
      if (!memberElement) {
        throw new Error(`data missing for member ${member.type}/${member.ref}`)
      }

      switch (member.type) {
        case 'node':
          // treat as line string
          const coords = Utils.nodeCoords(memberElement)
          return Promise.resolve([ coords, coords ])
        case 'way':
          return await Utils.wayCoords(memberElement, elementDataSetsByType)
        case 'relation':
          throw new Error('super-relations are not currently supported')
      }
    }))
  },

  /**
   * Returns a `type/id` formatted reference to a supporting node or member
   * represented by the given supportingNode, or null if it does not represent
   * a supporting node or member
   */
  supportingNodeReference: function(supportingNode) {
    switch (supportingNode.nodeName) {
      case 'nd':
        return `node/${supportingNode.attributes.getNamedItem('ref').nodeValue}`
      case 'member':
        return
          supportingNode.attributes.getNamedItem('type').nodeValue + "/" +
          supportingNode.attributes.getNamedItem('ref').nodeValue
      default:
        return null
    }
  },

  /**
   * Serialize into an XML fragment all referenced OSM elements required by the
   * given XML node, recursing as necessary to pull in indirect references
   */
  serializeSupportingNodes: function(node, supportingNodesById, serializer) {
    let serialized = ""
    for (let i = 0; i < node.childNodes.length; i++) {
      const supportingReference = Utils.supportingNodeReference(node.childNodes.item(i))
      if (supportingReference) {
        const referenced = supportingNodesById.get(supportingReference)
        if (referenced) {
          // Before serializing this referenced node, recursively pull in any
          // nodes it might itself reference
          serialized +=
            Utils.serializeSupportingNodes(referenced, supportingNodesById, serializer) +
            serializer.serializeToString(referenced) + "\n"
        }
      }
    }

    return serialized
  },

  /**
   * Fetch OSM data for version of element referenced by the given change,
   * hitting the API if data isn't available locally
   */
  fetchReferencedElement: function(change) {
    return new Promise((resolve, reject) => {
      const versionId = `${change.elementType}/${change.elementId}/${change.element.version}`
      if (Utils.versionedElements.has(versionId)) {
        resolve(Utils.versionedElements.get(versionId))
        return
      }

      Utils.throttledOperations.push(() => {
        fetch(`${Utils.osmServer}/api/0.6/${versionId}`)
        .then(res => {
          if (!res.ok) {
            reject(new Error(`Failed to retrieve element version: ${versionId}`))
            return
          }

          res.text().then(async priorVersionXML => {
            const priorVersion = Utils.normalizeAttributes(await parseStringPromise(priorVersionXML.toString()))
            priorData = priorVersion.osm[0][change.elementType][0]

            Utils.versionedElements.set(versionId, priorData)
            resolve(priorData)
          })
        })
      })
    })
  },

  /**
   * Fetch OSM data for multiple elements of the same type, e.g. a set of
   * member nodes for a way, hitting the API if the data isn't available
   * locally
   */
  fetchMultipleElements: function(elementType, elementIds, localElements) {
    return new Promise((resolve, reject) => {
      const results = new Map()
      const neededElementIds = []

      elementIds.forEach(elementId => {
        const referenceId = `${elementType}/${elementId}`
        if (Utils.versionedElements.has(referenceId)) {
          results.set(elementId, Utils.versionedElements.get(referenceId))
        }
        else if (localElements && localElements.has(elementId)) {
          results.set(elementId, localElements.get(elementId))
        }
        else {
          neededElementIds.push(elementId)
        }
      })

      // If we were able to pull all data locally, we're done
      if (neededElementIds.length === 0) {
        resolve(results)
        return
      }

      // Fetch needed elements
      Utils.throttledOperations.push(() => {
        fetch(`${Utils.osmServer}/api/0.6/${elementType}s?${elementType}s=${neededElementIds.join(',')}`)
        .then(res => {
          if (!res.ok) {
            reject(new Error(`Failed to retrieve ${elementType}s: ${neededElementIds.join(',')}`))
          }

          res.text().then(xmlResponse => {
            const data = Utils.normalizeAttributes(xmlToJSON.parseString(xmlResponse.toString()))
            if (data.osm[0][elementType]) {
              data.osm[0][elementType].forEach(result => {
                Utils.versionedElements.set(`${elementType}/${result.id}`, result)
                results.set(result.id, result)
              })
            }
            resolve(results)
          })
        })
      })
    })
  },
}

export default Utils
