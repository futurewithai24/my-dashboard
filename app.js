const KEY = 'my-dashboard-data';
const rank = { high: 0, medium: 1, low: 2 };
const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const projectDefaults = () => window.AI_SECRETARY_DATA ? structuredClone(window.AI_SECRETARY_DATA) : ({
  taskPlanVersion: 18,
  focus: 'dashboard-data.js を確認して今日の最優先タスクを決める',
  tasks: [
    { id: makeId(), title: '参っとこ！：周辺スポット未整備7社データ補完', priority: 'high', checked: false, done: false },
    { id: makeId(), title: '飯沼厩舎：提案書PDF再生成（期限10/13火）', priority: 'high', checked: false, done: false },
    { id: makeId(), title: 'note記事「CSVの文字化け」投稿判断', priority: 'high', checked: false, done: false }
  ],
  links: [
    { id: makeId(), name: '参っとこ！', url: 'https://maittoko.com', use: '穴場神社Webサイト' },
    { id: makeId(), name: 'Supabase', url: 'https://supabase.com/dashboard', use: 'DBダッシュボード' },
    { id: makeId(), name: 'A8.net', url: 'https://www.a8.net/', use: 'アフィリエイト管理' },
    { id: makeId(), name: 'UNLOOP', url: 'https://unloop-tools.streamlit.app/', use: 'ツール公開ページ' }
  ],
  memo: ''
});

function load() {
  // タスクリストは常にdashboard-data.jsから取得（セナが毎朝更新する正データ）
  // localStorageはdone/checked状態とmemoのみ保存・復元する
  const base = projectDefaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved || saved.taskPlanVersion !== base.taskPlanVersion) return base;
    // バージョン一致: タスクIDでdone/checked状態を復元
    const savedMap = Object.fromEntries((saved.tasks || []).map(t => [t.id, t]));
    return {
      ...base,
      memo: saved.memo || '',
      tasks: base.tasks.map(t => ({
        ...t,
        done:    !!(savedMap[t.id]?.done),
        checked: !!(savedMap[t.id]?.checked)
      }))
    };
  } catch { return base; }
}

let data = load();

function save(localOnly = false) {
  try {
    const toSave = {
      taskPlanVersion: data.taskPlanVersion,
      memo: data.memo,
      updatedAt: new Date().toISOString(),
      tasks: data.tasks.map(({ id, done, checked }) => ({ id, done, checked }))
    };
    localStorage.setItem(KEY, JSON.stringify(toSave));
    setSaveState('保存済み');
    if (!localOnly) pushToGAS();
  } catch { setSaveState('保存エラー'); }
}

function setSaveState(text) {
  const node = document.querySelector('#saveState');
  if (node) { node.textContent = text; if (text === '保存済み') setTimeout(() => node.textContent = '自動保存', 1200); }
}

// ── GAS同期 ────────────────────────────────────────────────
let _gasBusy = false;

function setSyncState(text, state) {
  const el = document.querySelector('#syncStatus');
  if (!el) return;
  el.textContent = '● ' + text;
  el.dataset.state = state || 'off';
}

async function syncFromGAS() {
  if (_gasBusy || !GasApi.isValid()) return;
  _gasBusy = true;
  setSyncState('同期中...', 'busy');
  try {
    // 初回はシートを初期化
    const initRes = await GasApi.call('init');
    if (initRes.ok && initRes.created?.length > 0) {
      console.log('GASシート作成:', initRes.created.join(', '));
    }

    // 全データ取得
    const result = await GasApi.call('getAllData');
    if (!result.ok) throw new Error('データ取得失敗');

    const settings = result.data?.settings || [];
    const stateEntry = settings.find(s => s.setting_key === 'dashboard_state');

    if (stateEntry?.setting_value) {
      const gasState = JSON.parse(stateEntry.setting_value);
      const base = projectDefaults();
      if (gasState.taskPlanVersion === base.taskPlanVersion) {
        const savedMap = Object.fromEntries((gasState.tasks || []).map(t => [t.id, t]));
        data = {
          ...base,
          memo: gasState.memo || '',
          tasks: base.tasks.map(t => ({
            ...t,
            done:    !!(savedMap[t.id]?.done),
            checked: !!(savedMap[t.id]?.checked),
          })),
        };
        save(true); // localStorageキャッシュだけ更新（GASへの二重送信を防ぐ）
        render();
      }
    }
    setSyncState('同期済み', 'ok');
  } catch (err) {
    console.warn('GAS同期エラー:', err.message);
    setSyncState('オフライン', 'off');
  } finally {
    _gasBusy = false;
  }
}

