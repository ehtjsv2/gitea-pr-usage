// 의존성 없는 최소 ZIP 리더. 중앙 디렉터리를 읽고 DecompressionStream('deflate-raw')로 푼다.
// git archive가 만드는 zip(store/deflate, 파일이 많으면 zip64)을 처리한다.
var GUL = globalThis.GUL || (globalThis.GUL = {});

(function () {
  const SIG_EOCD = 0x06054b50;
  const SIG_ZIP64_LOCATOR = 0x07064b50;
  const SIG_ZIP64_EOCD = 0x06064b50;
  const SIG_CENTRAL = 0x02014b50;
  const SIG_LOCAL = 0x04034b50;

  const utf8 = new TextDecoder('utf-8');

  function findEOCD(dv) {
    const min = Math.max(0, dv.byteLength - 22 - 0xffff);
    for (let i = dv.byteLength - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === SIG_EOCD) return i;
    }
    throw new Error('ZIP 끝 레코드를 찾을 수 없습니다.');
  }

  function readDirectory(dv) {
    const e = findEOCD(dv);
    let count = dv.getUint16(e + 10, true);
    let offset = dv.getUint32(e + 16, true);

    if (count === 0xffff || offset === 0xffffffff) {
      const loc = e - 20;
      if (loc >= 0 && dv.getUint32(loc, true) === SIG_ZIP64_LOCATOR) {
        const z = Number(dv.getBigUint64(loc + 8, true));
        if (dv.getUint32(z, true) !== SIG_ZIP64_EOCD) throw new Error('zip64 레코드가 손상되었습니다.');
        count = Number(dv.getBigUint64(z + 32, true));
        offset = Number(dv.getBigUint64(z + 48, true));
      }
    }

    const entries = [];
    let p = offset;
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== SIG_CENTRAL) throw new Error('ZIP 디렉터리가 손상되었습니다.');
      const method = dv.getUint16(p + 10, true);
      let compSize = dv.getUint32(p + 20, true);
      let size = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      let localOffset = dv.getUint32(p + 42, true);
      const name = utf8.decode(new Uint8Array(dv.buffer, dv.byteOffset + p + 46, nameLen));

      // zip64 확장 필드: 0xffffffff인 값만 순서대로 들어 있다.
      if (size === 0xffffffff || compSize === 0xffffffff || localOffset === 0xffffffff) {
        let x = p + 46 + nameLen;
        const end = x + extraLen;
        while (x + 4 <= end) {
          const id = dv.getUint16(x, true);
          const len = dv.getUint16(x + 2, true);
          if (id === 0x0001) {
            let f = x + 4;
            if (size === 0xffffffff) { size = Number(dv.getBigUint64(f, true)); f += 8; }
            if (compSize === 0xffffffff) { compSize = Number(dv.getBigUint64(f, true)); f += 8; }
            if (localOffset === 0xffffffff) { localOffset = Number(dv.getBigUint64(f, true)); }
            break;
          }
          x += 4 + len;
        }
      }

      if (!name.endsWith('/')) entries.push({ name, method, compSize, size, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function inflate(bytes, method) {
    if (method === 0) return bytes;
    if (method !== 8) throw new Error(`지원하지 않는 압축 방식: ${method}`);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /**
   * @param {ArrayBuffer} buffer
   * @param {(name: string, size: number) => boolean} filter 받을 파일만 true
   * @param {(name: string, bytes: Uint8Array) => void} onEntry
   * @param {(done: number, total: number) => void} [onProgress]
   */
  /** fetch 응답 본문을 끝까지 받는다. onProgress(받은 바이트, 전체 바이트 또는 0) */
  GUL.readResponseBytes = async function (res, onProgress) {
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !onProgress) return res.arrayBuffer();
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    let lastReport = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const now = Date.now();
      if (now - lastReport > 200) { onProgress(received, total); lastReport = now; }
    }
    onProgress(received, total);
    const out = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out.buffer;
  };

  /**
   * 저장소 archive(zip)에서 원하는 텍스트 파일만 꺼낸다.
   * archive 안의 경로는 "저장소이름-커밋/..." 처럼 최상위 폴더로 시작하므로 그 폴더를 뗀 경로로 다룬다.
   * @param {(path: string, size: number) => boolean} filter
   * @returns {Promise<{path: string, text: string}[]>}
   */
  GUL.extractArchive = async function (buffer, filter, onProgress) {
    const strip = (name) => name.slice(name.indexOf('/') + 1);
    const files = [];
    await GUL.readZip(
      buffer,
      (name, size) => filter(strip(name), size),
      (name, bytes) => {
        const text = GUL.bytesToText(bytes);
        if (text !== null) files.push({ path: strip(name), text });
      },
      onProgress
    );
    return files;
  };

  GUL.readZip = async function (buffer, filter, onEntry, onProgress) {
    const dv = new DataView(buffer);
    const entries = readDirectory(dv).filter((e) => filter(e.name, e.size));
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (dv.getUint32(e.localOffset, true) !== SIG_LOCAL) throw new Error(`로컬 헤더 손상: ${e.name}`);
      const start = e.localOffset + 30 + dv.getUint16(e.localOffset + 26, true) + dv.getUint16(e.localOffset + 28, true);
      const bytes = await inflate(new Uint8Array(buffer, start, e.compSize), e.method);
      onEntry(e.name, bytes);
      if (onProgress && (i % 50 === 0 || i === entries.length - 1)) onProgress(i + 1, entries.length);
    }
  };
})();
