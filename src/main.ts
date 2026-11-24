import { EditorView } from '@codemirror/view';
import { MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { createMatcher, type MatchOptions } from './matches';
import { collectText, insideTable, rangeFor } from './rendered-text';

interface Preferences extends MatchOptions {
  background: string;
  foreground: string;
  opacity: number;
  minimum: number;
  tables: boolean;
  reading: boolean;
}

const defaults: Preferences = {
  background: '#ffec99',
  foreground: '#211900',
  opacity: 85,
  minimum: 2,
  caseSensitive: true,
  wholeWord: true,
  tables: true,
  reading: true,
};

const surfaceClass = 'hsm-enhanced-surface';
const matchKey = 'hsm-enhanced-match';
const selectedKey = 'hsm-enhanced-selected';

function getSurface(view: MarkdownView): HTMLElement | null {
  const selector = view.getMode() === 'preview'
    ? '.markdown-preview-sizer'
    : '.markdown-source-view .cm-content';
  return view.contentEl.querySelector<HTMLElement>(selector);
}

export default class EnhancedMatches extends Plugin {
  settings = { ...defaults };
  private note: MarkdownView | null = null;
  private path: string | undefined;
  private surface: HTMLElement | null = null;
  private owner: (Window & typeof globalThis) | null = null;
  private observer: MutationObserver | null = null;
  private frame: number | null = null;
  private selectionAllowed = false;
  private index: ReturnType<typeof collectText> | null = null;
  private unsupportedNoticeShown = false;
  private disposed = false;

  async onload() {
    this.settings = { ...defaults, ...await this.loadData() };
    this.addSettingTab(new EnhancedSettings(this));
    this.registerEditorExtension(EditorView.updateListener.of(update => {
      if (!this.note?.contentEl.contains(update.view.dom)) return;
      if (update.docChanged || update.viewportChanged) this.index = null;
      if (update.selectionSet && update.view.hasFocus) this.selectionAllowed = true;
      if (update.selectionSet || update.docChanged || update.viewportChanged || update.focusChanged) {
        this.schedule();
      }
    }));
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.syncNote));
    this.registerEvent(this.app.workspace.on('file-open', this.syncNote));
    this.registerEvent(this.app.workspace.on('layout-change', this.syncNote));
    this.app.workspace.onLayoutReady(() => {
      if (!this.disposed) this.syncNote();
    });
  }

  onunload() {
    this.disposed = true;
    this.detach();
  }

  async change<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    this.settings[key] = value;
    if (key === 'tables') this.index = null;
    this.applyColors();
    this.schedule();
    await this.saveData({ ...this.settings });
  }

  private readonly syncNote = () => {
    if (this.disposed) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view === this.note && view?.file?.path === this.path) {
      this.schedule();
      return;
    }
    this.detach();
    if (!view?.file) return;
    const doc = view.contentEl.ownerDocument;
    const owner = doc.defaultView;
    if (!owner?.CSS?.highlights || typeof owner.Highlight !== 'function') {
      if (!this.unsupportedNoticeShown) {
        this.unsupportedNoticeShown = true;
        new Notice('Highlight Same Matches Enhanced：この環境は文字列の強調表示機能に対応していません。');
      }
      return;
    }
    this.note = view;
    this.path = view.file.path;
    this.owner = owner;
    doc.addEventListener('selectionchange', this.onSelection);
    this.observer = new owner.MutationObserver(() => {
      this.index = null;
      this.schedule();
    });
    this.observer.observe(view.contentEl, {
      subtree: true, childList: true, characterData: true,
      attributeFilter: ['style', 'hidden', 'aria-hidden'],
    });
    this.refreshSurface();
  };

  private readonly onSelection = () => {
    this.selectionAllowed = true;
    this.schedule();
  };

  private schedule() {
    if (!this.owner || this.frame !== null) return;
    this.frame = this.owner.requestAnimationFrame(() => {
      this.frame = null;
      this.paint();
    });
  }

  private clearHighlights() {
    this.owner?.CSS.highlights.delete(matchKey);
    this.owner?.CSS.highlights.delete(selectedKey);
  }

  private resetSurface() {
    this.surface?.classList.remove(surfaceClass);
    this.surface?.style.removeProperty('--hsm-enhanced-bg');
    this.surface?.style.removeProperty('--hsm-enhanced-fg');
    this.surface = null;
    this.index = null;
    this.clearHighlights();
  }

  private detach() {
    if (this.frame !== null) this.owner?.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.observer?.disconnect();
    this.observer = null;
    this.note?.contentEl.ownerDocument.removeEventListener('selectionchange', this.onSelection);
    this.resetSurface();
    this.selectionAllowed = false;
    this.note = null;
    this.path = undefined;
    this.owner = null;
  }

  private refreshSurface() {
    const next = this.note && getSurface(this.note);
    if (next === this.surface) return;
    this.resetSurface();
    this.surface = next;
    this.surface?.classList.add(surfaceClass);
    this.applyColors();
  }

  private applyColors() {
    this.surface?.style.setProperty('--hsm-enhanced-bg',
      `color-mix(in srgb, ${this.settings.background} ${this.settings.opacity}%, transparent)`);
    this.surface?.style.setProperty('--hsm-enhanced-fg', this.settings.foreground);
  }

  private paint() {
    this.refreshSurface();
    const { surface, owner, note } = this;
    if (!surface || !owner || !note) return;
    const selection = owner.getSelection();
    if (!this.selectionAllowed || !selection || selection.isCollapsed || !selection.rangeCount ||
        (note.getMode() === 'preview' && !this.settings.reading)) {
      this.clearHighlights();
      return;
    }

    const selectedRange = selection.getRangeAt(0);
    if (!surface.contains(selectedRange.startContainer) || !surface.contains(selectedRange.endContainer) ||
        (!this.settings.tables && (insideTable(selectedRange.startContainer) || insideTable(selectedRange.endContainer)))) {
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
        if (selectedRange.compareBoundaryPoints(Range.START_TO_START, match) <= 0 &&
            selectedRange.compareBoundaryPoints(Range.END_TO_END, match) >= 0) continue;
        matches.add(match);
      }
    }
    owner.CSS.highlights.set(matchKey, matches);
    owner.CSS.highlights.set(selectedKey, selected);
  }
}

