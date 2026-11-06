const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");
const output = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("features/vocabulary/saved-words.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: output, crypto },
);
const {
  readLocalWords,
  saveLocalWord,
  markLocalWord,
  deleteLocalWord,
  filterWords,
  WORDS_STORAGE_KEY,
} = output;
function storage(values = []) {
  let data = JSON.stringify(values);
  return {
    getItem: () => data,
    setItem: (_, value) => {
      data = value;
    },
    raw: () => data,
  };
}
const legacy = {
  id: "one",
  word: "prize",
  meaning: "giải thưởng",
  context: "a prize pot",
  articleId: "news",
  createdAt: "2026-11-06T00:00:00Z",
};

test("legacy words are unknown and learning filters combine with Vietnamese search", () => {
  const store = storage([
    legacy,
    { ...legacy, id: "two", word: "book", meaning: "quyển sách", known: true },
  ]);
  const words = readLocalWords(store);
  assert.equal(words[0].known, false);
  assert.equal(filterWords(words, "known", "SÁCH").length, 1);
  assert.equal(filterWords(words, "unknown", "prize")[0].id, "one");
  assert.equal(filterWords(words, "known", "prize").length, 0);
  assert.equal(filterWords(words, "all", "").length, 2);
});

test("known and unknown states survive reading storage again", () => {
  const store = storage([legacy]);
  markLocalWord("one", true, store);
  assert.equal(readLocalWords(store)[0].known, true);
  assert.ok(readLocalWords(store)[0].knownAt);
  markLocalWord("one", false, store);
  assert.equal(readLocalWords(store)[0].known, false);
  assert.equal(readLocalWords(store)[0].knownAt, undefined);
});

test("saving another meaning keeps the learned state, identity and creation date", () => {
  const store = storage([
    { ...legacy, known: true, knownAt: "2026-11-06T01:00:00Z" },
  ]);
  saveLocalWord(
    {
      word: "PRIZE",
      meaning: "phần thưởng",
      context: "new context",
      articleId: "another-article",
    },
    store,
  );
  const words = readLocalWords(store);
  assert.equal(words.length, 1);
  assert.equal(words[0].id, "one");
  assert.equal(words[0].known, true);
  assert.equal(words[0].knownAt, "2026-11-06T01:00:00Z");
  assert.equal(words[0].createdAt, legacy.createdAt);
  assert.equal(words[0].meaning, "phần thưởng");
});

test("a later tab change is preserved when marking or deleting another word", () => {
  const store = storage([legacy]);
  readLocalWords(store);
  store.setItem(
    WORDS_STORAGE_KEY,
    JSON.stringify([legacy, { ...legacy, id: "two", word: "book" }]),
  );
  markLocalWord("one", true, store);
  assert.equal(readLocalWords(store).length, 2);
  deleteLocalWord("one", store);
  assert.equal(readLocalWords(store).length, 1);
  assert.equal(readLocalWords(store)[0].id, "two");
});

test("corrupted or unavailable browser storage is reported without erasing data", () => {
  let writes = 0;
  const corrupt = {
    getItem: () => "{broken",
    setItem: () => {
      writes++;
    },
  };
  assert.throws(() => deleteLocalWord("one", corrupt));
  assert.equal(writes, 0);
  const store = storage([legacy]);
  const before = store.raw();
  assert.throws(() =>
    markLocalWord("one", true, {
      getItem: store.getItem,
      setItem: () => {
        throw new Error("quota");
      },
    }),
  );
  assert.equal(store.raw(), before);
});
