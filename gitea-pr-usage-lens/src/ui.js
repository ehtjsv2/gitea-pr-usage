// 사용처 툴팁. Shadow DOM으로 Gitea 스타일과 격리하되, Gitea의 CSS 변수(--color-*)는 상속받아 테마를 따른다.
var GUL = globalThis.GUL || (globalThis.GUL = {});

(function () {
  const CSS = `
    :host { all: initial; }
    .box {
      --muted: var(--color-text-light-2, #636c76);
      --faint: var(--color-text-light-3, #8d96a0);
      --line: var(--color-secondary, #d0d7de);
      --bg: var(--color-box-body, #fff);
      --tint: rgba(127, 127, 127, .08);
      position: fixed; z-index: 2147483000;
      width: min(700px, calc(100vw - 32px)); max-height: min(65vh, 560px);
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--bg);
      color: var(--color-text, #1f2328);
      border: 1px solid var(--line);
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,.22);
      font: 12px/1.5 var(--fonts-regular, system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif);
    }
    .box[hidden] { display: none; }

    /* 헤더: 단어 + 요약 칩 */
    .head { padding: 10px 14px 8px; border-bottom: 1px solid var(--line); background: var(--tint); }
    .word { font: 600 14px var(--fonts-monospace, ui-monospace, Consolas, monospace); word-break: break-all; }
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
    .chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 0 8px; border-radius: 999px; line-height: 20px; font-size: 11px;
      color: var(--muted); border: 1px solid var(--line); background: var(--bg);
    }
    .chip b { font-weight: 700; color: var(--accent, inherit); }
    .chip b span { font-weight: 400; color: var(--faint); }
    .chip code { font: 11px var(--fonts-monospace, ui-monospace, Consolas, monospace); }
    .prefix { margin-top: 6px; color: var(--faint); font-size: 11px; overflow-wrap: anywhere; }
    .prefix span { color: var(--muted); font-weight: 600; margin-right: 6px; }

    /* 분류별 색 */
    .k-def { --accent: var(--color-purple, #8250df); }
    .k-pr  { --accent: var(--color-green, #1a7f37); }
    .k-out { --accent: var(--color-blue, #0969da); }

    .body { overflow: auto; }
    .sec + .sec { border-top: 1px solid var(--line); }
    .sec-head {
      position: sticky; top: 0; z-index: 1;
      display: flex; align-items: center; gap: 8px;
      padding: 7px 14px;
      background: color-mix(in srgb, var(--accent) 9%, var(--bg));
      border-bottom: 1px solid color-mix(in srgb, var(--accent) 20%, var(--bg));
      font-weight: 600; font-size: 12px;
    }
    .sec-head::before { content: ''; width: 3px; height: 14px; border-radius: 2px; background: var(--accent); }
    .count {
      min-width: 18px; padding: 0 6px; border-radius: 999px; text-align: center;
      font-size: 11px; line-height: 16px; font-weight: 700;
      color: var(--accent); border: 1px solid var(--accent);
    }
    .hint { margin-left: auto; font-weight: 400; font-size: 11px; color: var(--faint); }
    .sec-body { padding: 2px 0 8px; }

    /* 파일 헤더 */
    .file {
      margin: 6px 10px 2px; padding: 3px 8px; border-radius: 6px;
      background: var(--tint); line-height: 1.45;
    }
    .file .dir { color: var(--faint); }
    .file .name { font-weight: 600; white-space: nowrap; }
    .file a { color: inherit; text-decoration: none; }
    .file a .name { color: var(--color-primary, #0969da); }
    .file a:hover .name { text-decoration: underline; }

    /* 코드 줄 */
    a.hit {
      display: flex; align-items: baseline; gap: 8px;
      margin: 0 10px; padding: 1px 8px; border-radius: 4px;
      color: inherit; text-decoration: none;
      font: 12px/1.65 var(--fonts-monospace, ui-monospace, Consolas, monospace);
    }
    a.hit:hover { background: var(--color-hover, rgba(127,127,127,.14)); }
    .ln { flex: none; min-width: 36px; text-align: right; color: var(--faint); }
    .sign { flex: none; width: 10px; font-weight: 700; text-align: center; }
    .sign.add { color: var(--color-green, #1a7f37); }
    .sign.del { color: var(--color-red, #d1242f); }
    .code { flex: 1; min-width: 0; white-space: pre; overflow: hidden; text-overflow: ellipsis; }
    .ext { flex: none; color: var(--faint); }
    a.hit:hover .ext { color: var(--color-primary, #0969da); }
    mark { background: rgba(255, 196, 0, .45); color: inherit; border-radius: 2px; padding: 0 1px; }

    .msg { padding: 14px; color: var(--muted); }
    .err { color: var(--color-red, #d1242f); }
    .foot {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
      padding: 6px 14px; border-top: 1px solid var(--line); background: var(--tint);
      color: var(--faint); font-size: 11px;
    }
    button {
      font: inherit; padding: 2px 10px; cursor: pointer;
      color: var(--muted); background: var(--bg);
      border: 1px solid var(--line); border-radius: 6px;
    }
    button:hover { color: inherit; }
  `;

  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function highlight(text, word) {
    const re = new RegExp(`(?<![\\w$])${escRe(word)}(?![\\w$])`, 'g');
    return esc(text).replace(re, (m) => `<mark>${m}</mark>`);
  }

  class Tooltip {
    constructor() {
      this.host = document.createElement('gul-tooltip');
      this.root = this.host.attachShadow({ mode: 'open' });
      this.root.innerHTML = `<style>${CSS}</style><div class="box" hidden></div>`;
      this.box = this.root.querySelector('.box');
      this.onReindex = null;
      this.onJump = null;
      this.onOpenOptions = null;
      this.box.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="reindex"]') && this.onReindex) this.onReindex();
        if (e.target.closest('[data-action="options"]') && this.onOpenOptions) this.onOpenOptions();
        const jump = e.target.closest('[data-jump]');
        if (jump && this.onJump) {
          e.preventDefault();
          this.onJump(Number(jump.dataset.jump));
        }
      });
      document.documentElement.append(this.host);
    }

    get visible() { return !this.box.hidden; }

    contains(node) { return node === this.host || this.host.contains(node); }

    show(anchor, html) {
      this.box.innerHTML = html;
      this.box.hidden = false;
      this.position(anchor);
    }

    update(html) {
      if (this.box.hidden) return;
      const scroll = this.box.querySelector('.body')?.scrollTop || 0;
      this.box.innerHTML = html;
      const body = this.box.querySelector('.body');
      if (body) body.scrollTop = scroll;
      if (this.anchor) this.position(this.anchor);
    }

    position(anchor) {
      this.anchor = anchor;
      const gap = 6;
      const w = this.box.offsetWidth;
      const h = this.box.offsetHeight;
      let left = Math.min(Math.max(8, anchor.left), window.innerWidth - w - 8);
      let top = anchor.bottom + gap;
      if (top + h > window.innerHeight - 8 && anchor.top - gap - h > 8) top = anchor.top - gap - h;
      this.box.style.left = `${left}px`;
      this.box.style.top = `${Math.max(8, top)}px`;
    }

    hide() {
      this.box.hidden = true;
      this.box.innerHTML = '';
      this.anchor = null;
    }
  }

  function header(word, extra = '') {
    return `<div class="head"><div class="word">${esc(word)}</div>${extra}</div>`;
  }

  GUL.renderLoading = (word, status) =>
    header(word) + `<div class="msg">${esc(status || '준비 중…')}</div>`;

  // openOptions: 재시도 대신 "설정 열기" 버튼을 보여준다. (토큰이 없을 때 등)
  GUL.renderError = (word, message, { openOptions = false } = {}) =>
    header(word) + `<div class="msg err">${esc(message)}</div>` +
    `<div class="foot"><span></span>${openOptions
      ? '<button data-action="options">설정 열기</button>'
      : '<button data-action="reindex">다시 시도</button>'}</div>`;

  const SIGN_CLASS = { '+': 'add', '-': 'del', ' ': '' };

  // 한 줄. 이 PR 안이면 클릭 시 화면 안에서 이동(data-jump), 밖이면 새 탭에서 base 파일을 연다.
  function entryRow(e, word) {
    const code = `<span class="code">${highlight(e.text, word)}</span>`;
    if (e.inPr) {
      return `<a class="hit" href="#" data-jump="${e.jump}" title="이 PR 변경사항의 해당 줄로 이동">` +
        `<span class="ln">${e.line || ''}</span><span class="sign ${SIGN_CLASS[e.sign]}">${e.sign.trim()}</span>${code}</a>`;
    }
    return `<a class="hit" href="${esc(e.href)}" target="_blank" rel="noopener" title="새 탭에서 base 파일 열기">` +
      `<span class="ln">${e.line}</span><span class="sign"></span>${code}<span class="ext">↗</span></a>`;
  }

  // 여러 파일이 공유하는 디렉터리 접두어. 툴팁 위에 한 번만 보여주고 각 파일에서는 "…/"로 줄인다.
  function commonDir(paths) {
    const uniq = [...new Set(paths)];
    if (uniq.length < 2) return '';
    let prefix = uniq[0].slice(0, uniq[0].lastIndexOf('/') + 1);
    for (const p of uniq) {
      while (prefix && !p.startsWith(prefix)) prefix = prefix.slice(0, prefix.lastIndexOf('/', prefix.length - 2) + 1);
    }
    return prefix.length >= 20 ? prefix : '';
  }

  let shownPrefix = '';

  // 파일 경로: 파일 이름은 진하게(줄바꿈 없음), 디렉터리는 흐리게 표시하고 "/" 뒤에서만 줄바꿈한다.
  function fileHeader(path, href) {
    const short = shownPrefix && path.startsWith(shownPrefix) ? '…/' + path.slice(shownPrefix.length) : path;
    const slash = short.lastIndexOf('/');
    const dir = esc(short.slice(0, slash + 1)).replace(/\//g, '/<wbr>');
    const label = `<span class="dir">${dir}</span><span class="name">${esc(short.slice(slash + 1))}</span>`;
    return href
      ? `<div class="file" title="${esc(path)}"><a href="${esc(href)}" target="_blank" rel="noopener">${label}</a></div>`
      : `<div class="file" title="${esc(path)}">${label}</div>`;
  }

  // 파일별로 묶어서 보여준다. PR 밖 파일은 헤더를 눌러 파일 전체를 새 탭으로 열 수 있다.
  function groupedRows(list, word) {
    let out = '';
    let cur = null;
    for (const e of list) {
      if (e.path !== cur) {
        cur = e.path;
        out += fileHeader(e.path, e.inPr ? null : e.href.replace(/#L\d+$/, ''));
      }
      out += entryRow(e, word);
    }
    return out;
  }

  const byOrder = (a, b) => a.order - b.order;
  const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line);

  // 분류 하나: 색 막대 + 제목 + 개수 + 동작 안내, 그 아래 파일별 줄 목록
  function section(cls, title, count, hint, rows) {
    return `<section class="sec ${cls}"><div class="sec-head"><span>${title}</span><span class="count">${count}</span>` +
      `<span class="hint">${hint}</span></div><div class="sec-body">${rows}</div></section>`;
  }

  /**
   * @param {object} p
   * @param {string} p.word
   * @param {string} p.sha base 커밋
   * @param {{kind: 'def'|'use', inPr: boolean, sign?, path, line, text, jump?, href?, order?}[]} p.entries
   * @param {number} p.truncated base 검색 결과가 잘렸으면 전체 개수, 아니면 0
   */
  GUL.renderResult = ({ word, sha, entries, truncated }) => {
    const defs = entries.filter((e) => e.kind === 'def');
    const prUses = entries.filter((e) => e.kind === 'use' && e.inPr).sort(byOrder);
    const outUses = entries.filter((e) => e.kind === 'use' && !e.inPr).sort(byPath);
    defs.sort((a, b) => (a.inPr !== b.inPr ? (a.inPr ? -1 : 1) : a.inPr ? byOrder(a, b) : byPath(a, b)));

    shownPrefix = commonDir(entries.map((e) => e.path));
    const defLabel = entries.currentIsDef ? `${defs.length + 1} <span>(지금 보는 줄 포함)</span>` : `${defs.length}`;
    let head = `<div class="chips">` +
      `<span class="chip k-def">정의 <b>${defLabel}</b></span>` +
      `<span class="chip k-pr">이 PR <b>${prUses.length}</b></span>` +
      `<span class="chip k-out">PR 밖 <b>${outUses.length}</b></span>` +
      `<span class="chip">base <code>${esc(sha.slice(0, 8))}</code></span></div>`;
    if (shownPrefix) head += `<div class="prefix" title="아래 경로의 …/ 부분"><span>…/</span>${esc(shownPrefix)}</div>`;

    let body = '';
    if (defs.length) body += section('k-def', '정의 (추정)', defs.length, 'PR 안은 줄 이동 · 밖은 ↗ 새 탭', groupedRows(defs, word));
    if (prUses.length) body += section('k-pr', '사용처 · 이 PR', prUses.length, '클릭하면 해당 줄로 이동', groupedRows(prUses, word));
    if (outUses.length) body += section('k-out', '사용처 · PR 범위 밖', outUses.length, '↗ 새 탭에서 열기', groupedRows(outUses, word));
    if (!prUses.length && !outUses.length) {
      // 지금 보는 줄 자체가 사용처라면 "없다"가 아니라 "다른 곳은 없다"가 맞다.
      body += entries.currentIsDef
        ? `<div class="msg">사용처를 찾지 못했습니다. 아직 아무 곳에서도 쓰지 않거나, 이 PR에서 새로 추가된 식별자일 수 있습니다.</div>`
        : `<div class="msg">지금 보는 줄 말고 다른 사용처는 없습니다.</div>`;
    }

    const note = truncated ? `base 검색 결과 ${truncated}개 중 일부만 표시` : '텍스트 검색 결과 · 이름이 같은 다른 식별자가 섞일 수 있음';
    return header(word, head) + `<div class="body">${body}</div>` +
      `<div class="foot"><span>${note}</span><button data-action="reindex">재색인</button></div>`;
  };

  GUL.Tooltip = Tooltip;
})();
