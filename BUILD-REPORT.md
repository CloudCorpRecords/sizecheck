# sizecheck — Build Report

MCP Rebuild 1000, Batch 14. Original program build from the
packages-100 plan (cluster A #13), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch14/sizecheck.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `sizecheck`, npm `@reneturcios/sizecheck`,
MCP name `io.github.CloudCorpRecords/sizecheck`, version
`0.1.0`, bin `sizecheck` → `dist/cli.js`.

## Files created (19/19 per factory checklist, plus this report)

- `package.json`, `server.json` (description "PR
  blast-radius score from changed files and exports, with
  per-directory split suggestions.", 91 chars ≤100;
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/sizecheck:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/sizecheck"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`score --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/sizecheck.ts` (core,
  `VERSION = "0.1.0"`)
- `test/sizecheck.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/sizecheck`,
  smoke-test server-name assertion `sizecheck`)

## Tools implemented (1)

- `score_blast_radius` — arguments: `files` (array,
  required, minItems 1) of `{path (string, required,
  non-empty, unique), added (integer, required, >= 0),
  deleted (integer, required, >= 0), exports_changed
  (integer, optional, default 0, >= 0), kind (string,
  optional, default "code"; one of "code", "test", "docs",
  "config", "other")}`.

  Returns `{score, risk, files_count, added, deleted,
  churn, exports_changed, by_directory, hottest_files,
  split_suggestions}`: `added` / `deleted` / `churn` /
  `exports_changed` are the sums over all files (churn per
  file is added + deleted) and `files_count` is the file
  count. `score` = churn + 25 * exports_changed +
  10 * max(0, distinct top-level directories - 1), all
  integer arithmetic; `risk` is "small" below 100,
  "medium" 100-399, "large" 400-999, "huge" at 1000+.
  A file's top-level directory is the substring before
  the first "/", or "(root)" when there is no "/".
  `by_directory` holds one {directory, files, churn} entry
  per distinct top-level directory sorted by churn
  descending, then directory ascending (code-unit).
  `hottest_files` holds the top 5 files by churn
  descending, ties by path ascending. `split_suggestions`
  is, for "large" / "huge" risk only, every directory
  group except the first in `by_directory` order; it is
  [] otherwise (and for single-directory changes).

  The fixture literal
  (`harness/fixtures/sizecheck-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no `$schema`
  and no `additionalProperties`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the
  fixture, per the standing fleet rule (no McpServer/zod
  schema conversion). Every `tools/call` is validated by
  the core itself, so the MCP and CLI paths share one
  validation implementation.
- Validation is path-naming and total: missing/empty
  `files`, a file that is not an object, a missing, empty,
  non-string, or duplicate `path`, a missing, non-integer,
  or negative `added` / `deleted`, a present but
  non-integer or negative `exports_changed`, or a present
  `kind` outside the five listed values throws an Error
  naming the offending path (e.g.
  `files[0].added must be an integer >= 0`) and produces
  no partial result (MCP: `isError`; CLI: exit 1).
- `kind` is validated and carried on the normalised file
  but, per the spec, does not affect the score or appear
  in the output object.

## Verification (foreground, this session)

- `npx tsc` exit 0 (`dist/cli.js` built)
- `npm test` (`tsx --test test/*.test.ts`): **39 tests,
  39 pass, 0 fail** — totals and the score formula
  (churn, 25-per-export weight, 10-per-extra-directory
  spread, zero-churn file, omitted vs explicit
  exports_changed 0, every listed kind accepted with no
  effect on the report, input-order determinism), every
  risk band boundary (99 small / 100 medium / 399 medium /
  400 large / 999 large / 1000 huge, plus boundary
  crossings driven by the exports weight and by the
  directory-spread term), `by_directory` ("(root)"
  grouping, "(root)" counting as a distinct directory for
  the spread term, first-slash-only top directory, churn
  descending then directory ascending code-unit ties,
  churn outranking alphabetical order), `hottest_files`
  (top-5 truncation with the path tie-break deciding the
  last slot, fewer than 5 files, ranking by added +
  deleted), `split_suggestions` (large and huge
  multi-directory changes in by_directory order, none for
  small / medium multi-directory changes, none for large
  or huge single-directory changes), and every
  validation path (missing/empty/non-array `files`,
  non-object file, missing/empty/non-string/duplicate
  path, missing/non-integer/negative/non-number `added`,
  missing/non-integer/negative `deleted`, non-integer/
  negative/non-number `exports_changed`, invalid or
  non-string `kind`)
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `score` with no `--input` exits 2;
  `score --input <missing file>` exits 1 naming the file;
  `score --input <valid file>` exits 0 and prints the
  report JSON (verified against the README example: score
  355, risk "medium", churn 270, exports_changed 3,
  by_directory [src 240, docs 30]); `score --input
  <invalid file>` exits 1 with
  `files[0].added must be an integer >= 0`
- Parity: `harness/parity.py` vs
  `harness/fixtures/sizecheck-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1**. Note: the
  rebuild stdio command was run with the absolute path
  `/home/hatch/workspace/mcp-rebuild-100/builds/sizecheck/dist/cli.js`
  in place of the `~/workspace/...` shorthand, because the
  harness passes the command through `shlex` without
  tilde expansion and node resolves a literal `~/...`
  argument relative to the working directory (the first
  run with the literal tilde form returned UNREACHABLE
  for that reason alone; the server itself was verified
  working by the subsequent PASS and the CLI checks).

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp copy
without `node_modules`/`dist`/`package-lock.json`, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/sizecheck`, **128 package entries**. Local
`node_modules` was installed via `npm install
--ignore-scripts --offline` for build/test; gitignored.

## Gaps / honest notes

- **Missing-field error wording:** the spec fixes the
  example message `files[0].added must be an integer >= 0`
  for the added/deleted validation family without
  distinguishing a missing field from a malformed one;
  the implementation uses that single message for
  missing, non-integer, negative, and non-number
  `added` / `deleted` (and the analogous message for
  `exports_changed`). A missing `path`, by contrast,
  reports `files[<i>].path is required`, mirroring the
  factory pattern.
- **Duplicate-path error wording:** the spec requires a
  duplicate-path error naming the offending path without
  fixing the wording; the message used is
  `files[<i>].path duplicates files[<first>].path "<path>"`.
- **`kind` in the output:** the spec's output object has
  no kind field and the score formula does not use kind,
  so kind is accepted, validated, and otherwise unused.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
