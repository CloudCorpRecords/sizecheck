# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `score_blast_radius` MCP tool and `score`
  CLI command scoring a pull request's blast radius from its
  changed files.
- Score from total churn, exports touched (25 points each),
  and per-directory spread (10 points per extra top-level
  directory), with small / medium / large / huge risk bands,
  per-directory grouping (root files under `"(root)"`), the
  top 5 hottest files, and split suggestions for large and
  huge multi-directory changes — with path-naming validation
  errors for missing, duplicate, or malformed file entries.
