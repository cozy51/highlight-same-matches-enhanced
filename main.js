"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => EnhancedMatches
});
module.exports = __toCommonJS(main_exports);
var import_view = require("@codemirror/view");
var import_obsidian = require("obsidian");

// src/matches.ts
var wordCharacter = /[\p{L}\p{M}\p{N}\p{Pc}]/u;
function characterBefore(text, offset) {
  if (offset === 0) return "";
  const unit = text.charCodeAt(offset - 1);
  const start = unit >= 56320 && unit <= 57343 ? Math.max(0, offset - 2) : offset - 1;
  return text.slice(start, offset);
}
function characterAt(text, offset) {
  const code = text.codePointAt(offset);
  return code === void 0 ? "" : String.fromCodePoint(code);
}
function createMatcher(query, options) {
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(literal, options.caseSensitive ? "gu" : "giu");
  const checkStart = options.wholeWord && wordCharacter.test(characterAt(query, 0));
  const checkEnd = options.wholeWord && wordCharacter.test(characterBefore(query, query.length));
  return function* (text) {
    if (!query) return;
    expression.lastIndex = 0;
    for (; ; ) {
      const match = expression.exec(text);
      if (!match) return;
      const start = match.index;
      const end = start + match[0].length;
      expression.lastIndex = start + characterAt(text, start).length;
      if (checkStart && wordCharacter.test(characterBefore(text, start))) continue;
      if (checkEnd && wordCharacter.test(characterAt(text, end))) continue;
      yield [start, end];
    }
  };
}

// src/rendered-text.ts
var tableContent = "td, th, .cm-table-widget, .HyperMD-table-row, .HyperMD-table-row-0";
var block = "td, th, .cm-line, p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, dt, dd, div";
var excluded = [
  "script",
  "style",
  "[hidden]",
  '[aria-hidden="true"]',
  "button",
  "input",
  "textarea",
  ".cm-widgetBuffer",
  ".cm-foldPlaceholder",
  ".cm-gutters",
  ".cm-selectionLayer",
  ".cm-cursorLayer",
  ".markdown-embed",
  ".internal-embed",
  ".metadata-container",
  ".frontmatter-container",
  ".inline-title",
  ".heading-collapse-indicator",
  ".table-col-drag-handle",
  ".table-row-drag-handle"
].join(", ");
function insideTable(node) {
  const element = node.nodeType === 1 ? node : node.parentElement;
  return Boolean(element?.closest(tableContent));
}
function collectText(surface, tables) {
  const runs = [];
  const walker = surface.ownerDocument.createTreeWalker(surface, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      const el = node;
      if (el.matches(excluded) || el.style?.display === "none" || !tables && el.matches(tableContent)) {
        return NodeFilter.FILTER_REJECT;
      }
      return el.matches("br, hr, img") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  let container = null;
  let run;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType !== Node.TEXT_NODE) {
      run = void 0;
      continue;
    }
    const textNode = node;
    if (!textNode.length) continue;
    const parent = textNode.parentElement;
    const nextContainer = parent?.closest(block) ?? surface;
    if (!run || container !== nextContainer) {
      run = { text: "", segments: [] };
      container = nextContainer;
      runs.push(run);
    }
    const start = run.text.length;
    run.text += textNode.data;
    run.segments.push({ node: textNode, start, end: run.text.length });
  }
  return runs;
}
function segmentAt(segments, offset) {
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const index = low + high >>> 1;
    if (segments[index].end > offset) high = index;
    else low = index + 1;
  }
  return segments[low];
}
function rangeFor(run, start, end) {
  const first = segmentAt(run.segments, start);
  const last = segmentAt(run.segments, end - 1);
  const range = first.node.ownerDocument.createRange();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);
  return range;
}

