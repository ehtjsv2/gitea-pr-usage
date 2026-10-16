// Gitea 화면에 맞춘 부분: PR 주소 해석, diff 화면 구조, 링크, API 클라이언트.
// 나머지(색인·검색·툴팁)는 공통 코드다.
var GUL = globalThis.GUL || (globalThis.GUL = {});

(function () {
  const has = (node, cls) => !!node && node.classList.contains(cls);
  const num = (td) => Number(td?.dataset.lineNumber || td?.dataset.lineNum) || 0;

  const gitea = {
    name: 'Gitea',
    codeSelector: '.code-inner',
    // Gitea API는 로그인 쿠키를 받지 않으므로 토큰 없이는 코드를 읽을 수 없다.
    requiresToken: true,

    // "/{하위경로}/{owner}/{repo}/pulls/{번호}" 에서 하위 경로를 base로 본다.
    parsePr(loc) {
      const m = loc.pathname.match(/^(.*)\/([^/]+)\/([^/]+)\/pulls\/(\d+)(?:\/|$)/);
      if (!m) return null;
      return { base: loc.origin + m[1], ownerPath: m[2], repoPath: m[3], index: m[4] };
    },

    // unified: tr에 add-code/del-code/same-code가 붙는다.
    // split: 코드 셀(td)에 lines-code-old/new가 붙고, 삭제+추가가 짝지어진 행은 셀에, 한쪽만 있는 행은 tr에만 add-code/del-code가 붙는다.
    lineInfo(el) {
      const box = el.closest('.diff-file-box');
      const row = el.closest('tr');
      const td = el.closest('td');
      if (!box || !row || !td || has(row, 'tag-code')) return null;

      let side = has(td, 'lines-code-old') ? 'old' : has(td, 'lines-code-new') ? 'new' : null;
      let sign = ' ';
      if (has(td, 'add-code')) sign = '+';
      else if (has(td, 'del-code')) sign = '-';
      else if (has(row, 'add-code') && side !== 'old') sign = '+';
      else if (has(row, 'del-code') && side !== 'new') sign = '-';
      if (!side) side = sign === '-' ? 'old' : 'new';

      const oldPath = box.dataset.oldFilename || box.dataset.newFilename || '';
      const newPath = box.dataset.newFilename || oldPath;
      return {
        el,
        path: sign === '-' ? oldPath : newPath,
        sign,
        line: num(row.querySelector(side === 'old' ? '.lines-num-old' : '.lines-num-new')),
        oldLine: sign === '+' ? 0 : num(row.querySelector('.lines-num-old')),
        oldPath
      };
    },

    linkFor(ctx, sha, path, line) {
      return `${ctx.base}/${ctx.ownerPath}/${ctx.repoPath}/src/commit/${sha}/${GUL.encodePath(path)}${line ? `#L${line}` : ''}`;
    },

    createClient(ctx, inst) {
      return new GUL.GiteaClient({ base: ctx.base, owner: ctx.owner, repo: ctx.repo, token: inst.token });
    },

    authHint(inst) {
      return inst.token
        ? '설정한 토큰에 repository 읽기 권한이 있는지, 만료되지 않았는지 확인하세요.'
        : 'Gitea 토큰이 설정되지 않았습니다. 확장 설정에서 이 주소의 토큰을 넣어주세요.';
    }
  };

  GUL.platforms = Object.assign(GUL.platforms || {}, { gitea });
})();
