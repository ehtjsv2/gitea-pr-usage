importScripts('src/settings.js', 'src/edition.js', 'src/platform.js');

const LOG = '[Gitea PR Usage Lens]';

// ---- content script 등록 ----
// Gitea 주소는 사용자가 설정에서 추가하므로, 권한이 허용된 주소에만 동적으로 등록한다.

// 여러 이벤트가 동시에 들어와도 등록/해제가 꼬이지 않게 순서대로 실행한다.
let syncChain = Promise.resolve();
function syncContentScripts() {
  syncChain = syncChain.then(doSync).catch((e) => console.error(LOG, 'content script 등록 실패', e));
  return syncChain;
}

// 사이트별로 실제 허용된 스킴(http/https)의 PR 페이지 패턴을 돌려준다.
async function grantedPatterns(inst) {
  const host = new URL(inst.base).host;
  const out = [];
  for (const scheme of ['http', 'https']) {
    if (await chrome.permissions.contains({ origins: [`${scheme}://${host}/*`] })) {
      out.push(GUL.contentPatternFor(inst, scheme));
    }
  }
  return out;
}

async function doSync() {
  const { instances } = await GUL.loadSettings();

  const existing = await chrome.scripting.getRegisteredContentScripts();
  if (existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  }

  const matches = [];
  for (const inst of instances) {
    try {
      matches.push(...(await grantedPatterns(inst)));
    } catch (e) {
      console.warn(LOG, '잘못된 주소 무시:', inst.base, e);
    }
  }
  console.info(LOG, 'content script 패턴:', matches);
  if (!matches.length) return;

  await chrome.scripting.registerContentScripts([{
    id: 'gul-main',
    matches,
    js: GUL.CONTENT_SCRIPTS,
    css: ['src/content.css'],
    runAt: 'document_idle'
  }]);
}

async function inject(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['src/content.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: GUL.CONTENT_SCRIPTS });
}

async function isGiteaPr(url) {
  const { instances } = await GUL.loadSettings();
  if (!GUL.findInstance(url, instances)) return false;
  try {
    return !!GUL.platforms.gitea.parsePr(new URL(url));
  } catch {
    return false;
  }
}

// 백업 경로: 등록된 패턴이 어떤 이유로든 맞지 않아도, 허용된 Gitea의 PR 페이지가 열리면 직접 주입한다.
// (tab.url은 호스트 권한이 있는 탭에서만 채워진다. content.js가 중복 실행을 막는다.)
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url || !(await isGiteaPr(tab.url))) return;
  inject(tabId).catch((e) => console.warn(LOG, '주입 실패', tab.url, e));
});

// 아이콘 클릭: PR 페이지면 바로 주입(activeTab), 아니면 설정 페이지를 연다.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url && (await isGiteaPr(tab.url))) {
    try {
      await inject(tab.id);
      return;
    } catch (e) {
      console.warn(LOG, '아이콘 클릭 주입 실패', e);
    }
  }
  chrome.runtime.openOptionsPage();
});

// 툴팁의 "설정 열기" 버튼
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'gul:openOptions' && sender.id === chrome.runtime.id) chrome.runtime.openOptionsPage();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await syncContentScripts();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(syncContentScripts);
chrome.permissions.onAdded.addListener(syncContentScripts);
chrome.permissions.onRemoved.addListener(syncContentScripts);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.instances) syncContentScripts();
});
