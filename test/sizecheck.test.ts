import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreBlastRadius } from "../src/sizecheck.js";

/**
 * All tests are pure local computation over inline changed
 * file lists: no filesystem, no network. Each behaviour in
 * the spec is pinned by its own case, including every score
 * band boundary and every validation path.
 */

const file = (
  path: string,
  added: number,
  deleted: number,
  extra?: { exports_changed?: number; kind?: string },
) => ({
  path,
  added,
  deleted,
  ...(extra?.exports_changed !== undefined
    ? { exports_changed: extra.exports_changed }
    : {}),
  ...(extra?.kind !== undefined ? { kind: extra.kind } : {}),
});

describe("scoreBlastRadius — totals and score formula", () => {
  it("sums added, deleted, churn, and exports over all files", () => {
    const out = scoreBlastRadius([
      file("src/a.ts", 30, 20, { exports_changed: 2 }),
      file("src/b.ts", 10, 5, { exports_changed: 1 }),
      file("lib/c.ts", 0, 15),
    ]);
    assert.equal(out.files_count, 3);
    assert.equal(out.added, 40);
    assert.equal(out.deleted, 40);
    assert.equal(out.churn, 80);
    assert.equal(out.exports_changed, 3);
    // 80 churn + 25 * 3 exports + 10 * (2 dirs - 1) = 165
    assert.equal(out.score, 165);
    assert.equal(out.risk, "medium");
  });

  it("scores a single file as its churn when nothing else contributes", () => {
    const out = scoreBlastRadius([file("src/a.ts", 30, 20)]);
    assert.equal(out.score, 50);
    assert.equal(out.risk, "small");
    assert.deepEqual(out.by_directory, [
      { directory: "src", files: 1, churn: 50 },
    ]);
    assert.deepEqual(out.hottest_files, [{ path: "src/a.ts", churn: 50 }]);
    assert.deepEqual(out.split_suggestions, []);
  });

  it("weights each changed export at 25 points", () => {
    const out = scoreBlastRadius([
      file("src/a.ts", 10, 0, { exports_changed: 2 }),
    ]);
    // 10 churn + 25 * 2 = 60
    assert.equal(out.score, 60);
  });

  it("adds 10 points per extra distinct top-level directory, and none for one", () => {
    const one = scoreBlastRadius([file("src/a.ts", 10, 0), file("src/b.ts", 10, 0)]);
    assert.equal(one.score, 20);
    const two = scoreBlastRadius([file("src/a.ts", 10, 0), file("lib/b.ts", 10, 0)]);
    assert.equal(two.score, 30);
    const three = scoreBlastRadius([
      file("src/a.ts", 10, 0),
      file("lib/b.ts", 10, 0),
      file("docs/c.md", 10, 0),
    ]);
    // 30 churn + 10 * (3 - 1) = 50
    assert.equal(three.score, 50);
  });

  it("accepts a zero-churn file and scores it 0 / small", () => {
    const out = scoreBlastRadius([file("src/empty.ts", 0, 0)]);
    assert.equal(out.score, 0);
    assert.equal(out.risk, "small");
    assert.equal(out.churn, 0);
  });

  it("treats omitted exports_changed the same as an explicit 0", () => {
    const omitted = scoreBlastRadius([file("src/a.ts", 10, 5)]);
    const explicit = scoreBlastRadius([
      file("src/a.ts", 10, 5, { exports_changed: 0 }),
    ]);
    assert.deepEqual(omitted, explicit);
  });

  it("accepts every listed kind and kind does not change the report", () => {
    const base = scoreBlastRadius([file("src/a.ts", 10, 5)]);
    for (const kind of ["code", "test", "docs", "config", "other"]) {
      const out = scoreBlastRadius([file("src/a.ts", 10, 5, { kind })]);
      assert.deepEqual(out, base);
    }
  });

  it("is deterministic: input order does not change the report", () => {
    const files = [
      file("src/a.ts", 30, 10, { exports_changed: 1 }),
      file("lib/b.ts", 20, 20),
      file("README.md", 5, 5),
    ];
    assert.deepEqual(
      scoreBlastRadius([...files].reverse()),
      scoreBlastRadius(files),
    );
  });
});

