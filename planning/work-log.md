# Work Log

## 2026-09-13

- Assessed open GitHub issues and PRs for `maproulette/mr-cli`; found the tool still works for narrow file-generation workflows but is stale and does not post tasks to MapRoulette.
- Refreshed runtime dependencies, replacing `xmldom` with `@xmldom/xmldom`, removing unused `lodash.pick`, updating direct dependencies, regenerating the lockfile, and verifying `npm audit` reports zero vulnerabilities.
- Added smoke tests for cooperative change generation and baseline tag-diff generation.
- Added `mr cooperative tag --baseline <baseline.osm>` for local baseline/proposed tag diffs. Baseline mode avoids per-element historical OSM API lookups, rejects `.osc` input, and uses local-only geometry resolution.
- Updated README and changelog to document tool scope, metadata requirements, tag-mode performance, the baseline workflow, Node support, and test command.
- Fixed relation geometry local-only error propagation by removing a resolve-only Promise wrapper around member fetches; added a baseline smoke regression for missing relation member data.
- Tightened baseline tag validation so proposed elements must exist in the baseline, new/negative ids are rejected, and explicit JOSM create/delete actions fail instead of being coerced or dropped.
