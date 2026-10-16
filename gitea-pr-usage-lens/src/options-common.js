// 설정 페이지의 공용 부분: 상태 메시지, "동작"·"색인 대상" 입력 칸.
var GUL = globalThis.GUL || (globalThis.GUL = {});

GUL.$ = (id) => document.getElementById(id);

GUL.showStatus = function (msg) {
  const el = GUL.$('status');
  el.textContent = msg;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 2500);
};

const splitList = (v) => v.split(/[,\s]+/).map((s) => s.trim().replace(/^\./, '')).filter(Boolean);

GUL.optionsForm = {
  fill(s) {
    GUL.$('trigger').value = s.trigger;
    GUL.$('hoverDelay').value = s.hoverDelay;
    GUL.$('extensions').value = s.extensions.join(', ');
    GUL.$('excludeDirs').value = s.excludeDirs.join(', ');
    GUL.$('maxFileKB').value = s.maxFileKB;
  },

  values() {
    return {
      trigger: GUL.$('trigger').value,
      hoverDelay: Math.max(0, Number(GUL.$('hoverDelay').value) || 0),
      extensions: splitList(GUL.$('extensions').value).map((x) => x.toLowerCase()),
      excludeDirs: splitList(GUL.$('excludeDirs').value),
      maxFileKB: Math.max(1, Number(GUL.$('maxFileKB').value) || GUL.DEFAULTS.maxFileKB)
    };
  },

  // 기본값 버튼: 입력 칸만 채우고 저장은 사용자가 누른다.
  bindReset() {
    GUL.$('reset').addEventListener('click', () => {
      GUL.optionsForm.fill(GUL.DEFAULTS);
      GUL.showStatus('기본값을 채웠습니다. 저장을 눌러 적용하세요.');
    });
  }
};
