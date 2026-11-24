export interface MatchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

const wordCharacter = /[\p{L}\p{M}\p{N}\p{Pc}]/u;

function characterBefore(text: string, offset: number): string {
  if (offset === 0) return '';
  const unit = text.charCodeAt(offset - 1);
  const start = unit >= 0xdc00 && unit <= 0xdfff ? Math.max(0, offset - 2) : offset - 1;
  return text.slice(start, offset);
}

function characterAt(text: string, offset: number): string {
  const code = text.codePointAt(offset);
  return code === undefined ? '' : String.fromCodePoint(code);
}

export function createMatcher(query: string, options: MatchOptions) {
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(literal, options.caseSensitive ? 'gu' : 'giu');
  const checkStart = options.wholeWord && wordCharacter.test(characterAt(query, 0));
  const checkEnd = options.wholeWord && wordCharacter.test(characterBefore(query, query.length));

  return function* (text: string): Generator<[number, number]> {
    if (!query) return;
    expression.lastIndex = 0;
    for (;;) {
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
