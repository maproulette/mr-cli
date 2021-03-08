const { DOMParser, XMLSerializer } = require("xmldom");
const xmlToJSON = require("xmltojson");
const _fromPairs = require("lodash.frompairs");
const _find = require("lodash.find");
const _filter = require("lodash.filter");
const Utils = require("./utils");
const Constants = require("./constants");

// Setup xmlToJSON make use of the DOMParser package since there's no browser
xmlToJSON.stringToXML = (string) =>
  new DOMParser().parseFromString(string, "text/xml");

const MRFileParser = {
  explode: async function (xmlString, atTopLevel = false) {
    const doc = new DOMParser().parseFromString(xmlString);
    const lineItems = doc.getElementsByTagName("RS");
    const actionNodes = [];

    for (let i = 0; i < lineItems.length; i++) {
      const currentNode = lineItems.item(i);
      actionNodes.push(JSON.parse(currentNode.nextSibling.nodeValue));
    }

    return actionNodes;
  },
};

module.exports = MRFileParser;
