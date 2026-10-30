const $ = (sel) => document.querySelector(sel);

// each paper type and each subject gets a hue; CSS turns it into soft/strong colours for the theme
const TYPE_HUE = { 'Test 1': 217, 'Test 2': 262, 'Exam': 352, 'Modules': 158, 'Q&A': 32 };
const SUBJECT_HUES = [234, 192, 330, 24, 145, 275, 8, 205, 48, 170];

const ICONS = {
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

let data = { types: [], semesters: [], subjects: [], files: [] };
const view = { subjectId: null, tab: 'All', query: '' };
const openSems = new Set();

// ---------- small helpers ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'style') el.style.cssText = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
}

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return null;
  }
}

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).error || message; } catch {}
    throw new Error(message);
  }
  return res.status === 204 ? null : res.json();
}

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function attempt(fn) {
  try {
    await fn();
  } catch (err) {
    toast(err.message, true);
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fmtSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const fmtDate = (ms) => {
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
};
const isImage = (f) => f.mime.startsWith('image/');
const filesOf = (subjectId) => data.files.filter((f) => f.subjectId === subjectId).sort((a, b) => a.uploadedAt - b.uploadedAt);
const subjectsOf = (semesterId) => data.subjects.filter((s) => s.semesterId === semesterId);
const semesterOf = (subject) => data.semesters.find((s) => s.id === subject.semesterId);
const subjectById = (id) => data.subjects.find((s) => s.id === id);

function subjectHue(subject) {
  let sum = 0;
  for (const ch of subject.id) sum += ch.charCodeAt(0);
  return SUBJECT_HUES[sum % SUBJECT_HUES.length];
}

function initials(name) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const tint = (hue) => `--hue:${hue}`;

function avatar(subject, size = '') {
  return h('span', { class: `avatar tinted ${size}`, style: tint(subjectHue(subject)) }, initials(subject.name));
}

function badge(type) {
  return h('span', { class: 'badge tinted', style: tint(TYPE_HUE[type]) }, type);
}

function emptyState({ art = 'folder', title, text, action, compact = false }) {
  return h('div', { class: `empty${compact ? ' compact' : ''}` },
    h('div', { class: 'empty-art' }, icon(art)),
    h('h2', {}, title),
    h('p', {}, text),
    action,
  );
}

// ---------- theme ----------
function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function renderThemeButton() {
  const dark = currentTheme() === 'dark';
  $('#themeBtn').replaceChildren(icon(dark ? 'sun' : 'moon'));
  $('#themeBtn').title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store('theme', next);
  renderThemeButton();
}

// ---------- dialog ----------
function ask({ title, text = '', value = null, choices = null, choice = null, okText = 'OK', danger = false }) {
  const dlg = $('#dialog');
  const input = $('#dialogInput');
  const select = $('#dialogSelect');
  const ok = $('#dialogOk');

  $('#dialogTitle').textContent = title;
  $('#dialogText').textContent = text;
  $('#dialogText').hidden = !text;
  input.hidden = value === null;
  input.required = value !== null;
  input.value = value ?? '';
  select.hidden = !choices;
  select.replaceChildren(...(choices ?? []).map((c) => h('option', { value: c }, c)));
  if (choice) select.value = choice;
  ok.textContent = okText;
  ok.className = `btn ${danger ? 'danger' : 'primary'}`;

  dlg.returnValue = '';
  dlg.showModal();
  if (value !== null) { input.focus(); input.select(); }

  return new Promise((resolve) => {
    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'ok') return resolve(null);
      resolve({ text: input.value.trim(), choice: select.value });
    }, { once: true });
  });
}

// ---------- actions ----------
async function addSemester() {
  const res = await ask({ title: 'New semester', text: 'e.g. "Sem 3" or "3rd Semester"', value: `Sem ${data.semesters.length + 1}`, okText: 'Add semester' });
  if (!res?.text) return;
  await attempt(async () => {
    const sem = await api('/api/semesters', 'POST', { name: res.text });
    openSems.add(sem.id);
    await refresh();
    toast(`Added ${sem.name}`);
  });
}

async function addSubject(semester) {
  const res = await ask({ title: `New subject in ${semester.name}`, text: 'e.g. "DBMS", "Maths", "Operating Systems"', value: '', okText: 'Add subject' });
  if (!res?.text) return;
  await attempt(async () => {
    const subject = await api('/api/subjects', 'POST', { semesterId: semester.id, name: res.text });
    openSems.add(semester.id);
    await refresh();
    openSubject(subject.id);
  });
}

