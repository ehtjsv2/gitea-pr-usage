// base 커밋 기준 소스 파일 캐시를 만든다.
// 처음엔 archive(zip)를 한 번 받고, 이후엔 트리의 blob SHA를 비교해 바뀐 파일만 raw로 받는다.
// client는 GiteaClient (getBaseSha, getTree, getArchiveFiles, getRawText).
var GUL = globalThis.GUL || (globalThis.GUL = {});

(function () {
  const SCHEMA = 1;
  const RAW_CONCURRENCY = 6;
  const MIN_FULL_REBUILD = 200;

  async function mapLimit(items, limit, fn) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    });
    await Promise.all(workers);
  }

  const mb = (n) => (n / 1048576).toFixed(1);

  function archiveProgress(onProgress) {
    return (p) => {
      if (p.phase === 'download') {
        onProgress(p.total ? `압축 파일 받는 중 ${mb(p.got)} / ${mb(p.total)} MB` : `압축 파일 받는 중 ${mb(p.got)} MB`);
      } else if (p.phase === 'extract') {
        onProgress(`압축 해제 중 ${p.done} / ${p.total}`);
      }
    };
  }

  // wanted: 경로 → blob SHA (트리가 잘린 저장소면 null: 파일 필터로 고르고 SHA 없이 저장)
  async function fullBuild({ client, repoKey, sha, wanted, settings, onProgress }) {
    onProgress('압축 파일 받는 중…');
    const select = { wanted: wanted ? [...wanted.keys()] : null, settings };
    const files = await client.getArchiveFiles(sha, select, archiveProgress(onProgress));
    const puts = files.map((f) => ({ path: f.path, blobSha: wanted?.get(f.path) || null, text: f.text }));

    onProgress('저장 중…');
    await GUL.store.write(repoKey, {
      replaceAll: true,
      puts,
      meta: { sha, schema: SCHEMA, fileCount: puts.length, builtAt: Date.now(), partialTree: !wanted }
    });
    return puts;
  }

  /**
   * @returns {Promise<{sha: string, files: Map<string, string>, mode: string, fetched: number}>}
   */
  GUL.buildIndex = async function ({ client, repoKey, sha, settings, onProgress = () => {} }) {
    const meta = await GUL.store.getMeta(repoKey);

    if (meta && meta.schema === SCHEMA && meta.sha === sha) {
      onProgress('캐시 불러오는 중…');
      const rows = await GUL.store.getFiles(repoKey);
      return { sha, files: new Map(rows.map((r) => [r.path, r.text])), mode: 'cache', fetched: 0 };
    }

    onProgress('파일 목록 가져오는 중…');
    const filter = GUL.makeFileFilter(settings);
    const tree = await client.getTree(sha);
    let wanted = new Map();
    for (const e of tree.entries) {
      if (e.type === 'blob' && filter(e.path, e.size || 0)) wanted.set(e.path, e.sha);
    }
    // 트리가 잘렸으면 변경분 비교를 믿을 수 없으므로 매번 archive에서 다시 만든다.
    if (tree.truncated) wanted = null;

    const full = async () => {
      const puts = await fullBuild({ client, repoKey, sha, wanted, settings, onProgress });
      return { sha, files: new Map(puts.map((r) => [r.path, r.text])), mode: 'full', fetched: puts.length };
    };
    if (!wanted || !meta || meta.schema !== SCHEMA || meta.partialTree) return full();

    // 증분: 이전 캐시와 blob SHA를 비교한다.
    onProgress('캐시 불러오는 중…');
    const rows = await GUL.store.getFiles(repoKey);
    const old = new Map(rows.map((r) => [r.path, r]));
    const changed = [];
    for (const [path, blobSha] of wanted) {
      if (old.get(path)?.blobSha !== blobSha) changed.push(path);
    }
    const deletes = [...old.keys()].filter((p) => !wanted.has(p));

    if (changed.length > Math.max(MIN_FULL_REBUILD, wanted.size * settings.fullRebuildRatio)) return full();

    const puts = [];
    let done = 0;
    await mapLimit(changed, RAW_CONCURRENCY, async (path) => {
      const text = await client.getRawText(path, sha);
      if (text !== null) puts.push({ path, blobSha: wanted.get(path), text });
      done++;
      onProgress(`변경된 파일 받는 중 ${done} / ${changed.length}`);
    });

    await GUL.store.write(repoKey, {
      puts,
      deletes,
      meta: { sha, schema: SCHEMA, fileCount: wanted.size, builtAt: Date.now() }
    });

    const files = new Map();
    for (const r of rows) if (wanted.has(r.path)) files.set(r.path, r.text);
    for (const p of puts) files.set(p.path, p.text);
    return { sha, files, mode: 'delta', fetched: puts.length };
  };
})();
