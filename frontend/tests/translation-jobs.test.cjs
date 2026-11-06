const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function harness(responses, initialStorage = {}) {
  const calls = [],
    storage = new Map(Object.entries(initialStorage));
  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }
  const code = ts.transpileModule(
    fs.readFileSync("features/reading/translation-jobs.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: () => ({
      ApiError,
      api: async (path, options = {}) => {
        calls.push({ path, method: options.method || "GET" });
        const response = responses.shift();
        if (response instanceof Error) throw response;
        if (!response) throw Error("Unexpected request " + path);
        return { job: response };
      },
    }),
    sessionStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    DOMException,
    setTimeout: (callback) => {
      queueMicrotask(callback);
      return 1;
    },
    clearTimeout: () => {},
  });
  return { ...exports, calls, storage, ApiError };
}
const result = {
  sentences: [{ id: "s1", original: "Hello.", translation: "Xin chào." }],
};

test("one POST starts job; subsequent polls read status without repeating AI request", async () => {
  const h = harness([
    { id: "j1", state: "queued" },
    { id: "j1", state: "running" },
    { id: "j1", state: "completed", result },
  ]);
  const states = [];
  assert.equal(
    await h.translateArticle("a1", new AbortController().signal, (state) =>
      states.push(state),
    ),
    result,
  );
  assert.deepEqual(
    h.calls.map((x) => x.method),
    ["POST", "GET", "GET"],
  );
  assert.deepEqual(states, ["queued", "running", "completed"]);
});

test("returning to article resumes remembered completed job without POST", async () => {
  const h = harness([{ id: "j1", state: "completed", result }], {
    "lingopress:translation-job:vi:a1": "j1",
  });
  assert.equal(
    await h.translateArticle("a1", new AbortController().signal),
    result,
  );
  assert.deepEqual(h.calls, [
    { path: "/ai/translation-jobs/j1", method: "GET" },
  ]);
});

test("failed job does not auto retry; explicit next invocation can create new job", async () => {
  const h = harness([
    { id: "j1", state: "failed", error: "Model unavailable" },
    { id: "j2", state: "completed", result },
  ]);
  await assert.rejects(
    h.translateArticle("a1", new AbortController().signal),
    /Model unavailable/,
  );
  assert.equal(h.storage.size, 0);
  assert.equal(h.calls.length, 1);
  assert.equal(
    await h.translateArticle("a1", new AbortController().signal),
    result,
  );
  assert.deepEqual(
    h.calls.map((x) => x.method),
    ["POST", "POST"],
  );
});

test("navigation abort stops UI polling and preserves server job id for resume", async () => {
  const h = harness([{ id: "j1", state: "running" }]);
  const controller = new AbortController();
  await assert.rejects(
    h.translateArticle("a1", controller.signal, () => controller.abort()),
    { name: "AbortError" },
  );
  assert.equal(h.calls.length, 1);
  assert.equal(h.storage.get("lingopress:translation-job:vi:a1"), "j1");
});

test("temporary status failure preserves job id so retry cannot create duplicate job", async () => {
  const h = harness([new Error("Connection lost")], {
    "lingopress:translation-job:vi:a1": "j1",
  });
  await assert.rejects(
    h.translateArticle("a1", new AbortController().signal),
    /Connection lost/,
  );
  assert.equal(h.storage.get("lingopress:translation-job:vi:a1"), "j1");
  assert.equal(h.calls[0].method, "GET");
});