async function pushToGAS() {
  if (!GasApi.isValid()) return;
  try {
    const state = {
      taskPlanVersion: data.taskPlanVersion,
      memo: data.memo,
      updatedAt: new Date().toISOString(),
      tasks: data.tasks.map(({ id, done, checked }) => ({ id, done, checked })),
    };
    await GasApi.call('saveSettings', { dashboard_state: JSON.stringify(state) });
    setSyncState('同期済み', 'ok');
  } catch (err) {
    console.warn('GASプッシュエラー:', err.message);
    setSyncState('オフライン', 'off');
  }
}

function initGAS() {
  if (typeof GasApi === 'undefined') return;
  GasApi.init(user => {
    const authEl = document.querySelector('#authUser');
    if (!authEl) return;
    if (user) {
      authEl.textContent = user.email;
      document.getElementById('gsi_button').style.display = 'none';
      syncFromGAS();
    } else {
      authEl.textContent = '';
      setSyncState('ローカル', 'off');
    }
  });
}

const node = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

// プロジェクトタグの判定と色定義
const PROJECTS = [
  { key: '参っとこ！', color: '#e8f5e9', textColor: '#2e7d32' },
  { key: '飯沼厩舎',   color: '#fff3e0', textColor: '#e65100' },
  { key: '確定申告',   color: '#e3f2fd', textColor: '#1565c0' },
  { key: 'note',       color: '#fce4ec', textColor: '#ad1457' },
  { key: '漫画',       color: '#f3e5f5', textColor: '#6a1b9a' },
  { key: 'UNLOOP',     color: '#e0f2f1', textColor: '#00695c' },
  { key: 'coconala',   color: '#fff8e1', textColor: '#f57f17' },
  { key: 'Xポスト',    color: '#e8eaf6', textColor: '#283593' },
];

function getProject(title) {
  for (const p of PROJECTS) {
    if (title.includes(p.key)) return p;
  }
  return null;
}

function makeProjTag(title) {
  const proj = getProject(title);
  if (!proj) return null;
  const tag = document.createElement('span');
  tag.className = 'proj-tag';
  tag.textContent = proj.key;
  tag.style.cssText = `background:${proj.color};color:${proj.textColor}`;
  return tag;
}

function openModal(title, fields, onSave) {
  const root = document.querySelector('#modalRoot');
  root.className = 'modal-backdrop';
  const box = node('div', 'modal');
  box.append(node('h2', '', title));
  const inputs = {};
  fields.forEach(f => {
    const wrap = node('div', 'field');
    wrap.append(node('label', '', f.label));
    let input;
    if (f.type === 'select') {
      input = node('select');
      f.options.forEach(o => input.append(new Option(o.label, o.value)));
      input.value = f.value;
    } else {
      input = node(f.type === 'textarea' ? 'textarea' : 'input');
    }
    input.value = f.value || '';
    inputs[f.key] = input;
    wrap.append(input);
    box.append(wrap);
  });
  const actions = node('div', 'modal-actions');
  const cancel = node('button', 'secondary', 'キャンセル');
  cancel.onclick = closeModal;
  const submit = node('button', 'primary', '保存');
  submit.onclick = () => onSave(Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.value])));
  actions.append(cancel, submit);
  box.append(actions);
  root.append(box);
}

function closeModal() {
  const root = document.querySelector('#modalRoot');
  root.className = 'hidden';
  root.replaceChildren();
}

function editTask(task) {
  openModal('タスクを編集', [
    { key: 'title', label: 'タスク名', value: task.title },
    { key: 'priority', label: '優先度', type: 'select', value: task.priority, options: [{ label: '高', value: 'high' }, { label: '中', value: 'medium' }, { label: '低', value: 'low' }] }
  ], v => {
    if (v.title.trim()) { Object.assign(task, { title: v.title.trim(), priority: v.priority }); save(); closeModal(); render(); }
  });
}

