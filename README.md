# mr-cli MapRoulette Command Line Interface Utility

The mr-cli package provides a `mr` command-line utility intended to offer
various tools for working with [MapRoulette](https://maproulette.org).

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

> :warning: the `mr cooperative` command is **EXPERIMENTAL**. Please carefully
> and diligently inspect the generated tasks as this tool almost certainly
> contains bugs


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


## Attaching Data To Tasks

MapRoulette v3.6.5 and above support data attachments to tasks. Please see the
[MapRoulette
docs](https://learn.maproulette.org/documentation/task-attachments/)
for details on what kinds of attachments are supported.

The mr-cli utility can be used to add attachments to tasks in an existing
line-by-line GeoJSON file, producing a new GeoJSON file with the attachments
included.

Attachment files are matched to tasks based on specified feature properties,
attachment filenames, and optional match patterns.

Basic Syntax:

```
mr attach task [--in <challenge-file>] [--out <challenge-file>] <kind|as-is> <auto-detect|type> <file-pattern> [property-pattern] [property] [format] [encode]
```

#### Example 1: Attach GPX reference layers based on OSM id
Assume that we have a `my_challenge.geojson` file and that each task has an
`osmid` feature property formatted like `n1234`, `n5678`, etc., and that
our respective attachment files are named `attachment_n1234.gpx`,
`attachment_n5678.gpx`, and so on.

In order for mr-cli to know how to match up which file with which task, it's
necessary to provide a *file pattern* that shows mr-cli how to build the filename
for each task based on the value of a feature property. In this case, we need to
tell mr-cli to use the value of the `osmid` property in the filename, which we
can do by surrounding it with curly braces as so: `attachment_{osmid}.gpx`

> Note: only one property may be referenced in a filename pattern

So here is our full command. We'll output the updated challenge to an
`updated_challenge.geojson` and we'll also use the `--auto-detect` option to
automatically detect that we're working with GPX files.

```
mr attach task --in my_challenge.geojson --out updated_challenge.geojson --kind referenceLayer --auto-detect --file-pattern 'attachment_{osmid}.gpx'
```

#### Example 2: Attaching multiple reference layers to tasks
Building on Example 1 above, the file pattern can include wildcard characters
that can be used to match multiple files. All matching files will be included
as attachments. Perhaps we have both a GPX layer and an OSM layer for each task.

> :warning: to match different types of files you **must** use the `--auto-detect`
> option. If an explicit type is specified instead, all matching files will be
> treated as that type

Our command is the same as in example 1, but includes a `*` for the file
extension to potentially match multiple files per osmid:

> Patterns should be surrounded by single quotes when used on the command line
> to avoid potential conflicts with special shell characters

```
mr attach task --in my_challenge.geojson --out updated_challenge.geojson --kind referenceLayer --auto-detect --file-pattern 'attachment_{osmid}.*'
```

#### Example 3: Extracting only relevant parts of property value
Building on Example 1, what if our `osmid` property was instead formatted
as `node/1234`, `node/4567` while our files were still named `attachment_n1234.gpx`,
`attachment_n5678.gpx`, and so on? We'll need to extract the first letter of the
type as well as the numeric id. mr-cli makes that possible through *property
patterns*.

Property patterns are standard [regular
expressions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Cheatsheet),
and you can use capture groups (parentheses) to extract just parts of the
property value. Only the captured parts will be substituted into the filename
pattern (in the order in which they are captured).

Here is a regular expression that will capture the first letter ("word" character),
ignore everything that follows that isn't a digit, and then capture all the remaining
digits: `(\w)[^\d]+(\d+)`

> Note: when a property pattern is used, only tasks with a matching value will
> be considered. That means property patterns can also be used to limit
> attachments to matching tasks even if you don't need to use capture groups

We'll use this in our command. This is the same command as in Example 1 except now
we specify a `--property-pattern` option with our regular expression

> Note: backslashes need to be escaped when used on the command line and
> therefore appear as `\\` when regular expressions are shown in example mr-cli
> commands

```
mr attach task --in my_challenge.geojson --out updated_challenge.geojson --kind referenceLayer --auto-detect --property-pattern '(\\w)[^\\d]+(\\d+)' --file-pattern 'attachment_{osmid}.gpx'
```

#### Example 4: More control over the filename pattern
In Example 3, we were able to continue referencing `{osmid}` in our filename
pattern because we were lucky to want exactly the captured data in exactly the
order it appeared in the property value. That may not always be the case, and
it can be useful to have more control over where each captured portion of the
property value appears in your filename.

Building on Example 3, let's assume our filenames are instead named
`attachment_node_1234.gpx`, `attachment_node_4567.gpx`, etc. We now need to
capture the full OSM type and the numeric id, but separate them with an
underscore in the filename pattern.

Our updated property pattern: `(\w+)[^\d]+(\d+)`
Our updated filename pattern: `attachment_\1_\2.gpx`

Since our filename pattern no longer refers to `osmid` explicitly, we also need
to provide a `--property` option that tells mr-cli to look at the `osmid`
property.

```
mr attach task --in my_challenge.geojson --out updated_challenge.geojson --kind referenceLayer --auto-detect --property osmid --property-pattern '(\\w+)[^\\d]+(\\d+)' --file-pattern 'attachment_\\1_\\2.gpx'
```

#### Example 5: Specifying an explicit file type
So far we've always used the `--auto-detect` option, which inspects the actual
attachment data (not the filename) to try to determine what type of file it
represents. You can also explicitly specify the type if you want. Note, however,
that only one type can be specified.

Here is the command from Example 1 with the gpx type explicitly specified:

```
mr attach task --in my_challenge.geojson --out updated_challenge.geojson --kind referenceLayer --type gpx --file-pattern 'attachment_{osmid}.xml'
```

#### Example 6: Attaching blobs
MapRoulette supports attachments of arbitrary data as blobs. These are intended
for attachments that are to be consumed by external processes, and are ignored
by MapRoulette.

When attaching blobs, use of `--format` is recommended, and if the data isn't
JSON-compatible (i.e. XML or binary data), then `--encode` must be specified or
you'll end up with malformed GeoJSON.

Here is an example command that attaches arbitrary XML data as a blob. Note
that `--format xml` has been specified and `--encode` has also been provided.

```
mr attach task --in my_challenge.geojson --out updated_challenge.geojson --kind blob --format xml --encode --file-pattern 'attachment_{osmid}.xml'
```

#### Using your own generated attachments as-is
Normally the mr-cli tool takes your raw attachment files and builds all of the
proper task attachment JSON required by MapRoulette, as
[documented](https://learn.maproulette.org/documentation/task-attachments/).
But if you've generated your own complete attachment JSON files conforming to
the documentation, you can ask mr-cli to simply use your files as-is by using
the `--as-is` option. The only augmentation mr-cli may perform is to generate
`id` fields for your attachments if missing.

```
mr attach task --in my_challenge.geojson --out updated_challenge.geojson --as-is --file-pattern 'attachment_{osmid}.json'
```

#### Mixing multiple kinds of attachments
mr-cli only allows one kind of attachment (such as blobs or reference layers)
in a single run, but you can add additional kinds of attachments with
additional runs on the output. The additional matching attachments will be
added to tasks as needed, leaving earlier attachments intact.

It's even possible to pipe multiple mr-cli runs together using the standard
input and standard output. For example, the following attaches blobs followed
by reference layers. Note that the first command does not include an `--out`,
thereby sending its results to the standard output, and the second command
omits the `--in` so that it reads from the standard input:

```
mr attach task --in my_challenge.geojson --kind blob --format xml --encode --file-pattern 'blobs_{osmid}.xml' | mr attach task --out updated_challenge.geojson --kind referenceLayer --auto-detect --file-pattern 'layers_{osmid}.gpx'
```


### Additional Notes
- Generated challenge files use a
[line-by-line](https://learn.maproulette.org/documentation/line-by-line-geojson/)
format that is well suited to streaming, whereby each line in the file contains a
complete GeoJSON object representing a single task in the challenge. It may not be
possible to open or manipulate this file using traditional GeoJSON tools

- As of v0.1.2, [RFC 7464](https://tools.ietf.org/html/rfc7464) compliant
line-by-line GeoJSON is generated by default. If you must upload your challenge
to a MapRoulette instance earlier than v3.6.5, you can specify `--no-rfc7464`
to generate the old format.

- This utility has not been tested on Windows


## Development
1. Clone the repo
2. `npm install` to install NPM packages

Run with `npm run mr -- <command>`. If you're writing to the standard output,
use `npm --silent run mr` so that the generated GeoJSON isn't polluted with
status messages from NPM.
