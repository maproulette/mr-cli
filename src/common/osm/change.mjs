import { Builder, parseStringPromise } from 'xml2js';

export class OSMChange {
    constructor() {
        this.nodes = { new: [], modified: [] };
        this.ways = { new: [], modified: [] };
        this.relations = { new: [], modified: [] };
    }

    static async create(xmlData) {
        const instance = new OSMChange();
        if (instance.isJOSMFormat(xmlData)) {
            await instance.parseJOSMData(xmlData);
        } else {
            await instance.parseOSMChangeData(xmlData);
        }
        return instance;
    }

    async isJOSMFormat(xmlData) {
        // parse incoming data
        // check if root element is osmChange
        const parsedData = await parseStringPromise(xmlData);
        // if "osm" in parsedData return true
        return parsedData.osm
    }

    toXML(format = 'osc') {
        const builder = new Builder();
        // Conversion logic
    }

    async parseJOSMData(xmlData) {
        // get each child element of the osm root element
        return true;
    }

    async parseOSMChangeData(xmlData) {
        // get each child element of the osmChange root element
        return true;
    }


}
