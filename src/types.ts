/**
 * sizecheck types.
 *
 * sizecheck scores the blast radius of a pull request from
 * the files it changes. The caller supplies every changed
 * file — its path, the lines added and deleted, optionally
 * how many exported symbols changed in it, and optionally
 * its kind — and sizecheck reports, as pure local
 * computation:
 *
 *   - the totals: file count, lines added and deleted,
 *     total churn, and total exports changed
 *   - a single integer `score` and the `risk` band it
 *     falls in
 *   - the change grouped by top-level directory
 *   - the hottest (highest-churn) files
 *   - and, for large or huge changes, the directory groups
 *     that could land separately as split suggestions
 *
 * Nothing is fetched, executed, or guessed: the score comes
 * only from the changed files supplied.
 */

/** The file kinds the spec accepts. */
export type FileKind = "code" | "test" | "docs" | "config" | "other";

/** One changed file, as supplied by the caller. */
export interface ChangedFile {
  /** File path; unique across the supplied set. */
  path: string;
  /** Lines added in this file (>= 0). */
  added: number;
  /** Lines deleted in this file (>= 0). */
  deleted: number;
  /**
   * Exported symbols added, removed, or changed in this
   * file. Defaults to 0 when omitted.
   */
  exports_changed: number;
  /** File kind. Defaults to "code" when omitted. */
  kind: FileKind;
}

/** One top-level directory's share of the change. */
export interface DirectorySummary {
  /** Top-level directory, or "(root)" for paths with no "/". */
  directory: string;
  /** Number of changed files in this directory. */
  files: number;
  /** Summed churn (added + deleted) in this directory. */
  churn: number;
}

/** One of the hottest changed files. */
export interface HotFile {
  /** File path. */
  path: string;
  /** Churn (added + deleted) for this file. */
  churn: number;
}

/** Risk band for a score: <100 small, 100-399 medium, 400-999 large, >=1000 huge. */
export type Risk = "small" | "medium" | "large" | "huge";

/** The blast-radius report. */
export interface BlastRadiusResult {
  /** churn + 25 * exports_changed + 10 * max(0, distinct top-level directories - 1). */
  score: number;
  /** Risk band for `score`. */
  risk: Risk;
  /** Number of changed files. */
  files_count: number;
  /** Total lines added across all files. */
  added: number;
  /** Total lines deleted across all files. */
  deleted: number;
  /** Total churn: added + deleted across all files. */
  churn: number;
  /** Total exported symbols changed across all files. */
  exports_changed: number;
  /**
   * One entry per distinct top-level directory, sorted by
   * churn descending, then directory ascending.
   */
  by_directory: DirectorySummary[];
  /**
   * The top 5 files by churn descending, ties broken by
   * path ascending. Fewer entries when fewer files changed.
   */
  hottest_files: HotFile[];
  /**
   * For "large" or "huge" changes, every directory group
   * except the first (largest) in `by_directory` order;
   * [] otherwise.
   */
  split_suggestions: DirectorySummary[];
}
