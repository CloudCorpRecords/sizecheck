# sizecheck

A pull request can be three lines in one file or three
thousand lines spread across half the repository, and the
review burden is not the same. sizecheck takes the list of
changed files — each file's path, the lines it adds and
deletes, and optionally how many of its exported symbols
changed — and turns it into one blast-radius report:

- **Score and risk** — a single integer score: total churn
  (lines added plus lines deleted), plus 25 points for every
  exported symbol touched, plus 10 points for every extra
  top-level directory beyond the first. The score maps to a
  risk band: under 100 is `small`, 100–399 is `medium`,
  400–999 is `large`, and 1000 or more is `huge`.
- **Totals** — the file count and the summed lines added,
  lines deleted, churn, and exports changed, so the score
  can always be checked against its inputs.
- **Per-directory spread** — the change grouped by
  top-level directory (a file with no directory in its path
  counts under `"(root)"`), sorted by churn descending and
  then directory name ascending.
- **Hottest files** — the five highest-churn files, ties
  broken by path ascending, so the files that deserve the
  closest read surface first.
- **Split suggestions** — when the risk is `large` or
  `huge`, every directory group except the largest is
  listed as a part of the change that could land
  separately. Small and medium changes, and changes confined
  to a single directory, get no suggestions.

Every changed file needs a unique, non-empty `path` and
non-negative integer `added` and `deleted` counts.
`exports_changed` is optional (default 0) and must be a
non-negative integer when given; `kind` is optional
(default `"code"`) and must be one of `"code"`, `"test"`,
`"docs"`, `"config"`, or `"other"` when given — it is
validated but does not affect the score. Invalid input is
a validation error naming the offending path (for example
`files[0].added must be an integer >= 0`) and no partial
report is produced. The computation is pure and local: no
network, no configuration, no files read beyond the input
you pass in.

## CLI

```bash
npx @reneturcios/sizecheck score --input args.json
npx @reneturcios/sizecheck --version
```

`args.json` contains the full arguments object:

```json
{
  "files": [
    { "path": "src/api.ts", "added": 120, "deleted": 30, "exports_changed": 3 },
    { "path": "src/api.test.ts", "added": 80, "deleted": 10, "kind": "test" },
    { "path": "docs/api.md", "added": 25, "deleted": 5, "kind": "docs" }
  ]
}
```

The report is printed as JSON:

```json
{
  "score": 355,
  "risk": "medium",
  "files_count": 3,
  "added": 225,
  "deleted": 45,
  "churn": 270,
  "exports_changed": 3,
  "by_directory": [
    { "directory": "src", "files": 2, "churn": 240 },
    { "directory": "docs", "files": 1, "churn": 30 }
  ],
  "hottest_files": [
    { "path": "src/api.ts", "churn": 150 },
    { "path": "src/api.test.ts", "churn": 90 },
    { "path": "docs/api.md", "churn": 30 }
  ],
  "split_suggestions": []
}
```

The score is 270 churn + 25 × 3 exports + 10 × 1 extra
directory = 355.

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/sizecheck mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "sizecheck": {
      "command": "npx",
      "args": ["-y", "@reneturcios/sizecheck", "mcp"]
    }
  }
}
```

### Tools

- `score_blast_radius` — Score a pull request's blast
  radius from its changed files.
  - `files` (array, required, at least one) — files as
    `{path, added, deleted, exports_changed?, kind?}`
    objects; `path` is unique across the set

  Returns `{score, risk, files_count, added, deleted,
  churn, exports_changed, by_directory, hottest_files,
  split_suggestions}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/sizecheck
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/sizecheck score --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
