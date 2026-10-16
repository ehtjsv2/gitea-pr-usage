// 설정 기본값과 공용 유틸.
// Gitea 주소 목록·토큰 관련 부분은 edition.js가 채운다. (GUL.loadSettings 등)
var GUL = globalThis.GUL || (globalThis.GUL = {});

GUL.DEFAULTS = {
  extensions: [
    'java', 'kt', 'kts', 'scala', 'groovy', 'gradle',
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte',
    'py', 'rb', 'go', 'rs', 'php', 'cs', 'swift', 'dart', 'lua',
    'c', 'h', 'cc', 'cpp', 'hpp', 'm', 'mm',
    'xml', 'sql', 'yml', 'yaml', 'properties'
  ],
  excludeDirs: [
    'node_modules', 'vendor', 'dist', 'build', 'target', 'out', 'bin', 'obj',
    '.git', '.idea', '.gradle', '.next', 'coverage', '__pycache__'
  ],
  maxFileKB: 512,
  // 'hover': 마우스만 올려도 표시, 'alt': Alt 키를 누른 채 올렸을 때만 표시
  trigger: 'hover',
  hoverDelay: 400,
  // 변경 파일이 전체의 이 비율을 넘으면 증분 대신 archive를 다시 받는다.
  fullRebuildRatio: 0.3
};

GUL.ApiError = class extends Error {
  constructor(status, url, rateLimited = false) {
    super(`API 요청 실패 (${status})`);
    this.status = status;
    this.url = url;
    this.rateLimited = rateLimited;
  }
};

// url과 같은 호스트(포트 포함, 스킴 무관)의 사이트 설정을 찾는다.
GUL.findInstance = function (url, instances) {
  let host;
  try { host = new URL(url).host; } catch { return null; }
  return instances.find((it) => {
    try { return new URL(it.base).host === host; } catch { return false; }
  }) || null;
};

const SKIP_FILE = /(\.min\.(js|css)$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$)/;

// 색인 대상 파일인지 (확장자·제외 폴더·크기)
GUL.makeFileFilter = function (settings) {
  const exts = new Set(settings.extensions.map((e) => e.toLowerCase()));
  const excluded = new Set(settings.excludeDirs);
  const maxBytes = settings.maxFileKB * 1024;
  return (path, size) => {
    if (size > maxBytes || SKIP_FILE.test(path)) return false;
    const parts = path.split('/');
    for (let i = 0; i < parts.length - 1; i++) if (excluded.has(parts[i])) return false;
    const name = parts[parts.length - 1];
    const dot = name.lastIndexOf('.');
    return dot > 0 && exts.has(name.slice(dot + 1).toLowerCase());
  };
};

// archive에서 꺼낼 파일 선택: 트리에서 고른 경로 목록(wanted)이 있으면 그것만, 없으면 파일 필터로.
// 메시지로 background에 넘길 수 있게 함수가 아닌 데이터로 주고받는다.
GUL.archiveFilter = function ({ wanted, settings }) {
  if (wanted) {
    const set = new Set(wanted);
    return (path) => set.has(path);
  }
  return GUL.makeFileFilter(settings);
};

GUL.encodePath = function (path) {
  return path.split('/').map(encodeURIComponent).join('/');
};

const GUL_DECODER = new TextDecoder('utf-8');
// NUL 바이트가 있으면 바이너리로 보고 null을 돌려준다.
GUL.bytesToText = function (bytes) {
  if (bytes.subarray(0, 8000).indexOf(0) !== -1) return null;
  return GUL_DECODER.decode(bytes);
};