// src/main.ts
var defaults = {
  background: "#ffec99",
  foreground: "#211900",
  opacity: 85,
  minimum: 2,
  caseSensitive: true,
  wholeWord: true,
  tables: true,
  reading: true
};
var surfaceClass = "hsm-enhanced-surface";
var matchKey = "hsm-enhanced-match";
var selectedKey = "hsm-enhanced-selected";
function getSurface(view) {
  const selector = view.getMode() === "preview" ? ".markdown-preview-sizer" : ".markdown-source-view .cm-content";
  return view.contentEl.querySelector(selector);
}
var EnhancedMatches = class extends import_obsidian.Plugin {
  settings = { ...defaults };
  note = null;
  path;
  surface = null;
  owner = null;
  observer = null;
  frame = null;
  selectionAllowed = false;
  index = null;
  unsupportedNoticeShown = false;
  disposed = false;
  async onload() {
    this.settings = { ...defaults, ...await this.loadData() };
    this.addSettingTab(new EnhancedSettings(this));
    this.registerEditorExtension(import_view.EditorView.updateListener.of((update) => {
      if (!this.note?.contentEl.contains(update.view.dom)) return;
      if (update.docChanged || update.viewportChanged) this.index = null;
      if (update.selectionSet && update.view.hasFocus) this.selectionAllowed = true;
      if (update.selectionSet || update.docChanged || update.viewportChanged || update.focusChanged) {
        this.schedule();
      }
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", this.syncNote));
    this.registerEvent(this.app.workspace.on("file-open", this.syncNote));
    this.registerEvent(this.app.workspace.on("layout-change", this.syncNote));
    this.app.workspace.onLayoutReady(() => {
      if (!this.disposed) this.syncNote();
    });
  }
  onunload() {
    this.disposed = true;
    this.detach();
  }
  async change(key, value) {
    this.settings[key] = value;
    if (key === "tables") this.index = null;
    this.applyColors();
    this.schedule();
    await this.saveData({ ...this.settings });
  }
  syncNote = () => {
    if (this.disposed) return;
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (view === this.note && view?.file?.path === this.path) {
      this.schedule();
      return;
    }
    this.detach();
    if (!view?.file) return;
    const doc = view.contentEl.ownerDocument;
    const owner = doc.defaultView;
    if (!owner?.CSS?.highlights || typeof owner.Highlight !== "function") {
      if (!this.unsupportedNoticeShown) {
        this.unsupportedNoticeShown = true;
        new import_obsidian.Notice("Highlight Same Matches Enhanced：この環境は文字列の強調表示機能に対応していません。");
      }
      return;
    }
    this.note = view;
    this.path = view.file.path;
    this.owner = owner;
    doc.addEventListener("selectionchange", this.onSelection);
    this.observer = new owner.MutationObserver(() => {
      this.index = null;
      this.schedule();
    });
    this.observer.observe(view.contentEl, {
      subtree: true,
      childList: true,
      characterData: true,
      attributeFilter: ["style", "hidden", "aria-hidden"]
    });
    this.refreshSurface();
  };
  onSelection = () => {
    this.selectionAllowed = true;
    this.schedule();
  };
  schedule() {
    if (!this.owner || this.frame !== null) return;
    this.frame = this.owner.requestAnimationFrame(() => {
      this.frame = null;
      this.paint();
    });
  }
  clearHighlights() {
    this.owner?.CSS.highlights.delete(matchKey);
    this.owner?.CSS.highlights.delete(selectedKey);
  }
  resetSurface() {
    this.surface?.classList.remove(surfaceClass);
    this.surface?.style.removeProperty("--hsm-enhanced-bg");
    this.surface?.style.removeProperty("--hsm-enhanced-fg");
    this.surface = null;
    this.index = null;
    this.clearHighlights();
  }
  detach() {
    if (this.frame !== null) this.owner?.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.observer?.disconnect();
    this.observer = null;
    this.note?.contentEl.ownerDocument.removeEventListener("selectionchange", this.onSelection);
    this.resetSurface();
    this.selectionAllowed = false;
    this.note = null;
    this.path = void 0;
    this.owner = null;
  }
  refreshSurface() {
    const next = this.note && getSurface(this.note);
    if (next === this.surface) return;
    this.resetSurface();
    this.surface = next;
    this.surface?.classList.add(surfaceClass);
    this.applyColors();
  }
  applyColors() {
    this.surface?.style.setProperty(
      "--hsm-enhanced-bg",
      `color-mix(in srgb, ${this.settings.background} ${this.settings.opacity}%, transparent)`
    );
    this.surface?.style.setProperty("--hsm-enhanced-fg", this.settings.foreground);
  }
  paint() {
    this.refreshSurface();
    const { surface, owner, note } = this;
    if (!surface || !owner || !note) return;
    const selection = owner.getSelection();
    if (!this.selectionAllowed || !selection || selection.isCollapsed || !selection.rangeCount || note.getMode() === "preview" && !this.settings.reading) {
      this.clearHighlights();
      return;
    }
    const selectedRange = selection.getRangeAt(0);
    if (!surface.contains(selectedRange.startContainer) || !surface.contains(selectedRange.endContainer) || !this.settings.tables && (insideTable(selectedRange.startContainer) || insideTable(selectedRange.endContainer))) {
      this.clearHighlights();
      return;
    }
    const query = selectedRange.toString().trim();
    if (!query || Array.from(query).length < this.settings.minimum) {
      this.clearHighlights();
      return;
    }
    this.index ??= collectText(surface, this.settings.tables);
    const find = createMatcher(query, this.settings);
    const matches = new owner.Highlight();
    const selected = new owner.Highlight(selectedRange.cloneRange());
    selected.priority = 1;
    for (const run of this.index) {
      for (const [start, end] of find(run.text)) {
        const match = rangeFor(run, start, end);
        if (selectedRange.compareBoundaryPoints(Range.START_TO_START, match) <= 0 && selectedRange.compareBoundaryPoints(Range.END_TO_END, match) >= 0) continue;
        matches.add(match);
      }
    }
    owner.CSS.highlights.set(matchKey, matches);
    owner.CSS.highlights.set(selectedKey, selected);
  }
};
var EnhancedSettings = class extends import_obsidian.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  plugin;
  display() {
    const root = this.containerEl;
    root.empty();
    const { settings } = this.plugin;
    new import_obsidian.Setting(root).setName("ハイライトの背景色").addColorPicker((input) => input.setValue(settings.background).onChange((value) => this.plugin.change("background", value)));
    new import_obsidian.Setting(root).setName("ハイライトの文字色").addColorPicker((input) => input.setValue(settings.foreground).onChange((value) => this.plugin.change("foreground", value)));
    new import_obsidian.Setting(root).setName("背景色の不透明度").setDesc("0%で透明、100%で不透明になります。").addSlider((input) => input.setLimits(0, 100, 1).setDynamicTooltip().setValue(settings.opacity).onChange((value) => this.plugin.change("opacity", value)));
    new import_obsidian.Setting(root).setName("最小選択文字数").setDesc("1文字以上の整数を入力してください。").addText((input) => {
      input.inputEl.type = "number";
      input.inputEl.min = "1";
      input.inputEl.step = "1";
      input.setValue(String(settings.minimum)).onChange((value) => {
        const count = Number(value);
        if (Number.isSafeInteger(count) && count >= 1) return this.plugin.change("minimum", count);
      });
      input.inputEl.addEventListener("blur", () => input.setValue(String(settings.minimum)));
    });
    const toggles = [
      ["caseSensitive", "大文字・小文字を区別する", "オフにすると、英字の大文字と小文字を同じものとして扱います。"],
      ["wholeWord", "完全な単語のみ一致させる", "オフにすると、部品番号や日本語の文字列の途中も検索します。"],
      ["tables", "表内のハイライト", "表内からの選択と表内への強調表示を有効にします。"],
      ["reading", "閲覧モードのハイライト", "閲覧モードで選択文字列と一致する箇所を強調します。"]
    ];
    for (const [key, name, description] of toggles) {
      new import_obsidian.Setting(root).setName(name).setDesc(description).addToggle((input) => input.setValue(settings[key]).onChange((value) => this.plugin.change(key, value)));
    }
  }
};