describe("scoreBlastRadius — risk band boundaries", () => {
  // Single file in a single directory, no exports: score == churn.
  const cases: [number, string][] = [
    [99, "small"],
    [100, "medium"],
    [399, "medium"],
    [400, "large"],
    [999, "large"],
    [1000, "huge"],
  ];
  for (const [churn, risk] of cases) {
    it(`scores ${churn} as "${risk}"`, () => {
      const out = scoreBlastRadius([file("src/a.ts", churn, 0)]);
      assert.equal(out.score, churn);
      assert.equal(out.risk, risk);
    });
  }

  it("crosses the 99/100 boundary via the exports weight, not just churn", () => {
    const small = scoreBlastRadius([
      file("src/a.ts", 74, 0, { exports_changed: 1 }),
    ]);
    assert.equal(small.score, 99);
    assert.equal(small.risk, "small");
    const medium = scoreBlastRadius([
      file("src/a.ts", 75, 0, { exports_changed: 1 }),
    ]);
    assert.equal(medium.score, 100);
    assert.equal(medium.risk, "medium");
  });

  it("crosses a boundary via the directory-spread term", () => {
    // 380 churn over two directories: 380 + 10 = 390 (medium);
    // 390 churn over two directories: 390 + 10 = 400 (large).
    const medium = scoreBlastRadius([
      file("src/a.ts", 380, 0),
      file("lib/b.ts", 0, 0),
    ]);
    assert.equal(medium.score, 390);
    assert.equal(medium.risk, "medium");
    const large = scoreBlastRadius([
      file("src/a.ts", 390, 0),
      file("lib/b.ts", 0, 0),
    ]);
    assert.equal(large.score, 400);
    assert.equal(large.risk, "large");
  });
});

describe("scoreBlastRadius — by_directory", () => {
  it('groups paths with no "/" under "(root)"', () => {
    const out = scoreBlastRadius([
      file("README.md", 10, 0),
      file("LICENSE", 5, 0),
      file("src/a.ts", 7, 0),
    ]);
    assert.deepEqual(out.by_directory, [
      { directory: "(root)", files: 2, churn: 15 },
      { directory: "src", files: 1, churn: 7 },
    ]);
  });

  it('counts "(root)" as a distinct directory for the spread term', () => {
    const out = scoreBlastRadius([
      file("README.md", 10, 0),
      file("src/a.ts", 10, 0),
    ]);
    // 20 churn + 10 * (2 dirs - 1) = 30
    assert.equal(out.score, 30);
  });

  it("uses only the substring before the first slash as the directory", () => {
    const out = scoreBlastRadius([
      file("src/deep/nested/file.ts", 10, 0),
      file("src/other.ts", 5, 0),
      file("a/b/c.ts", 3, 0),
    ]);
    assert.deepEqual(out.by_directory, [
      { directory: "src", files: 2, churn: 15 },
      { directory: "a", files: 1, churn: 3 },
    ]);
  });

  it("sorts by churn descending, then directory ascending (code-unit) on ties", () => {
    const out = scoreBlastRadius([
      file("src/a.ts", 20, 10),
      file("src/b.ts", 10, 0),
      file("lib/c.ts", 40, 0),
      file("README.md", 40, 0),
    ]);
    // All three groups have churn 40; "(" (U+0028) sorts
    // before letters, so "(root)" wins the tie.
    assert.deepEqual(out.by_directory, [
      { directory: "(root)", files: 1, churn: 40 },
      { directory: "lib", files: 1, churn: 40 },
      { directory: "src", files: 2, churn: 40 },
    ]);
  });

  it("lets higher churn outrank alphabetical order", () => {
    const out = scoreBlastRadius([
      file("aaa/a.ts", 5, 0),
      file("zzz/b.ts", 50, 0),
    ]);
    assert.deepEqual(
      out.by_directory.map((g) => g.directory),
      ["zzz", "aaa"],
    );
  });
});