async function renameSemester(semester) {
  const res = await ask({ title: 'Rename semester', value: semester.name, okText: 'Save' });
  if (!res?.text) return;
  await attempt(async () => { await api(`/api/semesters/${semester.id}`, 'PATCH', { name: res.text }); await refresh(); });
}

async function deleteSemester(semester) {
  const subjects = subjectsOf(semester.id);
  const fileCount = data.files.filter((f) => subjects.some((s) => s.id === f.subjectId)).length;
  const ok = await ask({
    title: `Delete ${semester.name}?`,
    text: `This deletes ${plural(subjects.length, 'subject')} and ${plural(fileCount, 'file')} inside it. This can't be undone.`,
    okText: 'Delete',
    danger: true,
  });
  if (!ok) return;
  await attempt(async () => {
    await api(`/api/semesters/${semester.id}`, 'DELETE');
    if (subjects.some((s) => s.id === view.subjectId)) view.subjectId = null;
    await refresh();
    toast(`Deleted ${semester.name}`);
  });
}

async function renameSubject(subject) {
  const res = await ask({ title: 'Rename subject', value: subject.name, okText: 'Save' });
  if (!res?.text) return;
  await attempt(async () => { await api(`/api/subjects/${subject.id}`, 'PATCH', { name: res.text }); await refresh(); });
}

async function deleteSubject(subject) {
  const count = filesOf(subject.id).length;
  const ok = await ask({
    title: `Delete ${subject.name}?`,
    text: `This deletes the subject and its ${plural(count, 'file')}. This can't be undone.`,
    okText: 'Delete',
    danger: true,
  });
  if (!ok) return;
  await attempt(async () => {
    await api(`/api/subjects/${subject.id}`, 'DELETE');
    view.subjectId = null;
    await refresh();
    toast(`Deleted ${subject.name}`);
  });
}

async function editFile(file) {
  const res = await ask({ title: 'Edit paper', text: 'Change its name or move it to another type.', value: file.title, choices: data.types, choice: file.type, okText: 'Save' });
  if (!res?.text) return;
  await attempt(async () => { await api(`/api/files/${file.id}`, 'PATCH', { title: res.text, type: res.choice }); await refresh(); });
}

async function deleteFile(file) {
  const ok = await ask({ title: 'Delete this paper?', text: `"${file.title}" will be removed for good.`, okText: 'Delete', danger: true });
  if (!ok) return;
  await attempt(async () => { await api(`/api/files/${file.id}`, 'DELETE'); await refresh(); toast('Deleted'); });
}

function uploadFiles(fileList, subjectId, type, onProgress) {
  const form = new FormData();
  form.append('subjectId', subjectId);
  form.append('type', type);
  for (const f of fileList) form.append('files', f);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch {}
      xhr.status < 300 ? resolve(body) : reject(new Error(body.error || 'Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Upload failed — is the server running?'));
    xhr.send(form);
  });
}

// ---------- navigation ----------
function openSubject(id, tab = 'All') {
  view.subjectId = id;
  view.tab = tab;
  view.query = '';
  $('#search').value = '';
  const subject = subjectById(id);
  if (subject) openSems.add(subject.semesterId);
  store('lastSubject', id);
  document.body.classList.remove('menu-open');
  render();
  window.scrollTo(0, 0);
}

function goHome() {
  view.subjectId = null;
  view.query = '';
  $('#search').value = '';
  store('lastSubject', null);
  document.body.classList.remove('menu-open');
  render();
  window.scrollTo(0, 0);
}