function render() {
  // ── 日時 ──
  document.querySelector('#focusText').textContent = data.focus;
  document.querySelector('#memo').value = data.memo || '';
  document.querySelector('#today').textContent = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', weekday: 'short' }).format(new Date());

  // ── タスクを未完了 / 完了済みに分類 ──
  const activeTasks = data.tasks.filter(t => !t.done).sort((a, b) => (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1));
  const doneTasks   = data.tasks.filter(t =>  t.done);

  // ── 今日やること（未完了のみ） ──
  const list = document.querySelector('#taskList');
  list.replaceChildren(...activeTasks.map(task => {
    const row  = node('div', 'row');
    const check = node('button', 'check' + (task.checked ? ' done' : ''), task.checked ? '✓' : '');
    check.onclick = () => { task.checked = !task.checked; save(); render(); };

    const body = node('span', 'task-text');
    const projTag = makeProjTag(task.title);
    if (projTag) body.append(projTag);
    const priLabel = task.priority === 'high' ? '高' : task.priority === 'low' ? '低' : '中';
    body.append(node('span', 'priority priority-' + (task.priority || 'medium'), priLabel));
    body.append(document.createTextNode(' ' + task.title));

    const actions = node('span', 'row-actions');
    const edit = node('button', 'edit-btn', '編集'); edit.onclick = () => editTask(task);
    const complete = node('button', 'complete-btn', '完了');
    complete.disabled = !task.checked;
    complete.onclick = () => { task.done = true; task.checked = true; save(); render(); };
    const del = node('button', 'delete-btn', '削除');
    del.onclick = () => { if (confirm('このタスクを削除しますか？')) { data.tasks = data.tasks.filter(t => t.id !== task.id); save(); render(); } };
    actions.append(edit, complete, del);
    row.append(check, body, actions);
    return row;
  }));

  const totalActive = activeTasks.length;
  const totalDone   = doneTasks.length;
  const total       = data.tasks.length;
  document.querySelector('#taskCount').textContent = `残り ${totalActive} 件`;
  document.querySelector('#progress').style.width = (total ? totalDone / total * 100 : 0) + '%';

  // ── 完了済みタスク ──
  const completedSection = document.querySelector('#completedSection');
  const completedList    = document.querySelector('#completedList');
  if (doneTasks.length > 0) {
    completedSection.style.display = '';
    document.querySelector('#completedCount').textContent = `${doneTasks.length}件`;
    completedList.replaceChildren(...doneTasks.map(task => {
      const row  = node('div', 'row done-row');
      const body = node('span', 'task-text done-text');
      const projTag = makeProjTag(task.title);
      if (projTag) body.append(projTag);
      body.append(document.createTextNode('✅ ' + task.title));

      const actions = node('span', 'row-actions');
      const undo = node('button', 'edit-btn', '戻す');
      undo.onclick = () => { task.done = false; task.checked = false; save(); render(); };
      const del = node('button', 'delete-btn', '削除');
      del.onclick = () => { if (confirm('削除しますか？')) { data.tasks = data.tasks.filter(t => t.id !== task.id); save(); render(); } };
      actions.append(undo, del);
      row.append(body, actions);
      return row;
    }));
  } else {
    completedSection.style.display = 'none';
  }

  // ── 全タスク一覧 ──
  renderBacklog();

  // ── タイムライン ──
  renderTimeline();

  // ── リンクバー ──
  renderLinks();
}

// プロジェクトカテゴリ定義（全タスク一覧用）
const CATS = [
  { label: '参っとこ！',  test: t => t.includes('参っとこ！') },
  { label: '飯沼厩舎',    test: t => t.includes('飯沼厩舎') },
  { label: '確定申告',    test: t => t.includes('確定申告') },
  { label: 'note',        test: t => t.includes('note') || t.includes('Note') },
  { label: '漫画・Kindle',test: t => t.includes('漫画') || t.includes('Kindle') || t.includes('Codex') },
  { label: 'UNLOOP',      test: t => t.includes('UNLOOP') || t.includes('Xポスト') },
  { label: 'coconala',    test: t => t.includes('coconala') },
];