describe("scoreBlastRadius — hottest_files", () => {
  it("returns the top 5 by churn descending, ties by path ascending", () => {
    const out = scoreBlastRadius([
      file("g.ts", 10, 0),
      file("f.ts", 20, 0),
      file("e.ts", 20, 0),
      file("d.ts", 30, 0),
      file("c.ts", 40, 0),
      file("b.ts", 50, 0),
      file("a.ts", 50, 0),
    ]);
    // e.ts wins the last slot over f.ts on the path tie-break.
    // (All paths are in "(root)", so there is no spread term.)
    assert.deepEqual(out.hottest_files, [
      { path: "a.ts", churn: 50 },
      { path: "b.ts", churn: 50 },
      { path: "c.ts", churn: 40 },
      { path: "d.ts", churn: 30 },
      { path: "e.ts", churn: 20 },
    ]);
  });

  it("returns fewer than 5 entries when fewer files changed", () => {
    const out = scoreBlastRadius([
      file("src/a.ts", 10, 0),
      file("src/b.ts", 5, 0),
    ]);
    assert.deepEqual(out.hottest_files, [
      { path: "src/a.ts", churn: 10 },
      { path: "src/b.ts", churn: 5 },
    ]);
  });

  it("ranks by added + deleted, not by added alone", () => {
    const out = scoreBlastRadius([
      file("src/a.ts", 90, 0),
      file("src/b.ts", 10, 95),
    ]);
    assert.deepEqual(out.hottest_files[0], { path: "src/b.ts", churn: 105 });
  });
});

describe("scoreBlastRadius — split_suggestions", () => {
  it("suggests every group except the largest for a large multi-directory change", () => {
    const out = scoreBlastRadius([
      file("src/a.ts", 300, 0),
      file("lib/b.ts", 100, 0),
      file("docs/c.md", 50, 0),
    ]);
    // 450 churn + 10 * 2 = 470 -> large
    assert.equal(out.risk, "large");
    assert.deepEqual(out.split_suggestions, [
      { directory: "lib", files: 1, churn: 100 },
      { directory: "docs", files: 1, churn: 50 },
    ]);
  });

  it("suggests splits for a huge multi-directory change, in by_directory order", () => {
    const out = scoreBlastRadius([
      file("lib/b.ts", 300, 0),
      file("src/a.ts", 800, 0),
      file("docs/c.md", 100, 0),
    ]);
    assert.equal(out.risk, "huge");
    assert.deepEqual(out.split_suggestions, [
      { directory: "lib", files: 1, churn: 300 },
      { directory: "docs", files: 1, churn: 100 },
    ]);
  });

  it("suggests nothing for a medium multi-directory change", () => {
    const out = scoreBlastRadius([
      file("src/a.ts", 150, 0),
      file("lib/b.ts", 50, 0),
    ]);
    // 200 churn + 10 = 210 -> medium
    assert.equal(out.risk, "medium");
    assert.deepEqual(out.split_suggestions, []);
  });

  it("suggests nothing for a small multi-directory change", () => {
    const out = scoreBlastRadius([
      file("src/a.ts", 10, 0),
      file("lib/b.ts", 10, 0),
    ]);
    assert.equal(out.risk, "small");
    assert.deepEqual(out.split_suggestions, []);
  });

  it("suggests nothing for a large single-directory change", () => {
    const out = scoreBlastRadius([
      file("src/a.ts", 300, 0),
      file("src/b.ts", 200, 0),
    ]);
    assert.equal(out.risk, "large");
    assert.deepEqual(out.split_suggestions, []);
  });

  it("suggests nothing for a huge single-directory change", () => {
    const out = scoreBlastRadius([file("src/a.ts", 1500, 0)]);
    assert.equal(out.risk, "huge");
    assert.deepEqual(out.split_suggestions, []);
  });
});

