# mr-cli MapRoulette Command Line Interface Utility

The mr-cli package provides a `mr` command-line utility intended to offer
various tools for working with [MapRoulette](https://maproulette.org). At the
moment, only generation of cooperative challenge GeoJSON is supported, but
additional tools and features are planned for the future.

Use `mr --help` for a list of top-level commands, and `mr <command> --help` for
usage and options available for a specific command.


## Prerequisites
- [Node.js](https://nodejs.org) (v12.15 LTS or higher)
- [npm](http://npm.js)


## Installation
Installing globally allows you to run the `mr` command from anywhere.

```
npm install -g @maproulette/mr-cli
```

## Upgrading
Repeating the installation command will upgrade a global copy to the latest
version.

```
npm install -g @maproulette/mr-cli
```


## Creating Cooperative Challenges
Cooperative challenges associate existing, uncomitted, in-progress work with
each task. That work is then presented to MapRoulette mappers for final
completion or verification.

The `mr cooperative` command can be used to generate GeoJSON with cooperative tasks
suitable for upload to MapRoulette during creation of a new challenge. It
requires the desired type of cooperative tasks to be specified: `change` for
standard cooperative tasks with attached change files, which allows for inclusion
of unrestricted edits; or `tag` for special tag-only fixes that can be
completed and committed to OpenStreetMap fully within MapRoulette without need
for an external editor.

One or more change files -- either saved
[JOSM (.osm)](https://wiki.openstreetmap.org/wiki/JOSM_file_format) files or
[OSMChange (.osc)](https://wiki.openstreetmap.org/wiki/OsmChange) files --
must be given as the final parameter to the `mr cooperative` command. The
files will be processed and "line-by-line GeoJSON" suitable for uploading to
MapRoulette during challenge creation will be output.

By default, the GeoJSON is written to the standard output. You can easily
specify the name of an output file instead with the `--out` parameter.

> :warning: the `mr cooperative` command is **HIGHLY EXPERIMENTAL**. Please
> carefully and diligently inspect the generated tasks as this tool almost
> certainly contains bugs


### JOSM Workflow
1. Make edits in JOSM
2. Save file -- **don't** upload to OSM. If you want full control over which
   edits go into each task, save the work for each task into its own file
3. Use `mr cooperative` with your saved JOSM file(s) to generate a MapRoulette
   challenge file
4. Create a new MapRoulette challenge and choose to upload a local file,
   providing the challenge file


### Generating Cooperative Tasks with Attached Change Files
Basic Syntax:

```
mr cooperative change [--out <challenge-file>] [--bijective] [--dev] <input-files..>
```

To generate a standard cooperative challenge with tasks containing unrestricted
changes represented by one or more change files (either JOSM .osm or OSMChange
.osc), use the `mr cooperative change` command. The work-in-progress changes
will be served to the mapper in their editor during task completion so that
they can finish or verify the work. Final work is then saved to OSM by the
mapper through their editor just as they would for their own edits in a normal
task.

JOSM files do not organize individual edits into groups, so, by default, each
*top-level modification* found in the JOSM file(s) (that is, modifications not
referenced by other modifications in the same file) will be represented as a
single task in the challenge file. For example, if the file contained new
buildings where each building had new nodes and a new way that referenced those
nodes as members, then tasks would only be created for the new ways (and not
the new nodes since they are referenced by the ways).

If you need more control over which modifications are grouped into which task,
then save each group of related modifications into its own file and use the
`--bijective` option to create one task per file.

OSMChange (.osc) files do allow for some basic grouping of individual
modifications, and so all edits in each "action" group will be represented as a
single task. For more control, separate the related modifications into their
own files and use the `--bijective` option, just as with JOSM files.

Sometimes elements in a change file reference other elements for which the data
isn't included in the file. `mr` often needs the data in order to generate
correct GeoJSON geometry for the task, and so in that case it will contact OSM
and fetch the referenced element data when needed.

> If your change file is based on data from the OSM dev servers, then you also
> need to add the `--dev` flag so that the OSM dev servers are contacted
> instead of the production servers

#### Example 1: Adding new, unrelated OSM nodes
Assume some new benches (nodes) are to be added. As each edit (node addition)
stands on its own, we can save all of these together in a single JOSM file if
desired, and will have every edit turned into a separate MapRoulette task.

We will read input data from a `new_benches.osm` JOSM file we saved and have
the outputted challenge GeoJSON saved to a file called
`new_bench_challenge.json`.

```
mr cooperative change --out new_bench_challenge.json new_benches.osm
```

#### Example 2: Adding related, heirarchical modifications
Now we wish to add some buildings, which will include new nodes and a way for
each building. Even though each building contains multiple new OSM elements --
nodes and a way -- these additions are heirarchical, with the nodes playing a
supporting role for the way. `mr` will generate new tasks only for the top-level
changes (the ways in this case), and will simply bundle in the supporting changes
(the nodes) rather than creating separate tasks for them.

```
mr cooperative change --out new_buildings_challenge.json new_buildings.osm
```

#### Example 3: Manually grouping related modifications together
Sometimes the default behavior doesn't group modifications into tasks quite the
way you'd like, and so full control over which modifications end up together in
each task is needed. This can be done by saving each group of related
modifications together into its own file and then feeding all the files in with
the `--bijective` option to create a one-to-one mapping from files to tasks in
the outputted GeoJSON. This gives you complete control over what ends up in
each task.

One real-world example at the time of writing would be adjusting building
outlines by repositioning their nodes. Since the building's way is not itself
part of the changes -- only the nodes -- each modified node will be top-level
and, therefore, would by default become a separate task. The `mr` tool isn't
smart enough (yet!) to realize that multiple modified nodes are part of the
same (unmodified) way and should perhaps be grouped together. We obviously
don't want a separate task for each node in this case, so the solution is to
save each modified building into its own file and use the `--bijective` option.

We'll assume we saved our files as `building_1.osm`, `building_2.osm`,
etc. The naming doesn't matter as long as you can easily reference all the
files -- we'll do so here using wildcards. We'll save the challenge GeoJSON to
a file called `outlines_challenge.json`.

```
mr cooperative change --out outlines_challenge.json --bijective building*.osm
```


### Generating Cooperative Tasks with Tag-Only Fixes
Basic Syntax:

```
mr cooperative tag [--out <challenge-file>] [--dev] <input-files..>
```

If your changes consist purely of tag fixes, an alternative "tag fix" (formerly
quick fix) style cooperative challenge can be generated instead with the `mr
cooperative tag` command. MapRoulette will present the proposed tag changes to
mappers during task completion and allow them to approve or reject the changes
within MapRoulette, as well as modify the tags if needed. Approved changes are
submitted directly to OSM by MapRoulette itself, removing the need for external
editors.

One or more change files must be provided. Note that only one edit can be
represented by each tag fix cooperative task, so each modification found in the
change file(s) will be represented as a single task in the challenge file.
There is no ability to manually group edits for tag fix tasks, and any grouping
in an OSMChange file will be ignored.

Tag-fixes for each task are computed by comparing the proposed state in the
change file with the versions of OpenStreetMap data *referenced in the file*
(which may not necessarily be the very latest version at the time `mr` is run)
and then analyzing the differences.

> If your change file is based on data from the OSM dev servers, then you also
> need to add the `--dev` flag so that the OSM dev servers are contacted
> instead of the production servers

When the tag fix is presented to a mapper in MapRoulette, the latest OSM data
will first be fetched so that only pertinent tag changes are shown to the
mapper.


## Additional Notes
- The `mr cooperative` command usually needs to contact the OSM servers when
generating tasks and thus needs internet access to run. To play nice with OSM
servers, at most 4 network requests per second will be made.

- Generated challenge files use a
[line-by-line](https://github.com/osmlab/maproulette3/wiki/Line-by-Line-GeoJSON-Format)
format that is well suited to streaming, whereby each line in the file contains a
complete GeoJSON object representing a single task in the challenge. It may not be
possible to open or manipulate this file using traditional GeoJSON tools

- This utility has not been tested on Windows


## Development
1. Clone the repo
2. `npm install` to install NPM packages

Run with `npm run mr -- <command>`. If you're writing to the standard output,
use `npm --silent run mr` so that the generated GeoJSON isn't polluted with
status messages from NPM.
