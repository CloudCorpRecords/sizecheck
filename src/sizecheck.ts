/**
 * sizecheck core: PR blast-radius scorer.
 *
 *   scoreBlastRadius(files) -> report
 *
 * Behaviour:
 * - churn(file) = added + deleted. `added`, `deleted`,
 *   `churn`, and `exports_changed` in the report are the
 *   sums over all files; `files_count` is the file count.
 * - `score` = churn + 25 * exports_changed_total
 *   + 10 * max(0, distinct_top_dirs - 1), all integer
 *   arithmetic.
 * - `risk`: score < 100 -> "small"; 100-399 -> "medium";
 *   400-999 -> "large"; >= 1000 -> "huge".
 * - A file's top-level directory is the substring before
 *   the first "/"; a path with no "/" is in "(root)".
 * - `by_directory` holds one {directory, files, churn}
 *   entry per distinct top-level directory, sorted by
 *   churn descending, then directory ascending
 *   (code-unit).
 * - `hottest_files` holds the top 5 files by churn
 *   descending, ties by path ascending, as {path, churn}.
 * - `split_suggestions`: when risk is "large" or "huge",
 *   every directory group except the first in
 *   `by_directory` order, in that order; otherwise [].
 *   (A single-directory change therefore also yields [],
 *   because there is nothing left after the first group.)
 *
 * The `kind` field is validated and carried on the
 * normalised file, but does not affect the score.
 *
 * Validation is strict and path-naming: any malformed
 * input throws an Error naming the offending path (for
 * example "files[0].added must be an integer >= 0") and
 * no partial result is produced.
 */
import type {
  BlastRadiusResult,
  ChangedFile,
  DirectorySummary,
  FileKind,
  Risk,
} from "./types.js";

export const VERSION = "0.1.0";

const KINDS: readonly string[] = ["code", "test", "docs", "config", "other"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Validate the raw `files` argument and return the
 * normalised file list (exports_changed and kind
 * defaulted).
 */
function validateFiles(files: unknown): ChangedFile[] {
  if (files === undefined) throw new Error("files is required");
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("files must be a non-empty array");
  }

  const validated: ChangedFile[] = [];
  const indexByPath = new Map<string, number>();
  files.forEach((raw, i) => {
    const path = `files[${i}]`;
    if (!isRecord(raw)) throw new Error(`${path} must be an object`);
    if (raw.path === undefined) throw new Error(`${path}.path is required`);
    if (typeof raw.path !== "string" || raw.path.length === 0) {
      throw new Error(`${path}.path must be a non-empty string`);
    }
    const firstIndex = indexByPath.get(raw.path);
    if (firstIndex !== undefined) {
      throw new Error(
        `${path}.path duplicates files[${firstIndex}].path "${raw.path}"`,
      );
    }
    indexByPath.set(raw.path, i);

    if (!isNonNegativeInteger(raw.added)) {
      throw new Error(`${path}.added must be an integer >= 0`);
    }
    if (!isNonNegativeInteger(raw.deleted)) {
      throw new Error(`${path}.deleted must be an integer >= 0`);
    }

    let exportsChanged = 0;
    if (raw.exports_changed !== undefined) {
      if (!isNonNegativeInteger(raw.exports_changed)) {
        throw new Error(`${path}.exports_changed must be an integer >= 0`);
      }
      exportsChanged = raw.exports_changed;
    }

    let kind: FileKind = "code";
    if (raw.kind !== undefined) {
      if (typeof raw.kind !== "string" || !KINDS.includes(raw.kind)) {
        throw new Error(
          `${path}.kind must be one of "code", "test", "docs", "config", or "other"`,
        );
      }
      kind = raw.kind as FileKind;
    }

    validated.push({
      path: raw.path,
      added: raw.added,
      deleted: raw.deleted,
      exports_changed: exportsChanged,
      kind,
    });
  });

  return validated;
}

/** Top-level directory of a path: before the first "/", else "(root)". */
function topDirectory(filePath: string): string {
  const slash = filePath.indexOf("/");
  return slash === -1 ? "(root)" : filePath.slice(0, slash);
}

function riskForScore(score: number): Risk {
  if (score < 100) return "small";
  if (score < 400) return "medium";
  if (score < 1000) return "large";
  return "huge";
}

/** Score the blast radius of the supplied changed files. */
export function scoreBlastRadius(files: unknown): BlastRadiusResult {
  const validFiles = validateFiles(files);

  let added = 0;
  let deleted = 0;
  let exportsChanged = 0;
  const dirMap = new Map<string, DirectorySummary>();
  const hot: { path: string; churn: number }[] = [];

  for (const file of validFiles) {
    const churn = file.added + file.deleted;
    added += file.added;
    deleted += file.deleted;
    exportsChanged += file.exports_changed;
    hot.push({ path: file.path, churn });

    const directory = topDirectory(file.path);
    const group = dirMap.get(directory) ?? { directory, files: 0, churn: 0 };
    group.files += 1;
    group.churn += churn;
    dirMap.set(directory, group);
  }

  const churn = added + deleted;
  const byDirectory = [...dirMap.values()].sort(
    (a, b) => b.churn - a.churn || compareCodeUnit(a.directory, b.directory),
  );

  const score =
    churn + 25 * exportsChanged + 10 * Math.max(0, byDirectory.length - 1);
  const risk = riskForScore(score);

  const hottestFiles = hot
    .sort((a, b) => b.churn - a.churn || compareCodeUnit(a.path, b.path))
    .slice(0, 5);

  const splitSuggestions: DirectorySummary[] =
    risk === "large" || risk === "huge"
      ? byDirectory.slice(1).map((g) => ({ ...g }))
      : [];

  return {
    score,
    risk,
    files_count: validFiles.length,
    added,
    deleted,
    churn,
    exports_changed: exportsChanged,
    by_directory: byDirectory.map((g) => ({ ...g })),
    hottest_files: hottestFiles,
    split_suggestions: splitSuggestions,
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
