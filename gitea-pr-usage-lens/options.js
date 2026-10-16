const { $, showStatus } = GUL;

async function getInstances() {
  const s = await chrome.storage.local.get({ instances: [], token: '' });
  return GUL.normalizeInstances(s.instances, s.token);
}

async function saveInstances(list) {
  // 예전 전역 token은 주소별 token으로 옮겼으므로 비운다.
  await chrome.storage.local.set({ instances: list.map(({ base, token }) => ({ base, token })), token: '' });
}

async function hasPermission(inst) {
  for (const origin of GUL.originsFor(inst)) {
    if (await chrome.permissions.contains({ origins: [origin] })) return true;
  }
  return false;
}

// focusBase: 방금 추가한 주소. 렌더 후 그 주소의 토큰 칸에 커서를 둔다.
async function renderInstances(focusBase) {
  const instances = await getInstances();
  const ul = $('instances');
  ul.textContent = '';
  if (!instances.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '아직 추가된 주소가 없습니다.';
    ul.append(li);
  }
  for (const inst of instances) {
    const li = document.createElement('li');
    li.className = 'instance';

    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.className = 'base';
    name.textContent = inst.base;
    row.append(name);

    const warn = document.createElement('span');
    warn.className = 'warn';
    if (!(await hasPermission(inst))) warn.textContent = '권한 없음 (삭제 후 다시 추가하세요)';
    else if (!inst.token) warn.textContent = '토큰 필요';
    row.append(warn);

    const del = document.createElement('button');
    del.textContent = '삭제';
    del.addEventListener('click', async () => {
      const cur = await getInstances();
      await saveInstances(cur.filter((it) => it.base !== inst.base));
      renderInstances();
    });
    row.append(del);

    const token = document.createElement('input');
    token.type = 'password';
    token.autocomplete = 'off';
    token.placeholder = 'Gitea 토큰 (필수) — 아래 "토큰" 안내 참고';
    token.value = inst.token;
    token.classList.toggle('missing', !inst.token);
    token.addEventListener('change', async () => {
      const value = token.value.trim();
      const cur = await getInstances();
      const target = cur.find((it) => it.base === inst.base);
      if (target) target.token = value;
      await saveInstances(cur);
      token.classList.toggle('missing', !value);
      if (warn.textContent !== '권한 없음 (삭제 후 다시 추가하세요)') warn.textContent = value ? '' : '토큰 필요';
      showStatus(value ? '토큰을 저장했습니다. 열려 있는 PR 페이지에도 바로 적용됩니다.' : '토큰을 지웠습니다.');
    });

    li.append(row, token);
    ul.append(li);
    if (inst.base === focusBase) token.focus();
  }
  setTimeout(renderRegistration, 300);
}

// background가 실제로 등록한 content script 패턴을 보여준다. (문제 진단용)
async function renderRegistration() {
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  const matches = scripts.flatMap((s) => s.matches || []);
  $('registration').textContent = matches.length
    ? `적용 중인 페이지 패턴: ${matches.join(', ')}`
    : '적용 중인 페이지가 없습니다. 주소를 추가하고 권한을 허용하세요.';
}

// 입력란의 주소를 권한 요청 후 목록에 추가한다. 입력이 비어 있으면 아무것도 하지 않는다.
// 권한 요청은 사용자 클릭 직후에 해야 하므로 클릭 핸들러에서 가장 먼저 호출한다.
async function addTypedInstance() {
  const raw = $('instance-input').value.trim();
  if (!raw) return true;
  let base;
  try {
    base = GUL.normalizeBase(raw);
  } catch {
    showStatus('주소 형식이 올바르지 않습니다.');
    return false;
  }
  const inst = { base, type: 'gitea', token: '' };
  let granted;
  try {
    granted = await chrome.permissions.request({ origins: GUL.originsFor(inst) });
  } catch (e) {
    showStatus(`권한 요청 실패: ${e.message}`);
    return false;
  }
  if (!granted) {
    showStatus('사이트 접근 권한이 거부되었습니다.');
    return false;
  }
  const cur = await getInstances();
  if (!cur.some((it) => it.base === base)) cur.push(inst);
  await saveInstances(cur);
  $('instance-input').value = '';
  await renderInstances(base);
  return true;
}

$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!$('instance-input').value.trim()) {
    showStatus('주소를 입력하세요.');
    return;
  }
  if (await addTypedInstance()) showStatus('추가했습니다. 이제 아래 칸에 토큰을 넣어주세요.');
});

$('save').addEventListener('click', async () => {
  if (!(await addTypedInstance())) return;
  await chrome.storage.local.set(GUL.optionsForm.values());
  showStatus('저장했습니다.');
});

GUL.optionsForm.bindReset();

(async () => {
  // 예전 형식(문자열 배열 + 전역 token)이면 한 번 변환해서 저장한다.
  const raw = await chrome.storage.local.get({ instances: [] });
  if (raw.instances.some((it) => typeof it === 'string')) await saveInstances(await getInstances());
  GUL.optionsForm.fill(await GUL.loadSettings());
  renderInstances();
})();