function getCat(title) {
  for (const c of CATS) { if (c.test(title)) return c.label; }
  return 'その他';
}

function renderBacklog() {
  const list = document.querySelector('#backlogList');
  if (!list) return;

  const activeTasks = data.tasks.filter(t => !t.done);
  if (activeTasks.length === 0) {
    list.innerHTML = '<p class="backlog-empty">未完了のタスクはありません 🎉</p>';
    return;
  }

  // プロジェクト別にグループ化
  const grouped = {};
  activeTasks.forEach(task => {
    const cat = getCat(task.title);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(task);
  });

  list.replaceChildren();
  let first = true;
  const allCats = [...CATS.map(c => c.label), 'その他'];
  allCats.forEach(catLabel => {
    const items = grouped[catLabel];
    if (!items || items.length === 0) return;

    const h = node('div', 'backlog-cat' + (first ? ' first' : ''), catLabel);
    list.appendChild(h);
    first = false;

    items.forEach(task => {
      const p = task.priority || 'medium';
      const badge = p === 'high' ? '高' : p === 'low' ? '低' : '中';
      const proj = getProject(task.title);

      const item = document.createElement('div');
      item.className = 'backlog-item';

      // 優先度バッジ
      const priSpan = document.createElement('span');
      priSpan.className = 'priority priority-' + p;
      priSpan.textContent = badge;
      item.appendChild(priSpan);

      // タスク名（プロジェクト名プレフィックスを除去）
      let title = task.title
        .replace(/^参っとこ！[：:]\s*/, '')
        .replace(/^飯沼厩舎[：:]\s*/, '')
        .replace(/^確定申告ツール[：:]\s*/, '')
        .replace(/^【[^】]+】\s*/, '');
      item.appendChild(document.createTextNode(' ' + title));

      list.appendChild(item);
    });
  });
}

function renderTimeline() {
  const list = document.querySelector('#timelineList');
  const intro = document.querySelector('#timelineIntro');
  if (!list) return;

  const now = new Date();
  const wd = now.getDay();
  const isWeekend = wd === 0 || wd === 6;

  const SLOTS_WEEKDAY = [
    { time: '07:30',         title: '朝の確認',             note: 'AI秘書と優先順位確認（余裕があれば）' },
    { time: '09:00〜12:00', title: '会社勤務',             note: '本業・定時内' },
    { time: '12:00〜13:00', title: '昼休み',               note: '必ず休憩する' },
    { time: '13:00〜17:30', title: '会社勤務',             note: '本業・定時内' },
    { time: '18:30',         title: '最優先タスクに着手',   note: '退勤後に1つだけ進める' },
    { time: '20:00',         title: '進捗確認・明日の準備', note: 'AI秘書へ引き継ぐ内容を記録' },
  ];
  const SLOTS_WEEKEND = [
    { time: '10:30',         title: 'ゆっくり始動',         note: 'AI秘書と今日の優先順位を確認' },
    { time: '11:00',         title: '最優先タスクに着手',   note: '1つだけ集中して進める' },
    { time: '12:00〜13:00', title: '昼休み',               note: '休憩時間' },
    { time: '13:30',         title: '集中作業',             note: '進行中プロジェクトを進める' },
    { time: '15:30',         title: '進捗確認',             note: 'できたことを記録・引き継ぎ整理' },
  ];

  const slots = isWeekend ? SLOTS_WEEKEND : SLOTS_WEEKDAY;
  if (intro) intro.textContent = isWeekend
    ? '休日モード：無理せず1つ進める'
    : '平日モード：退勤後の副業時間を確保する';

  const nowMin = now.getHours() * 60 + now.getMinutes();

  list.replaceChildren(...slots.map(slot => {
    const row = document.createElement('div');
    // 現在時刻を過ぎたスロットをグレーアウト
    const slotHour = parseInt(slot.time, 10) || 0;
    const slotMin  = slotHour * 60 + (parseInt(slot.time.slice(3, 5), 10) || 0);
    row.className = 'timeline-item' + (slotMin < nowMin ? ' past' : '');

    const time = document.createElement('time');
    time.textContent = slot.time;
    const detail = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = slot.title;
    const small = document.createElement('small');
    small.textContent = slot.note;
    detail.append(strong, small);
    row.append(time, detail);
    return row;
  }));
}