// ---------- viewer ----------
const viewer = { list: [], index: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches;

function openViewer(list, index) {
  const file = list[index];
  // phone browsers can't show PDFs inside a page, so open them in the phone's PDF viewer
  if (!isImage(file) && isTouch) {
    window.open(`/files/${file.id}`, '_blank');
    return;
  }
  viewer.list = list;
  viewer.index = index;
  showViewerFile();
  $('#viewer').hidden = false;
  document.body.style.overflow = 'hidden';
}

function showViewerFile() {
  const file = viewer.list[viewer.index];
  const url = `/files/${file.id}`;
  const position = viewer.list.length > 1 ? `  ·  ${viewer.index + 1} of ${viewer.list.length}` : '';
  $('#viewerTitle').textContent = `${file.title}${position}`;
  $('#viewerOpen').href = url;
  $('#viewerDownload').href = `${url}?download=1`;
  $('#viewerBody').replaceChildren(isImage(file) ? h('img', { src: url, alt: file.title }) : h('iframe', { src: url, title: file.title }));
  $('#viewerPrev').hidden = viewer.index === 0;
  $('#viewerNext').hidden = viewer.index === viewer.list.length - 1;
}

function stepViewer(delta) {
  const next = viewer.index + delta;
  if (next < 0 || next >= viewer.list.length) return;
  viewer.index = next;
  showViewerFile();
}

function closeViewer() {
  $('#viewer').hidden = true;
  $('#viewerBody').replaceChildren();
  document.body.style.overflow = '';
}

// ---------- rendering ----------
function render() {
  renderSidebar();
  const main = $('#main');
  if (view.query) main.replaceChildren(...renderSearch());
  else if (view.subjectId && subjectById(view.subjectId)) main.replaceChildren(...renderSubject(subjectById(view.subjectId)));
  else main.replaceChildren(...renderHome());
}

function renderSidebar() {
  const nav = $('#semList');
  if (!data.semesters.length) {
    nav.replaceChildren(h('div', { class: 'side-empty' }, 'No semesters yet. Add one to get started.'));
    return;
  }
  nav.replaceChildren(...data.semesters.map((sem) => {
    const subjects = subjectsOf(sem.id);
    const isOpen = openSems.has(sem.id);
    const toggle = () => {
      isOpen ? openSems.delete(sem.id) : openSems.add(sem.id);
      store('openSems', [...openSems]);
      renderSidebar();
    };
    return h('div', { class: `sem${isOpen ? ' open' : ''}` },
      h('div', { class: 'sem-head' },
        h('button', { class: 'sem-toggle', onclick: toggle, 'aria-expanded': String(isOpen) },
          h('span', { class: 'chev' }, icon('chevronRight')),
          h('span', { class: 'name' }, sem.name),
          h('span', { class: 'count' }, subjects.length),
        ),
        h('div', { class: 'sem-tools' },
          h('button', { class: 'icon-btn', title: 'Rename semester', onclick: () => renameSemester(sem) }, icon('edit')),
          h('button', { class: 'icon-btn danger', title: 'Delete semester', onclick: () => deleteSemester(sem) }, icon('trash')),
        ),
      ),
      h('div', { class: 'sem-subjects' },
        subjects.map((sub) => h('button', {
          class: `subject-link${sub.id === view.subjectId && !view.query ? ' active' : ''}`,
          onclick: () => openSubject(sub.id),
        },
          avatar(sub),
          h('span', { class: 'name' }, sub.name),
          h('span', { class: 'count' }, filesOf(sub.id).length),
        )),
        h('button', { class: 'subject-link add', onclick: () => addSubject(sem) },
          h('span', { class: 'plus' }, icon('plus')),
          h('span', { class: 'name' }, 'Add subject'),
        ),
      ),
    );
  }));
}

function fileCard(file, list, index, { showPath = false } = {}) {
  const subject = subjectById(file.subjectId);
  return h('div', { class: 'card' },
    h('button', { class: 'thumb', title: 'Open', onclick: () => openViewer(list, index) },
      isImage(file)
        ? h('img', { src: `/files/${file.id}`, alt: file.title, loading: 'lazy' })
        : h('div', { class: 'pdf-thumb tinted', style: tint(TYPE_HUE[file.type]) },
          h('div', { class: 'pdf-doc' }, h('b', {}, 'PDF'), h('i'), h('i'), h('i')),
        ),
      // in mixed lists (search, recent) show the type; inside a subject the section heading already says it
      showPath && h('span', { class: 'kind' }, badge(file.type)),
    ),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title', title: file.title }, file.title),
      showPath && subject && h('button', { class: 'card-path', onclick: () => openSubject(subject.id) },
        avatar(subject),
        h('span', {}, `${semesterOf(subject)?.name ?? ''} · ${subject.name}`),
      ),
    ),
    h('div', { class: 'card-foot' },
      h('span', { class: 'card-meta' }, `${fmtSize(file.size)} · ${fmtDate(file.uploadedAt)}`),
      h('div', { class: 'card-actions' },
        h('a', { class: 'icon-btn', title: 'Download', href: `/files/${file.id}?download=1` }, icon('download')),
        h('button', { class: 'icon-btn', title: 'Rename / change type', onclick: () => editFile(file) }, icon('edit')),
        h('button', { class: 'icon-btn danger', title: 'Delete', onclick: () => deleteFile(file) }, icon('trash')),
      ),
    ),
  );
}