class EnhancedSettings extends PluginSettingTab {
  constructor(private readonly plugin: EnhancedMatches) {
    super(plugin.app, plugin);
  }

  display() {
    const root = this.containerEl;
    root.empty();
    const { settings } = this.plugin;

    new Setting(root).setName('ハイライトの背景色').addColorPicker(input =>
      input.setValue(settings.background).onChange(value => this.plugin.change('background', value)));
    new Setting(root).setName('ハイライトの文字色').addColorPicker(input =>
      input.setValue(settings.foreground).onChange(value => this.plugin.change('foreground', value)));
    new Setting(root).setName('背景色の不透明度').setDesc('0%で透明、100%で不透明になります。').addSlider(input =>
      input.setLimits(0, 100, 1).setDynamicTooltip().setValue(settings.opacity)
        .onChange(value => this.plugin.change('opacity', value)));
    new Setting(root).setName('最小選択文字数').setDesc('1文字以上の整数を入力してください。').addText(input => {
      input.inputEl.type = 'number';
      input.inputEl.min = '1';
      input.inputEl.step = '1';
      input.setValue(String(settings.minimum)).onChange(value => {
        const count = Number(value);
        if (Number.isSafeInteger(count) && count >= 1) return this.plugin.change('minimum', count);
      });
      input.inputEl.addEventListener('blur', () => input.setValue(String(settings.minimum)));
    });

    const toggles = [
      ['caseSensitive', '大文字・小文字を区別する', 'オフにすると、英字の大文字と小文字を同じものとして扱います。'],
      ['wholeWord', '完全な単語のみ一致させる', 'オフにすると、部品番号や日本語の文字列の途中も検索します。'],
      ['tables', '表内のハイライト', '表内からの選択と表内への強調表示を有効にします。'],
      ['reading', '閲覧モードのハイライト', '閲覧モードで選択文字列と一致する箇所を強調します。'],
    ] as const;
    for (const [key, name, description] of toggles) {
      new Setting(root).setName(name).setDesc(description).addToggle(input =>
        input.setValue(settings[key]).onChange(value => this.plugin.change(key, value)));
    }
  }
}
