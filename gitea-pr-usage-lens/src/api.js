// Gitea REST API 클라이언트. content script는 페이지와 같은 origin으로 요청하므로 로그인 쿠키가 그대로 쓰인다.
var GUL = globalThis.GUL || (globalThis.GUL = {});

GUL.GiteaClient = class {
  constructor({ base, owner, repo, token }) {
    this.base = base;
    this.owner = owner;
    this.repo = repo;
    this.token = token;
  }

  url(path) {
    return `${this.base}/api/v1/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}${path}`;
  }

  async fetch(path) {
    const url = this.url(path);
    const headers = {};
    if (this.token) headers.Authorization = `token ${this.token}`;
    const res = await fetch(url, { headers, credentials: 'same-origin' });
    if (!res.ok) throw new GUL.ApiError(res.status, url);
    return res;
  }

  async json(path) {
    return (await this.fetch(path)).json();
  }

  // ---- 색인기(indexer.js)가 쓰는 인터페이스 ----

  async getBaseSha(index) {
    const pull = await this.json(`/pulls/${index}`);
    return pull.base?.sha || pull.merge_base;
  }

  /** 재귀 트리 전체. Gitea는 페이지 단위(기본 1000개)로 잘라서 준다. */
  async getTree(sha) {
    const entries = [];
    for (let page = 1; ; page++) {
      const data = await this.json(`/git/trees/${sha}?recursive=true&per_page=10000&page=${page}`);
      const tree = data.tree || [];
      entries.push(...tree);
      if (!data.truncated || !tree.length) break;
      if (data.total_count && entries.length >= data.total_count) break;
    }
    return { entries, truncated: false };
  }

  /** 커밋의 zip archive를 받아 고른 텍스트 파일만 꺼낸다. select: { wanted, settings } (GUL.archiveFilter 참고) */
  async getArchiveFiles(sha, select, onProgress) {
    const res = await this.fetch(`/archive/${sha}.zip`);
    const buf = await GUL.readResponseBytes(res, (got, total) => onProgress({ phase: 'download', got, total }));
    return GUL.extractArchive(buf, GUL.archiveFilter(select), (done, total) => onProgress({ phase: 'extract', done, total }));
  }

  /** 파일 하나의 텍스트. 바이너리면 null. */
  async getRawText(path, sha) {
    const res = await this.fetch(`/raw/${GUL.encodePath(path)}?ref=${sha}`);
    return GUL.bytesToText(new Uint8Array(await res.arrayBuffer()));
  }
};
