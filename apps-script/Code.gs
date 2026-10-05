/**
 * 토끼 저금통 — 구글 시트 서버
 * 이 폴더는 clasp로 관리해요. 고친 뒤:
 *   clasp push
 *   clasp deploy -i <DEPLOYMENT_ID> -d "설명"      ← 기존 배포 ID 그대로!
 * 새 배포를 만들면 웹 앱 주소가 바뀌어 앱이 끊기니 하지 마세요.
 * (시트를 처음 만들 때만 setup()을 한 번 실행하면 돼요.)
 */
const TZ = 'Asia/Seoul';

const SHEET_ENTRIES = 'entries';
const SHEET_SETTINGS = 'settings';
const HEAD = ['id', 'when', 'type', 'amount', 'label', 'icon', 'need', 'by', 't'];

/** 처음 한 번만 실행: 시트와 머리글을 만들어요. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_ENTRIES) || ss.insertSheet(SHEET_ENTRIES);
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const st = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  st.getRange(1, 1, 1, 2).setValues([['key', 'value']]).setFontWeight('bold');
  st.setFrozenRows(1);
}

/** 브라우저로 URL을 열었을 때 연결 확인용 */
function doGet() {
  return ContentService.createTextOutput('토끼 저금통 서버가 켜져 있어요.');
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return out({ ok: false, error: 'bad_request' }); }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    switch (body.action) {
      case 'list':     return out(Object.assign({ ok: true }, readAll()));
      case 'add':      addEntry(body.entry);     return out({ ok: true });
      case 'delete':   deleteEntry(body.id);     return out({ ok: true });
      case 'settings': writeSettings(body.settings); return out({ ok: true });
      default:         return out({ ok: false, error: 'bad_action' });
    }
  } catch (err) {
    return out({ ok: false, error: 'server', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- helpers ---------- */
function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function sheet(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('setup을 먼저 실행하세요');
  return sh;
}
function clip(v, n) { return String(v == null ? '' : v).slice(0, n); }

function readAll() {
  const sh = sheet(SHEET_ENTRIES);
  const last = sh.getLastRow();
  const entries = [];
  if (last > 1) {
    const rows = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
    rows.forEach(r => {
      if (!r[0]) return;
      entries.push({
        id: String(r[0]), type: r[2] === 'in' ? 'in' : 'out', amount: Number(r[3]) || 0,
        label: String(r[4]), icon: String(r[5]), need: r[6] ? String(r[6]) : null,
        by: String(r[7] || ''), t: Number(r[8]) || 0
      });
    });
  }
  return { entries: entries, settings: readSettings() };
}

function addEntry(e) {
  if (!e || !e.id) throw new Error('no entry');
  const amount = Math.round(Number(e.amount));
  if (!(amount > 0 && amount <= 1000000)) throw new Error('bad amount');
  const type = e.type === 'in' ? 'in' : 'out';
  const sh = sheet(SHEET_ENTRIES);
  // 같은 기록이 두 번 들어가지 않게 id 확인
  const last = sh.getLastRow();
  if (last > 1) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    if (ids.indexOf(String(e.id)) !== -1) return;
  }
  const t = Number(e.t) || Date.now();
  sh.appendRow([
    clip(e.id, 40), Utilities.formatDate(new Date(t), TZ, 'yyyy-MM-dd HH:mm'), type, amount,
    clip(e.label, 30), clip(e.icon, 8), type === 'out' ? clip(e.need, 8) : '', clip(e.by, 12), t
  ]);
}

function deleteEntry(id) {
  const sh = sheet(SHEET_ENTRIES);
  const last = sh.getLastRow();
  if (last < 2) return;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) { sh.deleteRow(i + 2); return; }
  }
}

/** settings 시트를 key/value 그대로 읽어요 (값은 손대지 않은 문자열) */
function rawSettings() {
  const sh = sheet(SHEET_SETTINGS);
  const last = sh.getLastRow();
  const map = {};
  if (last > 1) sh.getRange(2, 1, last - 1, 2).getValues().forEach(r => { if (r[0]) map[r[0]] = r[1]; });
  return map;
}

/** JSON 문자열로 저장된 버튼 목록을 배열로. 비었거나 깨졌으면 null */
function parseList(v) {
  try { const a = JSON.parse(v); return Array.isArray(a) && a.length ? a : null; }
  catch (err) { return null; }
}

/**
 * 버튼 목록 정리 — 앱의 normCats()와 같은 규칙.
 * 이름 없는 항목은 버리고, '직접 쓰기'(기타) 칸은 늘 하나만 맨 끝에 둬요.
 */
const MAX_ITEMS = 24;
function normItems(list, isIn) {
  const out = [], used = {};
  (list || []).forEach((o, i) => {
    if (out.length >= MAX_ITEMS) return;
    if (!o || typeof o !== 'object') return;
    const isEtc = o.k === 'etc';
    const label = clip(o.label, 20).trim() || (isEtc ? '기타' : '');
    if (!label) return;
    let k = clip(o.k, 16).trim() || ('c' + i);
    if (used[k]) { if (isEtc) return; k = k + '-' + i; }
    if (used[k]) return;
    used[k] = 1;
    let amt = 0;
    if (isIn) {
      amt = o.amt === 'weekly' ? 'weekly'
          : Math.min(1000000, Math.max(0, Math.round(Number(o.amt) || 0)));
    }
    out.push({ k: k, label: label, icon: clip(o.icon, 8), amt: amt });
  });
  let etc = null;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].k === 'etc') { etc = out.splice(i, 1)[0]; break; }
  }
  out.push(etc || { k: 'etc', label: '기타', icon: '✏️', amt: 0 });
  return out;
}

function readSettings() {
  const map = rawSettings();
  let goal = null;
  try { goal = map.goal ? JSON.parse(map.goal) : null; } catch (err) { goal = null; }
  const s = { childName: String(map.childName || ''), weekly: Number(map.weekly) || 3000, goal: goal };
  // 아직 한 번도 고친 적이 없으면 아예 안 보내요. 앱이 저장된 기본 목록을 쓰도록.
  const earn = parseList(map.earnItems), spend = parseList(map.spendItems);
  if (earn) s.earnItems = earn;
  if (spend) s.spendItems = spend;
  return s;
}

function writeSettings(s) {
  s = s || {};
  const prev = rawSettings();
  let goal = null;
  if (s.goal && Number(s.goal.price) > 0) {
    goal = { name: clip(s.goal.name, 20), icon: clip(s.goal.icon, 8), price: Math.round(Number(s.goal.price)) };
  }
  const weekly = Math.round(Number(s.weekly)) || 3000;
  // 목록을 안 보내는 옛 버전 앱(캐시에 남은 화면)이 가족이 고쳐 둔 목록을 지우지 않게 그대로 둬요.
  const earn = Array.isArray(s.earnItems)
    ? JSON.stringify(normItems(s.earnItems, true)) : String(prev.earnItems || '');
  const spend = Array.isArray(s.spendItems)
    ? JSON.stringify(normItems(s.spendItems, false)) : String(prev.spendItems || '');

  const rows = [
    ['childName', clip(s.childName, 12)],
    ['weekly', Math.min(Math.max(weekly, 100), 1000000)],
    ['goal', goal ? JSON.stringify(goal) : ''],
    ['earnItems', earn],
    ['spendItems', spend]
  ];
  const sh = sheet(SHEET_SETTINGS);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
}