function grid(files, opts) {
  return h('div', { class: 'grid' }, files.map((f, i) => fileCard(f, files, i, opts)));
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function subjectTile(subject) {
  const files = filesOf(subject.id);
  const chips = data.types
    .map((t) => [t, files.filter((f) => f.type === t).length])
    .filter(([, n]) => n)
    .map(([t, n]) => h('span', { class: 'dot-chip tinted', style: tint(TYPE_HUE[t]) }, `${t} · ${n}`));
  return h('button', { class: 'subject-tile tinted', style: tint(subjectHue(subject)), onclick: () => openSubject(subject.id) },
    avatar(subject, 'md'),
    h('div', { class: 'tile-name' }, subject.name),
    h('div', { class: 'tile-sub' }, files.length ? plural(files.length, 'paper') : 'No papers yet'),
    h('div', { class: 'dots' }, chips),
  );
}

function renderHome() {
  const out = [];
  const head = h('div', { class: 'hello' },
    h('div', {},
      h('small', {}, `${greeting()} 👋`),
      h('h1', {}, 'Your study vault'),
      h('p', {}, data.files.length
        ? `${plural(data.files.length, 'paper')} across ${plural(data.subjects.length, 'subject')}`
        : 'Every question paper, module and answer in one place.'),
    ),
    data.semesters.length > 0 && h('button', { class: 'btn primary', onclick: addSemester }, icon('plus'), 'New semester'),
  );
  out.push(head);

  if (!data.semesters.length) {
    out.push(emptyState({
      art: 'book',
      title: 'Start your collection',
      text: 'Add a semester, then add subjects and upload your Test 1, Test 2 and Exam papers, module notes and Q&A.',
      action: h('button', { class: 'btn primary', onclick: addSemester }, icon('plus'), 'Add your first semester'),
    }));
    return out;
  }

  out.push(h('div', { class: 'type-stats' }, data.types.map((t) => h('div', { class: 'type-stat tinted', style: tint(TYPE_HUE[t]) },
    h('b', {}, data.files.filter((f) => f.type === t).length),
    h('span', {}, t),
  ))));

  for (const sem of data.semesters) {
    const subjects = subjectsOf(sem.id);
    out.push(h('h2', { class: 'section-title' }, sem.name, h('span', { class: 'count' }, plural(subjects.length, 'subject')), h('span', { class: 'line' })));
    out.push(h('div', { class: 'subject-grid' },
      subjects.map(subjectTile),
      h('button', { class: 'subject-tile add', onclick: () => addSubject(sem) }, h('span', { class: 'plus' }, icon('plus')), 'Add subject'),
    ));
  }

  const recent = [...data.files].sort((a, b) => b.uploadedAt - a.uploadedAt).slice(0, 8);
  if (recent.length) {
    out.push(h('h2', { class: 'section-title' }, 'Recently added', h('span', { class: 'line' })));
    out.push(grid(recent, { showPath: true }));
  }
  return out;
}

function renderSubject(subject) {
  const semester = semesterOf(subject);
  const all = filesOf(subject.id);
  const counts = Object.fromEntries(data.types.map((t) => [t, all.filter((f) => f.type === t).length]));
  const lastAdded = all.length ? Math.max(...all.map((f) => f.uploadedAt)) : null;

  const banner = h('div', { class: 'banner tinted', style: tint(subjectHue(subject)) },
    avatar(subject, 'lg'),
    h('div', { class: 'banner-text' },
      h('div', { class: 'crumb' }, semester?.name ?? ''),
      h('h1', {}, subject.name),
      h('div', { class: 'summary' }, all.length ? `${plural(all.length, 'paper')} · last added ${fmtDate(lastAdded)}` : 'No papers yet — upload your first one below'),
    ),
    h('div', { class: 'banner-tools' },
      h('button', { class: 'icon-btn', title: 'Rename subject', onclick: () => renameSubject(subject) }, icon('edit')),
      h('button', { class: 'icon-btn danger', title: 'Delete subject', onclick: () => deleteSubject(subject) }, icon('trash')),
    ),
  );

  const tabs = h('div', { class: 'tabs' },
    ['All', ...data.types].map((t) => h('button', {
      class: `tab${t === 'All' ? '' : ' tinted'}${view.tab === t ? ' active' : ''}`,
      style: t === 'All' ? null : tint(TYPE_HUE[t]),
      onclick: () => { view.tab = t; render(); },
    },
      t !== 'All' && h('span', { class: 'dot' }),
      t,
      h('span', { class: 'count' }, t === 'All' ? all.length : counts[t]),
    )),
  );

  // uploader
  const fileInput = h('input', { type: 'file', multiple: true, accept: 'application/pdf,image/*', hidden: true });
  const typeSelect = h('select', { 'aria-label': 'Paper type' }, data.types.map((t) => h('option', { value: t }, t)));
  typeSelect.value = view.tab === 'All' ? data.types[0] : view.tab;
  const bar = h('div');
  const progress = h('div', { class: 'progress', hidden: true }, bar);
  const uploader = h('div', { class: 'uploader' },
    h('div', { class: 'up-icon' }, icon('upload')),
    h('div', { class: 'up-text' },
      h('strong', {}, 'Upload papers'),
      h('span', {}, 'Drop PDFs or photos here. Pick many pages at once — they stay in order.'),
    ),
    h('div', { class: 'up-controls' },
      typeSelect,
      h('button', { class: 'btn primary', onclick: () => fileInput.click() }, icon('plus'), 'Choose files'),
    ),
    fileInput,
    progress,
  );

  async function send(files) {
    if (!files.length) return;
    progress.hidden = false;
    bar.style.width = '0%';
    await attempt(async () => {
      const added = await uploadFiles(files, subject.id, typeSelect.value, (p) => { bar.style.width = `${Math.round(p * 100)}%`; });
      view.tab = typeSelect.value;
      await refresh();
      toast(`Uploaded ${plural(added.length, 'file')} to ${typeSelect.value}`);
    });
    progress.hidden = true;
  }

  fileInput.addEventListener('change', () => { send([...fileInput.files]); fileInput.value = ''; });
  uploader.addEventListener('dragover', (e) => { e.preventDefault(); uploader.classList.add('drag'); });
  uploader.addEventListener('dragleave', () => uploader.classList.remove('drag'));
  uploader.addEventListener('drop', (e) => { e.preventDefault(); uploader.classList.remove('drag'); send([...e.dataTransfer.files]); });

  // files
  let content;
  const shown = view.tab === 'All' ? all : all.filter((f) => f.type === view.tab);
  if (!shown.length) {
    content = h('div', { style: 'margin-top:24px' }, emptyState({
      art: 'file',
      title: view.tab === 'All' ? 'Nothing here yet' : `No ${view.tab} papers yet`,
      text: 'Use the upload box above to add PDFs or photos.',
      compact: true,
    }));
  } else if (view.tab === 'All') {
    // group by type so Test 1, Test 2, Exam... each get their own section
    content = h('div', {}, data.types.filter((t) => counts[t]).map((t) => [
      h('h2', { class: 'section-title' }, badge(t), h('span', { class: 'count' }, plural(counts[t], 'file')), h('span', { class: 'line' })),
      grid(shown.filter((f) => f.type === t)),
    ]));
  } else {
    content = h('div', { style: 'margin-top:24px' }, grid(shown));
  }

  return [banner, tabs, uploader, content];
}

function renderSearch() {
  const q = view.query.toLowerCase();
  const results = data.files.filter((f) => {
    const subject = subjectById(f.subjectId);
    const semester = subject && semesterOf(subject);
    return [f.title, f.originalName, f.type, subject?.name, semester?.name].some((s) => s?.toLowerCase().includes(q));
  });
  return [
    h('h1', { class: 'page-title' }, `${plural(results.length, 'result')} for “${view.query}”`),
    results.length
      ? grid(results, { showPath: true })
      : emptyState({ art: 'search', title: 'No matches', text: 'Try a subject name, paper type or file name.' }),
  ];
}

async function refresh() {
  data = await api('/api/data');
  render();
}

// ---------- wire up ----------
for (const el of document.querySelectorAll('[data-icon]')) el.prepend(icon(el.dataset.icon));
renderThemeButton();

$('#themeBtn').addEventListener('click', toggleTheme);
$('#addSem').addEventListener('click', addSemester);
$('#homeLink').addEventListener('click', (e) => { e.preventDefault(); goHome(); });
$('#menuBtn').addEventListener('click', () => document.body.classList.toggle('menu-open'));
$('#backdrop').addEventListener('click', () => document.body.classList.remove('menu-open'));
$('#search').addEventListener('input', (e) => { view.query = e.target.value.trim(); render(); });
$('#viewerClose').addEventListener('click', closeViewer);
$('#viewerPrev').addEventListener('click', () => stepViewer(-1));
$('#viewerNext').addEventListener('click', () => stepViewer(1));
document.addEventListener('keydown', (e) => {
  if ($('#viewer').hidden) return;
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'ArrowLeft') stepViewer(-1);
  if (e.key === 'ArrowRight') stepViewer(1);
});

(async () => {
  for (const id of store('openSems') ?? []) openSems.add(id);
  await attempt(async () => {
    data = await api('/api/data');
    const last = store('lastSubject');
    if (last && subjectById(last)) {
      view.subjectId = last;
      openSems.add(subjectById(last).semesterId);
    } else {
      for (const sem of data.semesters) openSems.add(sem.id);
    }
    render();
  });
})();
