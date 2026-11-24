const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const part = 'Z067715030';
const row = (number, code, name) => `<tr><td>${number}</td><td>${code}</td><td>${name}</td></tr>`;
const table = `<table><thead><tr><th>No.</th><th>部品番号</th><th>部品名称</th></tr></thead><tbody>
  ${row(1, part, 'SW(PH) EX13A')}
  ${row(2, 'HJ1TA03741', 'ASSY Sensor')}
  ${row(3, part, 'SW(PH) EX13A')}
  ${row(4, 'HJ1TA04241', 'ASSY Belt Loose Sensor')}
  ${row(5, part, 'SW(PH) EX13A')}
</tbody></table>`;
const paragraphs = `<div class="cm-line">${part}</div><div class="cm-line">Z067<span>715030</span></div>`;
const initial = `<div class="markdown-source-view"><div class="cm-content">${paragraphs}<div class="cm-table-widget">${table}</div></div></div>`;
const dom = new JSDOM(`<main>${initial}</main>`, { pretendToBeVisual: true });
const { window } = dom;
const { document } = window;
window.CSS = { highlights: new Map() };
window.Highlight = class extends Set {
  constructor(...ranges) { super(ranges); }
};
const events = new Map();
let editorUpdate;
let mode = 'source';
const contentEl = document.querySelector('main');
const view = { contentEl, file: { path: '表の検証.md' }, getMode: () => mode };
class Plugin {
  app = { workspace: {
    getActiveViewOfType: () => view,
    on: (name, handler) => events.set(name, handler),
    onLayoutReady: (handler) => handler(),
  } };
  loadData() {}
  saveData() {}
  addSettingTab() {}
  registerEvent() {}
  registerEditorExtension(handler) { editorUpdate = handler; }
}

const hostModules = {
  obsidian: { Plugin, PluginSettingTab: class {}, MarkdownView: class {} },
  '@codemirror/view': { EditorView: { updateListener: { of: handler => handler } } },
};
const bundleModule = { exports: {} };
const bundle = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
new Function('require', 'module', 'Node', 'NodeFilter', 'Range', bundle)(
  id => hostModules[id], bundleModule, window.Node, window.NodeFilter, window.Range,
);

const tick = () => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
const registry = window.CSS.highlights;
const allMatches = () => [...registry.values()].flatMap(highlight => [...highlight]);
const count = async (expected, query = part) => {
  await tick();
  const matches = allMatches();
  assert.equal(matches.length, expected);
  if (expected) assert.ok(matches.every(range => range.toString().toLowerCase() === query.toLowerCase()));
};
function select(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.dispatchEvent(new window.Event('selectionchange'));
}

(async () => {
  try {
    const instance = new bundleModule.exports.default();
    await instance.onload();

    select(contentEl.querySelector('.cm-line'));
    await count(5);
    assert.equal(registry.get('hsm-enhanced-match').size, 4);
    select(contentEl.querySelector('tbody td:nth-child(2)'));
    await count(5);

    const cell = contentEl.querySelector('tbody td:nth-child(2)');
    cell.innerHTML = `<div class="table-cell-wrapper" style="display: none">${part}</div>
      <div class="table-cell-wrapper"><div class="cm-editor"><div class="cm-content" contenteditable="true"><div class="cm-line">${part}</div></div></div></div>`;
    select(cell.querySelector('.cm-line'));
    editorUpdate({ view: { dom: cell.querySelector('.cm-editor'), hasFocus: true }, selectionSet: true });
    await count(5);

    const extra = document.createElement('tr');
    extra.innerHTML = `<td>追加</td><td>${part}</td><td>遅延描画</td>`;
    contentEl.querySelector('tbody').append(extra);
    await count(6);
    extra.remove();
    await count(5);

    const manyRows = document.createElement('tbody');
    manyRows.innerHTML = Array.from({ length: 1500 }, (_, index) =>
      row(index, index % 100 === 0 ? part : 'HJ1TA03741', 'ASSY Sensor')).join('');
    contentEl.querySelector('table').append(manyRows);
    await count(20);
    manyRows.remove();
    await count(5);

    const paragraph = contentEl.querySelector('.cm-line');
    select(paragraph);
    await instance.change('tables', false);
    await count(2);
    await instance.change('tables', true);
    await count(5);
    window.getSelection().removeAllRanges();
    await count(0);

    contentEl.querySelector('.cm-content').innerHTML =
      `<div class="cm-line">${part}</div><div class="cm-line HyperMD-table-row">| ${part} |</div>`;
    select(contentEl.querySelector('.cm-line'));
    await count(2);
    await instance.change('tables', false);
    await count(1);
    await instance.change('tables', true);

    mode = 'preview';
    contentEl.innerHTML = `<div class="markdown-preview-sizer"><p>${part}</p><p>${part.toLowerCase()}</p>
      <p>別${part}部品</p>${table}</div>`;
    events.get('layout-change')();
    select(contentEl.querySelector('p'));
    await count(4);
    await instance.change('caseSensitive', false);
    await count(5);
    await instance.change('wholeWord', false);
    await count(6);
    await instance.change('reading', false);
    await count(0);
    await instance.change('reading', true);
    await count(6);

    contentEl.querySelector('.markdown-preview-sizer').innerHTML = '<p>部品(甲)+</p><p>部品(甲)+</p>';
    select(contentEl.querySelector('p'));
    await count(2, '部品(甲)+');

    view.file = { path: '別ノート.md' };
    events.get('file-open')();
    assert.equal(registry.size, 0);
    select(contentEl.querySelector('p'));
    await count(2, '部品(甲)+');
    instance.onunload();
    assert.equal(registry.size, 0);
    assert.equal(contentEl.querySelector('.hsm-enhanced-surface'), null);
    await count(0);
    console.log('DOM integration checks passed');
  } finally {
    window.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
