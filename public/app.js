const $ = (sel) => document.querySelector(sel);

const TYPE_COLOR = {
  'Test 1': 'var(--t-test1)',
  'Test 2': 'var(--t-test2)',
  'Exam': 'var(--t-exam)',
  'Modules': 'var(--t-modules)',
  'Q&A': 'var(--t-qa)',
};
const TYPE_ICON = { 'Test 1': '📝', 'Test 2': '📝', 'Exam': '🎓', 'Modules': '📘', 'Q&A': '💡' };

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

const fmtSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const isImage = (f) => f.mime.startsWith('image/');
const filesOf = (subjectId) => data.files.filter((f) => f.subjectId === subjectId).sort((a, b) => a.uploadedAt - b.uploadedAt);
const subjectsOf = (semesterId) => data.subjects.filter((s) => s.semesterId === semesterId);
const semesterOf = (subject) => data.semesters.find((s) => s.id === subject.semesterId);
const subjectById = (id) => data.subjects.find((s) => s.id === id);

function badge(type) {
  return h('span', { class: 'badge', style: `--c:${TYPE_COLOR[type]}` }, type);
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
  const res = await ask({ title: 'New semester', text: 'e.g. "Sem 3" or "3rd Semester"', value: `Sem ${data.semesters.length + 1}`, okText: 'Add' });
  if (!res?.text) return;
  await attempt(async () => {
    const sem = await api('/api/semesters', 'POST', { name: res.text });
    openSems.add(sem.id);
    await refresh();
    toast(`Added ${sem.name}`);
  });
}

async function addSubject(semester) {
  const res = await ask({ title: `New subject in ${semester.name}`, text: 'e.g. "DBMS", "Maths", "Operating Systems"', value: '', okText: 'Add' });
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
    text: `This deletes ${subjects.length} subject(s) and ${fileCount} file(s) inside it. This can't be undone.`,
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
    text: `This deletes the subject and its ${count} file(s). This can't be undone.`,
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
  const res = await ask({ title: 'Edit paper', text: 'Name and type', value: file.title, choices: data.types, choice: file.type, okText: 'Save' });
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
function openSubject(id) {
  view.subjectId = id;
  view.tab = 'All';
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
  $('#viewerTitle').textContent = `${file.title}  ·  ${file.type}`;
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
    return h('div', { class: `sem${isOpen ? ' open' : ''}` },
      h('button', {
        class: 'sem-head',
        onclick: () => { isOpen ? openSems.delete(sem.id) : openSems.add(sem.id); store('openSems', [...openSems]); renderSidebar(); },
      },
        h('span', { class: 'chev' }, '▶'),
        h('span', { class: 'name' }, sem.name),
        h('span', { class: 'count' }, subjects.length),
      ),
      h('div', { class: 'sem-subjects' },
        subjects.map((sub) => h('button', {
          class: `subject-link${sub.id === view.subjectId && !view.query ? ' active' : ''}`,
          onclick: () => openSubject(sub.id),
        },
          h('span', { class: 'name' }, sub.name),
          h('span', { class: 'count' }, filesOf(sub.id).length),
        )),
        h('button', { class: 'subject-link add-subject', onclick: () => addSubject(sem) }, '+ Add subject'),
        h('div', { style: 'display:flex;gap:2px;padding:2px 4px 8px' },
          h('button', { class: 'icon-btn', title: 'Rename semester', onclick: () => renameSemester(sem) }, '✎'),
          h('button', { class: 'icon-btn danger', title: 'Delete semester', onclick: () => deleteSemester(sem) }, '🗑'),
        ),
      ),
    );
  }));
}

function fileCard(file, list, index, { showPath = false } = {}) {
  const subject = subjectById(file.subjectId);
  const semester = subject && semesterOf(subject);
  return h('div', { class: 'card' },
    h('button', { class: 'thumb', title: 'Open', onclick: () => openViewer(list, index) },
      isImage(file)
        ? h('img', { src: `/files/${file.id}`, alt: file.title, loading: 'lazy' })
        : h('div', { class: 'pdf-thumb' }, h('span', { class: 'big' }, '📄'), 'PDF'),
    ),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-title', title: file.title }, file.title),
      showPath && subject && h('button', { class: 'card-path', onclick: () => openSubject(subject.id) }, `${semester?.name ?? ''} › ${subject.name}`),
      h('div', { class: 'card-meta' }, badge(file.type), h('span', {}, `${fmtSize(file.size)} · ${fmtDate(file.uploadedAt)}`)),
    ),
    h('div', { class: 'card-actions' },
      h('a', { class: 'icon-btn', title: 'Download', href: `/files/${file.id}?download=1` }, '⬇'),
      h('button', { class: 'icon-btn', title: 'Rename / change type', onclick: () => editFile(file) }, '✎'),
      h('button', { class: 'icon-btn danger', title: 'Delete', onclick: () => deleteFile(file) }, '🗑'),
    ),
  );
}

function grid(files, opts) {
  return h('div', { class: 'grid' }, files.map((f, i) => fileCard(f, files, i, opts)));
}