describe("scoreBlastRadius — validation", () => {
  it("rejects missing, empty, or non-array files", () => {
    assert.throws(() => scoreBlastRadius(undefined), /files is required/);
    assert.throws(() => scoreBlastRadius([]), /files must be a non-empty array/);
    assert.throws(() => scoreBlastRadius("nope"), /files must be a non-empty array/);
  });

  it("rejects a file that is not an object, naming the path", () => {
    assert.throws(() => scoreBlastRadius([42]), /files\[0\] must be an object/);
    assert.throws(
      () => scoreBlastRadius([file("src/a.ts", 1, 1), "b"]),
      /files\[1\] must be an object/,
    );
  });

  it("rejects a file missing its path, naming the path", () => {
    assert.throws(
      () => scoreBlastRadius([{ added: 1, deleted: 1 }]),
      /files\[0\]\.path is required/,
    );
  });

  it("rejects an empty or non-string path, naming the path", () => {
    assert.throws(
      () => scoreBlastRadius([file("", 1, 1)]),
      /files\[0\]\.path must be a non-empty string/,
    );
    assert.throws(
      () => scoreBlastRadius([{ path: 42, added: 1, deleted: 1 }]),
      /files\[0\]\.path must be a non-empty string/,
    );
  });

  it("rejects a duplicate path, naming both paths", () => {
    assert.throws(
      () =>
        scoreBlastRadius([
          file("src/a.ts", 1, 1),
          file("src/b.ts", 1, 1),
          file("src/a.ts", 2, 2),
        ]),
      /files\[2\]\.path duplicates files\[0\]\.path "src\/a\.ts"/,
    );
  });

  it("rejects missing, non-integer, negative, or non-number added, naming the path", () => {
    assert.throws(
      () => scoreBlastRadius([{ path: "src/a.ts", deleted: 1 }]),
      /files\[0\]\.added must be an integer >= 0/,
    );
    assert.throws(
      () => scoreBlastRadius([file("src/a.ts", 1.5, 1)]),
      /files\[0\]\.added must be an integer >= 0/,
    );
    assert.throws(
      () => scoreBlastRadius([file("src/a.ts", -1, 1)]),
      /files\[0\]\.added must be an integer >= 0/,
    );
    assert.throws(
      () => scoreBlastRadius([{ path: "src/a.ts", added: "5", deleted: 1 }]),
      /files\[0\]\.added must be an integer >= 0/,
    );
  });

  it("rejects missing, non-integer, or negative deleted, naming the path", () => {
    assert.throws(
      () => scoreBlastRadius([{ path: "src/a.ts", added: 1 }]),
      /files\[0\]\.deleted must be an integer >= 0/,
    );
    assert.throws(
      () => scoreBlastRadius([file("src/a.ts", 1, 0.5)]),
      /files\[0\]\.deleted must be an integer >= 0/,
    );
    assert.throws(
      () =>
        scoreBlastRadius([file("src/a.ts", 1, 1), file("src/b.ts", 1, -3)]),
      /files\[1\]\.deleted must be an integer >= 0/,
    );
  });

  it("rejects a non-integer or negative exports_changed, naming the path", () => {
    assert.throws(
      () => scoreBlastRadius([file("src/a.ts", 1, 1, { exports_changed: 1.5 })]),
      /files\[0\]\.exports_changed must be an integer >= 0/,
    );
    assert.throws(
      () => scoreBlastRadius([file("src/a.ts", 1, 1, { exports_changed: -1 })]),
      /files\[0\]\.exports_changed must be an integer >= 0/,
    );
    assert.throws(
      () =>
        scoreBlastRadius([
          { path: "src/a.ts", added: 1, deleted: 1, exports_changed: "2" },
        ]),
      /files\[0\]\.exports_changed must be an integer >= 0/,
    );
  });

  it("rejects a kind outside the five listed values, naming the path", () => {
    assert.throws(
      () => scoreBlastRadius([file("src/a.ts", 1, 1, { kind: "binary" })]),
      /files\[0\]\.kind must be one of "code", "test", "docs", "config", or "other"/,
    );
    assert.throws(
      () =>
        scoreBlastRadius([
          { path: "src/a.ts", added: 1, deleted: 1, kind: 42 },
        ]),
      /files\[0\]\.kind must be one of "code", "test", "docs", "config", or "other"/,
    );
  });
});
