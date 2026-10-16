# Privacy Policy · 개인정보처리방침

**Gitea PR Usage Lens** (Chrome extension)

Effective date: 2026-10-16

## English

### What the extension handles and why

| Data | Source | Purpose | Storage |
|---|---|---|---|
| Gitea URLs, personal access tokens, preferences | Entered by the user on the options page | To read repository code through the Gitea API | Extension storage in this browser (`chrome.storage.local`, not synced) |
| Repository source code (files of the PR's base commit) | The API of the Gitea server configured by the user | To find definitions and usages of identifiers | IndexedDB in this browser (the Gitea site's storage) |
| Contents of the PR page (diff lines) | The Gitea PR page the user is viewing | To detect the word under the cursor and usages within the PR | Not stored (processed on the page) |

### Data sharing

- All network requests go **only to the Gitea URLs the user added** on the options page.
- No data is sent to the developer or any third party. No analytics, advertising, or tracking.
- Data is not sold, not used for purposes unrelated to the extension's single purpose, and not transferred to third parties.
- No remote code is loaded.

### Retention and deletion

- Tokens and preferences remain in this browser until the user removes them or uninstalls the extension.
- The repository code cache can be cleared with the tooltip's **Reindex** button, by clearing site data in the browser, or by uninstalling the extension.

### Contact

GitHub issues: https://github.com/ehtjsv2/gitea-pr-usage-lens/issues

---

## 한국어

### 처리하는 정보와 목적

| 정보 | 어디서 | 왜 | 어디에 저장 |
|---|---|---|---|
| Gitea 주소, 개인 액세스 토큰, 동작 설정 | 사용자가 설정 페이지에 직접 입력 | Gitea API로 저장소 코드를 읽기 위해 | 이 브라우저의 확장 저장소 (`chrome.storage.local`, 동기화되지 않음) |
| 저장소 소스 코드 (PR base 커밋의 소스 파일) | 사용자가 설정한 Gitea 서버의 API | 식별자의 정의·사용처를 검색하기 위해 | 이 브라우저의 IndexedDB (해당 Gitea 사이트 저장소) |
| PR 화면의 내용 (diff 코드 줄) | 사용자가 보고 있는 Gitea PR 페이지 | 마우스 아래 단어와 PR 안의 사용처를 찾기 위해 | 저장하지 않음 (화면에서 바로 처리) |

### 외부 전송

- 모든 네트워크 요청은 **사용자가 설정에서 추가한 Gitea 주소로만** 보냅니다.
- 개발자나 제3자의 서버로 어떤 정보도 보내지 않습니다. 분석·광고·추적 도구를 사용하지 않습니다.
- 정보를 판매하거나, 확장의 기능과 무관한 목적으로 사용하거나, 제3자에게 제공하지 않습니다.
- 외부 스크립트(원격 코드)를 불러오지 않습니다.

### 보관과 삭제

- 토큰과 설정은 사용자가 지우거나 확장을 삭제할 때까지 이 브라우저에만 남습니다.
- 저장소 코드 캐시는 툴팁의 **재색인(Reindex)** 버튼, 브라우저의 사이트 데이터 삭제, 또는 확장 삭제로 지울 수 있습니다.

### 문의

GitHub 이슈: https://github.com/ehtjsv2/gitea-pr-usage-lens/issues
