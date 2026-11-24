// Obsidian renders live tables as widgets with their own DOM and cell editor.
const tableContent = 'td, th, .cm-table-widget, .HyperMD-table-row, .HyperMD-table-row-0';
const block = 'td, th, .cm-line, p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, dt, dd, div';
const excluded = [
  'script', 'style', '[hidden]', '[aria-hidden="true"]', 'button', 'input',
  'textarea', '.cm-widgetBuffer', '.cm-foldPlaceholder', '.cm-gutters',
  '.cm-selectionLayer', '.cm-cursorLayer', '.markdown-embed', '.internal-embed',
  '.metadata-container', '.frontmatter-container', '.inline-title', '.heading-collapse-indicator',
  '.table-col-drag-handle', '.table-row-drag-handle',
].join(', ');

export function insideTable(node: Node): boolean {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  return Boolean(element?.closest(tableContent));
}

interface Segment {
  node: Text;
  start: number;
  end: number;
}

interface Run {
  text: string;
  segments: Segment[];
}

export function collectText(surface: HTMLElement, tables: boolean): Run[] {
  const runs: Run[] = [];
  const walker = surface.ownerDocument.createTreeWalker(surface, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      const el = node as Element;
      if (el.matches(excluded) || (el as HTMLElement).style?.display === 'none' || (!tables && el.matches(tableContent))) {
        return NodeFilter.FILTER_REJECT;
      }
      return el.matches('br, hr, img') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  let container: Element | null = null;
  let run: Run | undefined;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType !== Node.TEXT_NODE) {
      run = undefined;
      continue;
    }
    const textNode = node as Text;
    if (!textNode.length) continue;
    const parent = textNode.parentElement;
    const nextContainer = parent?.closest(block) ?? surface;
    if (!run || container !== nextContainer) {
      run = { text: '', segments: [] };
      container = nextContainer;
      runs.push(run);
    }
    const start = run.text.length;
    run.text += textNode.data;
    run.segments.push({ node: textNode, start, end: run.text.length });
  }
  return runs;
}

function segmentAt(segments: Segment[], offset: number): Segment {
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const index = (low + high) >>> 1;
    if (segments[index].end > offset) high = index;
    else low = index + 1;
  }
  return segments[low];
}

export function rangeFor(run: Run, start: number, end: number): Range {
  const first = segmentAt(run.segments, start);
  const last = segmentAt(run.segments, end - 1);
  const range = first.node.ownerDocument.createRange();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);
  return range;
}
