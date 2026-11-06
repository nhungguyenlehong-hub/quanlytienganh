const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const exportsObject = {};
const code = ts.transpileModule(
  fs.readFileSync("features/vocabulary/dictionary.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
vm.runInNewContext(code, { exports: exportsObject, URL });
const { dictionarySenses, normalizedWord, safeExternalUrl } = exportsObject;

test("Vietnamese senses retain separate definitions and grammatical context for selection", () => {
  const senses = dictionarySenses({
    word: "book",
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [{ definition: "quyển sách", example: "I read a book." }],
      },
      {
        partOfSpeech: "verb",
        definitions: [{ definition: "đặt trước", example: "Book a room." }],
      },
    ],
  });
  assert.equal(senses.length, 2);
  assert.notEqual(senses[0].id, senses[1].id);
  const chosen = senses.find((sense) => sense.id === "1:0");
  assert.equal(chosen.definition, "đặt trước");
  assert.equal(chosen.partOfSpeech, "verb");
  assert.equal(chosen.example, "Book a room.");
});

test("provider top-level meaning remains selectable when grouped meanings absent", () => {
  assert.equal(
    dictionarySenses({ word: "reading", meaning: "sự đọc" })[0].definition,
    "sự đọc",
  );
  assert.equal(dictionarySenses(null).length, 0);
});

test("word selection normalizes capitalization punctuation and curly apostrophes", () => {
  assert.equal(normalizedWord("“Business,”"), "business");
  assert.equal(normalizedWord("Don’t"), "don't");
  assert.equal(normalizedWord("  BOOK  "), "book");
});

test("source and audio links only allow HTTP(S) URLs", () => {
  assert.equal(safeExternalUrl("javascript:alert(1)"), undefined);
  assert.equal(safeExternalUrl("data:text/html,hello"), undefined);
  assert.equal(
    safeExternalUrl("https://vi.wiktionary.org/wiki/book"),
    "https://vi.wiktionary.org/wiki/book",
  );
});