function renderHome() {
  const recent = [...data.files].sort((a, b) => b.uploadedAt - a.uploadedAt).slice(0, 8);
  const out = [
    h('div', { class: 'page-head' }, h('h1', {}, 'My Papers')),
  ];

  if (!data.semesters.length) {
    out.push(h('div', { class: 'empty' },
      h('div', { class: 'big' }, '📚'),
      h('h2', {}, 'Keep all your question papers in one place'),
      h('p', {}, 'Start by adding a semester, then add subjects and upload your Test 1, Test 2, Exam papers, modules and Q&A.'),
      h('button', { class: 'btn primary', onclick: addSemester }, '+ Add your first semester'),
    ));
    return out;
  }

  out.push(h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('b', {}, data.semesters.length), h('span', {}, 'Semesters')),
    h('div', { class: 'stat' }, h('b', {}, data.subjects.length), h('span', {}, 'Subjects')),
    h('div', { class: 'stat' }, h('b', {}, data.files.length), h('span', {}, 'Papers & notes')),
  ));

  if (!data.subjects.length) {
    out.push(h('div', { class: 'empty' },
      h('div', { class: 'big' }, '📂'),
      h('h2', {}, 'Add a subject'),
      h('p', {}, 'Open a semester on the left and tap "+ Add subject".'),
      h('button', { class: 'btn primary', onclick: () => addSubject(data.semesters[0]) }, `+ Add subject to ${data.semesters[0].name}`),
    ));
    return out;
  }

  out.push(h('h2', { class: 'section-title' }, 'Recently added'));
  out.push(recent.length
    ? grid(recent, { showPath: true })
    : h('div', { class: 'empty' }, h('div', { class: 'big' }, '⬆'), h('h2', {}, 'No papers yet'), h('p', {}, 'Pick a subject on the left and upload your first paper.')));
  return out;
}

function renderSubject(subject) {
  const semester = semesterOf(subject);
  const all = filesOf(subject.id);
  const counts = Object.fromEntries(data.types.map((t) => [t, all.filter((f) => f.type === t).length]));

  const tabs = h('div', { class: 'tabs' },
    ['All', ...data.types].map((t) => h('button', {
      class: `tab${view.tab === t ? ' active' : ''}`,
      onclick: () => { view.tab = t; render(); },
    }, t, h('span', { class: 'count' }, t === 'All' ? all.length : counts[t]))),
  );

  // uploader
  const fileInput = h('input', { type: 'file', multiple: true, accept: 'application/pdf,image/*', hidden: true });
  const typeSelect = h('select', { 'aria-label': 'Paper type' }, data.types.map((t) => h('option', { value: t }, t)));
  typeSelect.value = view.tab === 'All' ? data.types[0] : view.tab;
  const bar = h('div');
  const progress = h('div', { class: 'progress', hidden: true }, bar);
  const uploader = h('div', { class: 'uploader' },
    h('div', { class: 'up-icon' }, '⬆'),
    h('div', { class: 'up-text' },
      h('strong', {}, 'Upload papers'),
      h('span', {}, 'Drop PDFs or photos here, or choose files. You can pick many pages at once.'),
    ),
    typeSelect,
    h('button', { class: 'btn primary', onclick: () => fileInput.click() }, 'Choose files'),
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
      toast(`Uploaded ${added.length} file${added.length === 1 ? '' : 's'} to ${typeSelect.value}`);
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
    content = h('div', { class: 'empty' },
      h('div', { class: 'big' }, view.tab === 'All' ? '📂' : TYPE_ICON[view.tab]),
      h('h2', {}, view.tab === 'All' ? 'Nothing here yet' : `No ${view.tab} papers yet`),
      h('p', {}, 'Use the upload box above to add PDFs or photos.'),
    );
  } else if (view.tab === 'All') {
    // group by type so Test 1, Test 2, Exam... each get their own section
    content = h('div', {}, data.types.filter((t) => counts[t]).map((t) => [
      h('h2', { class: 'section-title' }, `${TYPE_ICON[t]} ${t}`, h('span', { class: 'count' }, counts[t])),
      grid(shown.filter((f) => f.type === t)),
    ]));
  } else {
    content = grid(shown);
  }

  return [
    h('div', { class: 'crumb' }, semester?.name ?? ''),
    h('div', { class: 'page-head' },
      h('h1', {}, subject.name),
      h('button', { class: 'icon-btn', title: 'Rename subject', onclick: () => renameSubject(subject) }, '✎'),
      h('button', { class: 'icon-btn danger', title: 'Delete subject', onclick: () => deleteSubject(subject) }, '🗑'),
    ),
    tabs,
    uploader,
    content,
  ];
}

function renderSearch() {
  const q = view.query.toLowerCase();
  const results = data.files.filter((f) => {
    const subject = subjectById(f.subjectId);
    const semester = subject && semesterOf(subject);
    return [f.title, f.originalName, f.type, subject?.name, semester?.name].some((s) => s?.toLowerCase().includes(q));
  });
  return [
    h('div', { class: 'page-head' }, h('h1', {}, `Results for "${view.query}"`)),
    results.length
      ? grid(results, { showPath: true })
      : h('div', { class: 'empty' }, h('div', { class: 'big' }, '🔍'), h('h2', {}, 'No matches'), h('p', {}, 'Try a subject name, paper type or file name.')),
  ];
}

async function refresh() {
  data = await api('/api/data');
  render();
}

// ---------- wire up ----------
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
    } else if (data.semesters.length) {
      openSems.add(data.semesters[0].id);
    }
    render();
  });
})();
