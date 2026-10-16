// Gitea용 확장: 사용자가 추가한 Gitea 주소 목록과 사이트별 토큰을 쓴다.
var GUL = globalThis.GUL || (globalThis.GUL = {});

Object.assign(GUL.DEFAULTS, {
  // [{ base, token }] (예전 버전은 문자열 배열 + 전역 token 이었다. normalizeInstances가 변환한다.)
  instances: [],
  token: ''
});

GUL.loadSettings = async function () {
  const s = await chrome.storage.local.get(GUL.DEFAULTS);
  s.instances = GUL.normalizeInstances(s.instances, s.token);
  return s;
};

GUL.normalizeInstances = function (list, legacyToken = '') {
  return (list || []).map((it) => (typeof it === 'string'
    ? { base: it, type: 'gitea', token: legacyToken || '' }
    : { base: it.base, type: 'gitea', token: it.token || '' }));
};

// 사용자가 입력한 주소를 "origin + 하위경로(끝 슬래시 없음)" 형태로 정규화한다.
GUL.normalizeBase = function (input) {
  const raw = input.trim();
  const u = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
  return (u.origin + u.pathname).replace(/\/+$/, '');
};

// 권한 요청 패턴. http와 https를 따로 적는다.
// (manifest의 optional_host_permissions가 https://*/*, http://*/* 로 나뉘어 있어서
//  *://host/* 처럼 둘을 합친 패턴은 Chrome이 거부한다.)
GUL.originsFor = function (inst) {
  const host = new URL(inst.base).host;
  return [`https://${host}/*`, `http://${host}/*`];
};

// content script를 주입할 PR 페이지 패턴. 하위 경로 설치도 잡히도록 경로는 와일드카드로 둔다.
GUL.contentPatternFor = function (inst, scheme) {
  return `${scheme}://${new URL(inst.base).host}/*/pulls/*`;
};

GUL.CONTENT_SCRIPTS = [
  'src/settings.js',
  'src/edition.js',
  'src/zip.js',
  'src/store.js',
  'src/platform.js',
  'src/api.js',
  'src/indexer.js',
  'src/search.js',
  'src/ui.js',
  'src/content.js'
];
