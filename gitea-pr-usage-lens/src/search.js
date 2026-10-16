// 캐시된 파일 텍스트에서 식별자 사용처를 찾는다. 단어 경계 기반 텍스트 검색에 "정의 추정" 휴리스틱을 더한다.
var GUL = globalThis.GUL || (globalThis.GUL = {});

(function () {
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const NOT_DECL_START = /^\s*(return|new|throw|await|yield|else|case|if|while|for|switch|delete|typeof|assert|print)\b/;

  function isDefinition(line, word) {
    const w = escapeRe(word);
    // def foo / fun foo / func (r *T) Foo / class Foo / interface Foo …
    if (new RegExp(`\\b(def|fun|func|function|fn|class|interface|struct|enum|trait|object|type|record|module|sub|macro)\\s+(\\([^)]*\\)\\s*)?\\*?${w}(?![\\w$])`).test(line)) return true;
    // const foo = / val foo: / let foo =
    if (new RegExp(`\\b(const|let|var|val)\\s+${w}\\s*[:=]`).test(line)) return true;
    if (NOT_DECL_START.test(line)) return false;
    // Java/C#/Kotlin/TS 스타일 메서드 선언: "public static Foo bar(" "async bar(" "void bar();"
    if (new RegExp(`^\\s*(?:[\\w$@<>\\[\\],.?]+\\s+)+${w}\\s*(<[^>]*>)?\\s*\\(`).test(line)) return true;
    // JS/TS 클래스 메서드: "bar(a: string): void {"
    if (new RegExp(`^\\s*${w}\\s*\\([^)]*\\)\\s*(:\\s*[^{;=]+)?\\{\\s*$`).test(line)) return true;
    // Go 구조체 필드: "LoggingInterval    uint   `default:\"0\"`"
    if (new RegExp(`^\\s*${w}\\s+[\\w*.\\[\\]]+\\s*(\`[^\`]*\`)?\\s*(//.*)?$`).test(line)) return true;
    return false;
  }

  function snippet(line) {
    const t = line.replace(/\t/g, '  ').trim();
    return t.length > 220 ? t.slice(0, 220) + '…' : t;
  }

  /**
   * @param {Map<string,string>} files path -> text
   * @param {string} word
   * @returns {{defs: Hit[], uses: Hit[], total: number, fileCount: number, shown: number}}
   *   Hit = { path, line, text, def }
   */
  GUL.searchUsages = function (files, word, limit = 300) {
    const re = new RegExp(`(?<![\\w$])${escapeRe(word)}(?![\\w$])`, 'g');
    const defs = [];
    const uses = [];
    let total = 0;
    let fileCount = 0;

    for (const [path, text] of files) {
      if (!text.includes(word)) continue;
      re.lastIndex = 0;
      let m;
      let lineNo = 1;
      let scanPos = 0;
      let lastLine = -1;
      let hitInFile = false;

      while ((m = re.exec(text))) {
        // scanPos ~ m.index 사이의 줄바꿈 수를 세어 줄 번호를 구한다.
        for (let i = text.indexOf('\n', scanPos); i !== -1 && i < m.index; i = text.indexOf('\n', i + 1)) lineNo++;
        scanPos = m.index;
        if (lineNo === lastLine) continue;
        lastLine = lineNo;
        hitInFile = true;
        total++;
        if (defs.length + uses.length >= limit) continue;

        const start = text.lastIndexOf('\n', m.index - 1) + 1;
        let end = text.indexOf('\n', m.index);
        if (end === -1) end = text.length;
        const line = text.slice(start, end).replace(/\r$/, '');
        const hit = { path, line: lineNo, text: snippet(line), def: isDefinition(line, word) };
        (hit.def ? defs : uses).push(hit);
      }
      if (hitInFile) fileCount++;
    }

    const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line);
    defs.sort(byPath);
    uses.sort(byPath);
    return { defs, uses, total, fileCount, shown: defs.length + uses.length };
  };

  // 너무 흔해서 검색 의미가 없는 단어
  GUL.IGNORED_WORDS = new Set((
    'if else for while do return break continue switch case default try catch finally throw throws new this self super ' +
    'true false null nil None True False undefined void int long short byte char float double boolean bool string String ' +
    'var let const val fun func function def class interface enum struct public private protected internal static final ' +
    'abstract override async await import from package export as in is not and or of the with yield lambda pass ' +
    'extends implements instanceof typeof delete get set'
  ).split(' '));

  GUL.isDefinition = isDefinition;
  GUL._test = Object.assign(GUL._test || {}, { isDefinition });
})();
