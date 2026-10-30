const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 4000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const TYPES = ['Test 1', 'Test 2', 'Exam', 'Modules', 'Q&A'];
const ALLOWED_MIME = /^(application\/pdf|image\/(?!svg).+)$/;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- tiny JSON "database" ----------
function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { semesters: [], subjects: [], files: [] };
  }
}

let db = loadDb();

function saveDb() {
  // write to a temp file first so a crash never leaves a half-written db
  fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(DB_FILE + '.tmp', DB_FILE);
}

const newId = () => crypto.randomUUID();
const cleanName = (value, max = 80) => String(value ?? '').trim().slice(0, max);
const badRequest = (res, error) => res.status(400).json({ error });

function removeFiles(predicate) {
  for (const f of db.files.filter(predicate)) {
    fs.rmSync(path.join(UPLOAD_DIR, f.storedName), { force: true });
  }
  db.files = db.files.filter((f) => !predicate(f));
}

// Browsers send file names as UTF-8 but multer reads them as latin1
function fixFileName(name) {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('�') ? name : utf8;
}

// ---------- app ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/data', (req, res) => {
  res.json({ types: TYPES, ...db });
});

// Semesters
app.post('/api/semesters', (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return badRequest(res, 'Semester name is required');
  const semester = { id: newId(), name, createdAt: Date.now() };
  db.semesters.push(semester);
  saveDb();
  res.status(201).json(semester);
});

app.patch('/api/semesters/:id', (req, res) => {
  const semester = db.semesters.find((s) => s.id === req.params.id);
  if (!semester) return res.status(404).json({ error: 'Semester not found' });
  const name = cleanName(req.body?.name);
  if (!name) return badRequest(res, 'Semester name is required');
  semester.name = name;
  saveDb();
  res.json(semester);
});

app.delete('/api/semesters/:id', (req, res) => {
  const subjectIds = new Set(db.subjects.filter((s) => s.semesterId === req.params.id).map((s) => s.id));
  removeFiles((f) => subjectIds.has(f.subjectId));
  db.subjects = db.subjects.filter((s) => s.semesterId !== req.params.id);
  db.semesters = db.semesters.filter((s) => s.id !== req.params.id);
  saveDb();
  res.status(204).end();
});

// Subjects
app.post('/api/subjects', (req, res) => {
  const name = cleanName(req.body?.name);
  if (!db.semesters.some((s) => s.id === req.body?.semesterId)) return badRequest(res, 'Semester not found');
  if (!name) return badRequest(res, 'Subject name is required');
  const subject = { id: newId(), semesterId: req.body.semesterId, name, createdAt: Date.now() };
  db.subjects.push(subject);
  saveDb();
  res.status(201).json(subject);
});

app.patch('/api/subjects/:id', (req, res) => {
  const subject = db.subjects.find((s) => s.id === req.params.id);
  if (!subject) return res.status(404).json({ error: 'Subject not found' });
  const name = cleanName(req.body?.name);
  if (!name) return badRequest(res, 'Subject name is required');
  subject.name = name;
  saveDb();
  res.json(subject);
});

app.delete('/api/subjects/:id', (req, res) => {
  removeFiles((f) => f.subjectId === req.params.id);
  db.subjects = db.subjects.filter((s) => s.id !== req.params.id);
  saveDb();
  res.status(204).end();
});

// Files
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, newId() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.test(file.mimetype)) cb(null, true);
    else cb(new Error(`"${fixFileName(file.originalname)}" is not a PDF or image`));
  },
});

app.post('/api/files', upload.array('files', 30), (req, res) => {
  const uploaded = req.files ?? [];
  const subject = db.subjects.find((s) => s.id === req.body?.subjectId);
  const type = TYPES.includes(req.body?.type) ? req.body.type : null;
  if (!subject || !type) {
    for (const f of uploaded) fs.rmSync(f.path, { force: true });
    return badRequest(res, 'Pick a subject and a paper type');
  }
  if (!uploaded.length) return badRequest(res, 'No files received');

  const now = Date.now();
  const added = uploaded.map((f, i) => {
    const originalName = fixFileName(f.originalname);
    return {
      id: path.parse(f.filename).name,
      subjectId: subject.id,
      type,
      title: path.parse(originalName).name.slice(0, 120),
      storedName: f.filename,
      originalName,
      mime: f.mimetype,
      size: f.size,
      uploadedAt: now + i, // keeps the order pages were picked in
    };
  });
  db.files.push(...added);
  saveDb();
  res.status(201).json(added);
});

app.patch('/api/files/:id', (req, res) => {
  const file = db.files.find((f) => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  if (req.body?.title !== undefined) {
    const title = cleanName(req.body.title, 120);
    if (!title) return badRequest(res, 'Title is required');
    file.title = title;
  }
  if (req.body?.type !== undefined) {
    if (!TYPES.includes(req.body.type)) return badRequest(res, 'Unknown paper type');
    file.type = req.body.type;
  }
  saveDb();
  res.json(file);
});

app.delete('/api/files/:id', (req, res) => {
  removeFiles((f) => f.id === req.params.id);
  saveDb();
  res.status(204).end();
});

app.get('/files/:id', (req, res) => {
  const file = db.files.find((f) => f.id === req.params.id);
  if (!file) return res.status(404).send('File not found');
  const downloadName = file.title + path.extname(file.originalName);
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
  res.type(file.mime);
  res.sendFile(path.join(UPLOAD_DIR, file.storedName));
});

app.use((err, req, res, next) => {
  const error = err.code === 'LIMIT_FILE_SIZE' ? 'A file is too big (max 50 MB)' : err.message || 'Something went wrong';
  res.status(400).json({ error });
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n📚 My Papers is running');
  console.log(`   On this laptop:              http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`   On your phone (same Wi-Fi):  http://${ip}:${PORT}`);
  console.log('');
});
