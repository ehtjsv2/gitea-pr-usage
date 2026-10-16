// PR 페이지 진입점: diff 코드 위 식별자 hover 감지 → base 브랜치 인덱스 검색 → 툴팁 표시
var GUL = globalThis.GUL || (globalThis.GUL = {});

(async function main() {
  if (GUL.started) return;
  GUL.started = true;

  const HIDE_GRACE = 300;
  const MAX_PAGE_HIGHLIGHTS = 2000;
  const MAX_PAGE_ITEMS = 200;

  const LOG = '[PR Usage Lens]';
  const settings = await GUL.loadSettings();
  let inst = GUL.findInstance(location.href, settings.instances);
  if (!inst) {
    console.info(LOG, '설정된 사이트가 아니라 비활성화:', location.host);
    return;
  }
  const platform = GUL.platforms[inst.type];
  const CODE_SEL = platform.codeSelector;

  // ---- 지금 보고 있는 PR ----
  // 주소에서 PR 정보를 읽어 두고, 토큰이 바뀌면 다시 만든다.
  let ctx = null;

  // 설정 페이지에서 토큰 등을 바꾸면 새로고침 없이 반영한다. (클라이언트를 새 토큰으로 다시 만든다)
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    Object.assign(settings, await GUL.loadSettings());
    inst = GUL.findInstance(location.href, settings.instances) || inst;
    ctx = null;
  });

  function currentContext() {
    const pr = platform.parsePr(location);
    if (!pr) return null;
    const key = `${pr.base}|${pr.ownerPath}/${pr.repoPath}#${pr.index}`;
    if (ctx?.key === key) return ctx;
    const owner = decodeURIComponent(pr.ownerPath);
    const repo = decodeURIComponent(pr.repoPath);
    ctx = { ...pr, key, owner, repo, repoKey: `${pr.base}|${owner}/${repo}`, indexPromise: null, results: new Map() };
    ctx.client = platform.createClient(ctx, inst);
    console.info(LOG, `활성화: ${platform.name} ${owner}/${repo} #${pr.index}`);
    return ctx;
  }

  // ---- 인덱스 ----
  let progressText = '';

  function getIndex(c) {
    if (!c.indexPromise) {
      c.indexPromise = (async () => {
        progressText = 'PR 정보 가져오는 중…';
        onProgress();
        const sha = await c.client.getBaseSha(c.index);
        if (!sha) throw new Error('PR의 base 커밋을 확인할 수 없습니다.');
        const idx = await GUL.buildIndex({
          client: c.client, repoKey: c.repoKey, sha, settings,
          onProgress: (s) => { progressText = s; onProgress(); }
        });
        console.info(LOG, `${idx.mode} · base ${sha.slice(0, 8)} · 파일 ${idx.files.size}개 · 새로 받은 파일 ${idx.fetched}개`);
        return idx;
      })();
      c.indexPromise.catch(() => { c.indexPromise = null; });
    }
    return c.indexPromise;
  }

  // 캐시가 이미 있으면 PR 페이지에 들어올 때 바로 증분 갱신한다. 없으면 첫 hover 때 받는다.
  function prefetch() {
    const c = currentContext();
    if (!c) return;
    GUL.store.getMeta(c.repoKey).then((m) => { if (m) getIndex(c).catch(() => {}); }).catch(() => {});
  }
  prefetch();

  // ---- 툴팁 상태 ----
  const tooltip = new GUL.Tooltip();
  let current = null;   // 현재 표시 중인 { word, rect, el }
  let waiting = false;  // 인덱스 준비를 기다리는 중
  let openSeq = 0;
  let openTimer = null;
  let pendingKey = null;
  let hideTimer = null;
  let lastPointer = null;

  function onProgress() {
    if (current && waiting) tooltip.update(GUL.renderLoading(current.word, progressText));
  }

  function describe(err) {
    if (err instanceof GUL.ApiError) {
      if (err.rateLimited) {
        return `${platform.name} API 사용량 제한에 걸렸습니다. 확장 설정에서 이 사이트의 토큰을 넣으면 한도가 크게 늘어납니다.`;
      }
      if (err.status === 401 || err.status === 403 || err.status === 404) {
        return `${platform.name} API 접근 실패 (${err.status}). ${platform.authHint(inst)}`;
      }
    }
    return err?.message || String(err);
  }

  let jumpTargets = []; // 툴팁의 data-jump 번호 → diff 안의 .code-inner 요소

  /**
   * base 검색 결과와 PR diff 화면의 줄을 하나의 목록으로 합친다. 같은 줄은 한 번만 나온다.
   * - inPr: diff 화면에 보이는 줄 → 클릭 시 화면 안에서 이동 (jump)
   * - 그 외: PR 범위 밖 → 새 탭에서 base 파일 열기 (href)
   * - kind: 'def'(정의 추정) | 'use'
   * 지금 마우스를 올린 줄은 목록에서 뺀다.
   */
  function classify(result, pageItems, hit, sha, c) {
    jumpTargets = [];
    const toJump = (el) => jumpTargets.push(el) - 1;
    const order = new Map(pageItems.map((it, i) => [it.el, i]));
    const used = new Set();
    const link = (path, line) => platform.linkFor(c, sha, path, line);
    const entries = [];
    entries.currentIsDef = GUL.isDefinition(hit.el.textContent, hit.word);
    let currentMatched = false;

    for (const h of [...result.defs, ...result.uses]) {
      let line = findDiffLine(pageItems, h);
      // 지금 보고 있는 줄에 해당하는 base 결과는 목록에서 뺀다 (한 번만).
      if (line && line.el === hit.el && !currentMatched) {
        currentMatched = true;
        entries.currentIsDef = h.def;
        continue;
      }
      // 같은 내용의 줄이 여러 개면 이미 쓴 줄을 건너뛰고 다음으로 가까운 줄을 찾는다.
      if (line && (used.has(line.el) || line.el === hit.el)) {
        line = findDiffLine(pageItems, h, (l) => !used.has(l.el) && l.el !== hit.el);
      }
      if (line) {
        used.add(line.el);
        entries.push({ kind: h.def ? 'def' : 'use', inPr: true, sign: line.sign, path: line.path, line: line.line, text: h.text, jump: toJump(line.el), order: order.get(line.el) });
      } else {
        entries.push({ kind: h.def ? 'def' : 'use', inPr: false, path: h.path, line: h.line, text: h.text, href: link(h.path, h.line) });
      }
    }
    // base에 없는 줄(이 PR에서 추가된 줄 등)
    for (const it of pageItems) {
      if (used.has(it.el) || it.el === hit.el) continue;
      used.add(it.el);
      const kind = GUL.isDefinition(it.el.textContent, hit.word) ? 'def' : 'use';
      entries.push({ kind, inPr: true, sign: it.sign, path: it.path, line: it.line, text: it.text, jump: toJump(it.el), order: order.get(it.el) });
    }
    return entries;
  }

  async function open(hit) {
    const c = currentContext();
    if (!c) return;
    const seq = ++openSeq;
    current = hit;
    cancelHide();

    // 토큰이 꼭 필요한 플랫폼(Gitea)인데 비어 있으면, API 실패를 기다리지 않고 바로 안내한다.
    if (platform.requiresToken && !inst.token) {
      tooltip.show(hit.rect, GUL.renderError(hit.word,
        `${platform.name} 토큰이 설정되지 않았습니다. ${platform.name} API는 브라우저 로그인 쿠키를 받지 않아서, ` +
        '토큰이 있어야 저장소 코드를 읽을 수 있습니다. 설정에서 이 주소의 토큰을 넣으면 새로고침 없이 바로 적용됩니다.',
        { openOptions: true }));
      return;
    }

    const page = collectPageLines(hit.word);

    tooltip.show(hit.rect, GUL.renderLoading(hit.word, progressText));
    waiting = true;
    try {
      const idx = await getIndex(c);
      if (seq !== openSeq) return;
      let result = c.results.get(hit.word);
      if (!result) {
        result = GUL.searchUsages(idx.files, hit.word);
        c.results.set(hit.word, result);
      }
      waiting = false;
      tooltip.update(GUL.renderResult({
        word: hit.word,
        sha: idx.sha,
        entries: classify(result, page.items, hit, idx.sha, c),
        truncated: result.shown < result.total ? result.total : 0
      }));
    } catch (err) {
      if (seq !== openSeq) return;
      waiting = false;
      console.error(LOG, err);
      tooltip.update(GUL.renderError(hit.word, describe(err)));
    }
  }

  function hide({ keepHighlight = false } = {}) {
    cancelHide();
    openSeq++;
    current = null;
    waiting = false;
    tooltip.hide();
    if (!keepHighlight) {
      try { window.CSS.highlights?.delete('gul-word'); } catch {}
    }
  }

  // 툴팁 항목 클릭 → diff 안의 해당 줄로 스크롤하고 잠깐 강조한다.
  let suppressPointer = false;
  tooltip.onJump = (i) => {
    const el = jumpTargets[i];
    if (!el || !el.isConnected) return;
    hide({ keepHighlight: true });
    // 스크롤 직후 브라우저가 보내는 가짜 mousemove로 툴팁이 다시 뜨지 않게 한다.
    suppressPointer = true;
    // 긴 diff에서도 바로 도착하도록 즉시 이동하고, 도착한 줄은 테두리로 알려준다.
    el.scrollIntoView({ block: 'center' });
    const row = el.closest('tr');
    if (row) {
      row.classList.remove('gul-flash');
      void row.offsetWidth;
      row.classList.add('gul-flash');
      setTimeout(() => row.classList.remove('gul-flash'), 1800);
    }
  };

  function scheduleHide() {
    if (!tooltip.visible || hideTimer) return;
    hideTimer = setTimeout(hide, HIDE_GRACE);
  }

  function cancelHide() {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  // content script에서는 설정 페이지를 직접 열 수 없어서 background에 부탁한다.
  tooltip.onOpenOptions = () => {
    chrome.runtime.sendMessage({ type: 'gul:openOptions' }).catch(() => {});
    hide();
  };

  tooltip.onReindex = async () => {
    const hit = current;
    const c = currentContext();
    if (!c) return;
    await GUL.store.clearRepo(c.repoKey);
    c.indexPromise = null;
    c.results.clear();
    if (hit) open(hit);
  };

  // ---- 포인터 아래 단어 찾기 ----
  const isWordChar = (c) => !!c && /[\p{L}\p{N}_$]/u.test(c);

  function textNodesOf(el) {
    const nodes = [];
    let full = '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      nodes.push({ node: t, start: full.length });
      full += t.data;
    }
    return { nodes, full };
  }

  function rangeFor(nodes, start, end) {
    const range = document.createRange();
    let startSet = false;
    for (let i = 0; i < nodes.length; i++) {
      const { node, start: s } = nodes[i];
      const e = s + node.data.length;
      if (!startSet && start < e) { range.setStart(node, start - s); startSet = true; }
      if (startSet && end <= e) { range.setEnd(node, end - s); return range; }
    }
    return null;
  }

  const inRect = (r, x, y) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1;

  function wordAt(x, y, codeEl) {
    const caret = document.caretRangeFromPoint(x, y);
    if (!caret || caret.startContainer.nodeType !== Node.TEXT_NODE || !codeEl.contains(caret.startContainer)) return null;

    const { nodes, full } = textNodesOf(codeEl);
    const caretNode = nodes.find((n) => n.node === caret.startContainer);
    if (!caretNode) return null;
    const off = caretNode.start + caret.startOffset;

    // 캐럿은 글자 사이를 가리키므로 앞뒤 글자 중 실제로 포인터 아래 있는 쪽을 고른다.
    let pos = -1;
    for (const p of [off, off - 1]) {
      if (!isWordChar(full[p])) continue;
      const r = rangeFor(nodes, p, p + 1);
      if (r && inRect(r.getBoundingClientRect(), x, y)) { pos = p; break; }
    }
    if (pos < 0) return null;

    let s = pos;
    let e = pos + 1;
    while (s > 0 && isWordChar(full[s - 1])) s--;
    while (e < full.length && isWordChar(full[e])) e++;
    const word = full.slice(s, e);
    if (word.length < 2 || !/^[\p{L}_$]/u.test(word) || GUL.IGNORED_WORDS.has(word)) return null;

    const range = rangeFor(nodes, s, e);
    return range ? { word, rect: range.getBoundingClientRect(), el: codeEl } : null;
  }

  // diff 줄 정보(파일 경로, +/-, 줄 번호)는 플랫폼마다 화면 구조가 달라 platforms.js가 읽는다.
  const lineInfo = (el) => platform.lineInfo(el);

  const normalize = (s) => s.replace(/\s+/g, ' ').trim();

  // base 검색 결과 한 줄이 PR diff 화면에 보이면 그 줄 정보를 돌려준다.
  // 변경 전 쪽(변경 없음/삭제) 줄을 우선 찾고, 없으면 같은 내용의 추가된 줄을 찾는다.
  // (base 브랜치가 PR 이후로 진행되어 이미 같은 코드를 갖고 있는 경우)
  function findDiffLine(pageItems, hit, allow = () => true) {
    const target = normalize(hit.text.replace(/…$/, ''));
    const closest = (pred, lineOf) => {
      let best = null;
      for (const l of pageItems) {
        if (!pred(l) || !allow(l) || !l.text.startsWith(target)) continue;
        if (!best || Math.abs(lineOf(l) - hit.line) < Math.abs(lineOf(best) - hit.line)) best = l;
      }
      return best;
    };
    return closest((l) => l.oldLine && l.oldPath === hit.path, (l) => l.oldLine) ||
      closest((l) => l.sign === '+' && l.path === hit.path, (l) => l.line);
  }

  // ---- 현재 PR 화면 안의 같은 단어: 강조(CSS Custom Highlight API) + 줄 목록 ----
  function collectPageLines(word) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_$])${word.replace(/\$/g, '\\$')}(?![\\p{L}\\p{N}_$])`, 'gu');
    const ranges = [];
    const items = [];
    let count = 0;
    for (const el of document.querySelectorAll(CODE_SEL)) {
      if (!el.textContent.includes(word)) continue;
      const { nodes, full } = textNodesOf(el);
      let found = false;
      for (const m of full.matchAll(re)) {
        count++;
        found = true;
        if (ranges.length < MAX_PAGE_HIGHLIGHTS) {
          const r = rangeFor(nodes, m.index, m.index + word.length);
          if (r) ranges.push(r);
        }
      }
      if (!found) continue;
      const info = lineInfo(el);
      if (!info) continue;
      if (items.length < MAX_PAGE_ITEMS) items.push({ ...info, text: normalize(full) });
    }
    try {
      if (window.CSS.highlights) window.CSS.highlights.set('gul-word', new Highlight(...ranges));
    } catch {}
    return { count, items };
  }

  // ---- 이벤트 ----
  function handlePointer(x, y, target, altKey) {
    if (tooltip.contains(target)) {
      cancelHide();
      clearTimeout(openTimer);
      pendingKey = null;
      return;
    }

    const codeEl = target?.closest?.(CODE_SEL);
    const hit = codeEl && currentContext() ? wordAt(x, y, codeEl) : null;

    if (hit && current && hit.word === current.word && inRect(current.rect, x, y)) {
      cancelHide();
      return;
    }

    const allowed = settings.trigger !== 'alt' || altKey;
    if (!hit || !allowed) {
      clearTimeout(openTimer);
      pendingKey = null;
      scheduleHide();
      return;
    }

    const key = `${hit.word}@${Math.round(hit.rect.left)},${Math.round(hit.rect.top)}`;
    if (key === pendingKey) return;
    clearTimeout(openTimer);
    pendingKey = key;
    openTimer = setTimeout(() => { pendingKey = null; open(hit); }, settings.hoverDelay);
  }

  document.addEventListener('mousemove', (e) => {
    if (suppressPointer) {
      if (!e.movementX && !e.movementY) return;
      suppressPointer = false;
    }
    lastPointer = { x: e.clientX, y: e.clientY, target: e.target };
    handlePointer(e.clientX, e.clientY, e.target, e.altKey);
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tooltip.visible) hide();
    if (e.key === 'Alt' && settings.trigger === 'alt' && lastPointer) {
      e.preventDefault();
      handlePointer(lastPointer.x, lastPointer.y, lastPointer.target, true);
    }
  });

  window.addEventListener('scroll', () => { if (tooltip.visible) hide(); }, { passive: true });
})();