function renderLinks() {
  const linkList = document.querySelector('#linkList');
  if (!linkList) return;
  linkList.replaceChildren(...data.links.map(link => {
    const card = document.createElement('a');
    card.className = 'link-card';
    card.href = link.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    const badge = node('span', 'link-badge', link.name.slice(0, 1).toUpperCase());
    const info = node('span', 'link-info');
    info.append(node('span', 'link-name', link.name));
    card.append(badge, info);

    // 編集モード用アクション（link-cardはaタグなので別途追加）
    const editBtn = node('button', 'edit-btn edit-only', '編集');
    editBtn.style.cssText = 'margin-left:4px;font-size:11px';
    editBtn.onclick = e => {
      e.preventDefault();
      openModal('リンクを編集', [
        { key: 'name', label: 'サイト名', value: link.name },
        { key: 'url',  label: 'URL',      value: link.url  },
        { key: 'use',  label: '用途',     value: link.use  }
      ], v => { if (v.name.trim() && v.url.trim()) { Object.assign(link, v); save(); closeModal(); render(); } });
    };
    const delBtn = node('button', 'delete-btn edit-only', '削除');
    delBtn.style.cssText = 'font-size:11px';
    delBtn.onclick = e => {
      e.preventDefault();
      if (confirm('削除しますか？')) { data.links = data.links.filter(x => x.id !== link.id); save(); render(); }
    };
    card.append(editBtn, delBtn);
    return card;
  }));
}

// ── イベントバインド ──
document.querySelector('#taskForm').onsubmit = e => {
  e.preventDefault();
  const input = document.querySelector('#taskInput');
  if (!input.value.trim()) return;
  data.tasks.push({ id: makeId(), title: input.value.trim(), priority: 'medium', checked: false, done: false });
  input.value = '';
  save(); render();
};

document.querySelector('#editFocus').onclick = () =>
  openModal('最初の15分にすること', [{ key: 'focus', label: '内容', value: data.focus }], v => {
    if (v.focus.trim()) { data.focus = v.focus.trim(); save(); closeModal(); render(); }
  });

document.querySelector('#memo').oninput = e => { data.memo = e.target.value; save(); };

document.querySelector('#addLink').onclick = () =>
  openModal('リンクを追加', [
    { key: 'name', label: 'サイト名' },
    { key: 'url',  label: 'URL'      },
    { key: 'use',  label: '用途'     }
  ], v => { if (v.name.trim() && v.url.trim()) { data.links.push({ id: makeId(), ...v }); save(); closeModal(); render(); } });

document.querySelector('#exportData').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `my-dashboard-backup-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.json`;
  a.click();
};

document.querySelector('#importData').onclick = () => document.querySelector('#fileInput').click();
document.querySelector('#fileInput').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!Array.isArray(incoming.tasks) || !Array.isArray(incoming.links)) throw Error();
      if (confirm('現在の内容をバックアップで置き換えますか？')) { data = { ...projectDefaults(), ...incoming }; save(); render(); }
    } catch { alert('バックアップファイルを読み込めませんでした'); }
  };
  reader.readAsText(file);
};

document.querySelector('#resetData').onclick = () => {
  if (confirm('初期状態に戻しますか？現在の内容は消えます。')) { data = projectDefaults(); save(); render(); }
};

const toggleEdit = document.querySelector('#toggleEdit');
toggleEdit.onclick = () => {
  const editing = document.body.classList.toggle('editing');
  toggleEdit.textContent = editing ? '閲覧画面に戻る' : '編集する';
  document.querySelector('#viewState').textContent = editing ? '編集画面' : '閲覧画面';
};

function tick() {
  document.querySelector('#time').textContent = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}
tick(); setInterval(tick, 30000);
render();
initGAS();
