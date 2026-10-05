# 토끼 저금통 (piggy-bank)

유치원생 아이의 용돈을 가족(아빠·엄마·할머니)이 함께 기록하는 웹앱. 사용자는 한국어로 대화한다.

## 구조
- `index.html` — 앱 전체 (HTML·CSS·JS 한 파일, 빌드 없음). GitHub Pages로 배포.
- `config.js` — `window.POCKET_API_URL` (Apps Script 웹 앱 주소). 사용자가 직접 넣은 값이므로 **절대 덮어쓰거나 지우지 말 것.**
- `sw.js` — 서비스 워커(네트워크 우선). 캐시할 파일 목록을 바꾸면 `CACHE` 이름의 버전을 올릴 것.
- `manifest.webmanifest`, `icons/` — PWA 설치용.
- `apps-script/Code.gs` — 구글 시트 서버 (clasp로 관리). 시트 탭: `entries`(기록), `settings`(key/value: childName, goal, earnItems, spendItems — 값은 JSON 문자열).

## 데이터 규칙
- 기록 하나: `{id, type:'in'|'out', amount, label, icon, need:'need'|'want'|null, by, t(ms)}`
- 버튼 목록(earnItems/spendItems)과 목표는 앱에서 가족이 편집 → settings 시트에 저장. 코드에 하드코딩된 `DEF_EARN`/`DEF_SPEND`는 처음 기본값일 뿐.
- 서버와 주고받는 필드를 추가하면 `index.html`의 `norm()`과 `Code.gs`의 `readSettings()/writeSettings()`를 **둘 다** 고칠 것.

## 사용자 배려
- 할머니도 쓰는 앱: 큰 글씨, 한 화면에 질문 하나, 쉬운 말. 기능을 추가해도 이 원칙 유지.
- 5–6세 아이가 보는 화면: 그림 위주.

## 배포
- 프런트: 수정 후 커밋 → `git push`. GitHub Pages가 1–2분 안에 반영.
- 서버(Code.gs)를 바꿨을 때: `cd apps-script && clasp push` 후 **기존 배포 ID로** `clasp deploy -i <DEPLOYMENT_ID> -d "설명"`. 새 배포를 만들면 URL이 바뀌어 앱이 끊기니 금지.
  - DEPLOYMENT_ID: (여기에 기록)
- 변경 전후로 `index.html`의 `<script>` 부분은 `node --check`로 문법 확인.
