import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function createElement() {
  return {
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    dataset: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains(name) { return name === "is-active"; },
    },
    addEventListener() {},
    setAttribute() {},
    append() {},
    remove() {},
    focus() {},
  };
}

const nodes = new Map();
const context = {
  console,
  Blob,
  URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
  navigator: { clipboard: { writeText: async () => {} } },
  localStorage: { getItem: () => null, setItem() {} },
  document: {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, createElement());
      return nodes.get(selector);
    },
    querySelectorAll: () => [],
    createElement,
    body: createElement(),
  },
  window: {
    clearTimeout,
    setTimeout,
    addEventListener() {},
    matchMedia: () => ({ matches: true }),
    confirm: () => true,
  },
};
context.globalThis = context;

vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL("../app.js", import.meta.url), "utf8"), context);
const render = context.renderMarkdown;

test("renderiza los elementos Markdown principales", () => {
  const result = render("# Título\n\n**fuerte** y _énfasis_\n\n- uno\n- dos");
  assert.match(result, /<h1>Título<\/h1>/);
  assert.match(result, /<strong>fuerte<\/strong>/);
  assert.match(result, /<em>énfasis<\/em>/);
  assert.match(result, /<ul><li>uno<\/li><li>dos<\/li><\/ul>/);
});

test("renderiza tablas, tareas y bloques de código", () => {
  const result = render("| A | B |\n| --- | ---: |\n| 1 | 2 |\n\n- [x] listo\n\n```html\n<b>seguro</b>\n```");
  assert.match(result, /<table>/);
  assert.match(result, /text-align:right/);
  assert.match(result, /checkbox[^>]*checked/);
  assert.match(result, /&lt;b&gt;seguro&lt;\/b&gt;/);
});

test("escapa HTML y rechaza enlaces con protocolos peligrosos", () => {
  const result = render('<img src=x onerror=alert(1)>\n\n[peligro](javascript:alert(1))');
  assert.doesNotMatch(result, /<img src=x/);
  assert.doesNotMatch(result, /href="javascript:/);
  assert.match(result, /&lt;img/);
});
