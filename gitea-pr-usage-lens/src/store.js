// IndexedDB 캐시. content script에서 실행되므로 Gitea 사이트 origin의 저장소에 들어간다.
var GUL = globalThis.GUL || (globalThis.GUL = {});

(function () {
  const DB_NAME = 'gitea-usage-lens';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // meta: { repoKey, sha, schema, fileCount, builtAt }
        db.createObjectStore('meta', { keyPath: 'repoKey' });
        // files: { repoKey, path, blobSha, text }
        db.createObjectStore('files', { keyPath: ['repoKey', 'path'] });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  // IndexedDB 키 정렬상 배열은 모든 문자열보다 크므로 [repoKey, []]가 해당 저장소의 상한이 된다.
  const repoRange = (repoKey) => IDBKeyRange.bound([repoKey, ''], [repoKey, []]);

  function done(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('트랜잭션 중단'));
    });
  }

  function request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  GUL.store = {
    async getMeta(repoKey) {
      const db = await open();
      return request(db.transaction('meta').objectStore('meta').get(repoKey));
    },

    async getFiles(repoKey) {
      const db = await open();
      return request(db.transaction('files').objectStore('files').getAll(repoRange(repoKey)));
    },

    /** 파일을 추가/교체/삭제하고 meta를 한 트랜잭션으로 갱신한다. replaceAll이면 기존 파일을 모두 지운다. */
    async write(repoKey, { puts = [], deletes = [], meta, replaceAll = false }) {
      const db = await open();
      const tx = db.transaction(['files', 'meta'], 'readwrite');
      const files = tx.objectStore('files');
      if (replaceAll) files.delete(repoRange(repoKey));
      for (const path of deletes) files.delete([repoKey, path]);
      for (const f of puts) files.put({ repoKey, ...f });
      if (meta) tx.objectStore('meta').put({ repoKey, ...meta });
      return done(tx);
    },

    async clearRepo(repoKey) {
      const db = await open();
      const tx = db.transaction(['files', 'meta'], 'readwrite');
      tx.objectStore('files').delete(repoRange(repoKey));
      tx.objectStore('meta').delete(repoKey);
      return done(tx);
    }
  };
})();
