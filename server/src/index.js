require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const app = express();
const PORT = process.env.PORT || 5000;
const SECRET = process.env.JWT_SECRET || 'development_only_change_this_secret';
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

const sign = (manager) => jwt.sign({ id: manager.id, email: manager.email, name: manager.name }, SECRET, { expiresIn: '12h' });
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
  try { req.manager = jwt.verify(token, SECRET); next(); }
  catch { return res.status(401).json({ error: 'Your session has expired. Please log in again.' }); }
}
const ownedQueue = (queueId, managerId) => db.prepare('SELECT * FROM queues WHERE id = ? AND manager_id = ?').get(queueId, managerId);
const waitingCount = (queueId) => db.prepare("SELECT COUNT(*) AS n FROM tokens WHERE queue_id = ? AND status = 'waiting'").get(queueId).n;
function logEvent(queueId, type) {
  db.prepare('INSERT INTO queue_events(queue_id,event_type,waiting_count) VALUES(?,?,?)').run(queueId, type, waitingCount(queueId));
}
function normalizePositions(queueId) {
  const rows = db.prepare("SELECT id FROM tokens WHERE queue_id = ? AND status = 'waiting' ORDER BY position, id").all(queueId);
  const update = db.prepare('UPDATE tokens SET position = ? WHERE id = ?');
  const tx = db.transaction(() => rows.forEach((r, i) => update.run(i + 1, r.id)));
  tx();
}
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Queue Manager API' }));

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) return res.status(400).json({ error: 'Enter your name, a valid email and a password with at least 8 characters.' });
  try {
    const hash = bcrypt.hashSync(password, 12);
    const result = db.prepare('INSERT INTO managers(name,email,password_hash) VALUES(?,?,?)').run(name.trim(), email.trim().toLowerCase(), hash);
    const manager = db.prepare('SELECT id,name,email FROM managers WHERE id=?').get(result.lastInsertRowid);
    res.status(201).json({ token: sign(manager), manager });
  } catch (e) { res.status(409).json({ error: e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'An account with this email already exists.' : 'Could not create account.' }); }
});
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const manager = db.prepare('SELECT * FROM managers WHERE email=?').get((email || '').trim().toLowerCase());
  if (!manager || !bcrypt.compareSync(password || '', manager.password_hash)) return res.status(401).json({ error: 'Incorrect email or password.' });
  const safe = { id: manager.id, name: manager.name, email: manager.email };
  res.json({ token: sign(safe), manager: safe });
});
app.get('/api/auth/me', auth, (req, res) => res.json({ manager: req.manager }));

app.get('/api/queues', auth, (req, res) => {
  const queues = db.prepare(`SELECT q.*,
    SUM(CASE WHEN t.status='waiting' THEN 1 ELSE 0 END) AS waiting_count,
    SUM(CASE WHEN t.status='serving' THEN 1 ELSE 0 END) AS serving_count
    FROM queues q LEFT JOIN tokens t ON t.queue_id=q.id
    WHERE q.manager_id=? GROUP BY q.id ORDER BY q.created_at DESC`).all(req.manager.id);
  res.json({ queues: queues.map(q => ({ ...q, waiting_count: q.waiting_count || 0, serving_count: q.serving_count || 0 })) });
});
app.post('/api/queues', auth, (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name || name.length > 60) return res.status(400).json({ error: 'Queue name is required (maximum 60 characters).' });
  const result = db.prepare('INSERT INTO queues(manager_id,name) VALUES(?,?)').run(req.manager.id, name);
  logEvent(result.lastInsertRowid, 'created');
  res.status(201).json({ queue: db.prepare('SELECT * FROM queues WHERE id=?').get(result.lastInsertRowid) });
});
app.delete('/api/queues/:id', auth, (req, res) => {
  const q = ownedQueue(req.params.id, req.manager.id);
  if (!q) return res.status(404).json({ error: 'Queue not found.' });
  db.prepare('DELETE FROM queues WHERE id=?').run(q.id);
  res.json({ success: true });
});
app.get('/api/queues/:id/tokens', auth, (req, res) => {
  const q = ownedQueue(req.params.id, req.manager.id);
  if (!q) return res.status(404).json({ error: 'Queue not found.' });
  const tokens = db.prepare(`SELECT * FROM tokens WHERE queue_id=? AND status IN ('waiting','serving')
    ORDER BY CASE status WHEN 'serving' THEN 0 ELSE 1 END, position ASC, id ASC`).all(q.id);
  res.json({ queue: q, tokens });
});
app.post('/api/queues/:id/tokens', auth, (req, res) => {
  const q = ownedQueue(req.params.id, req.manager.id);
  if (!q) return res.status(404).json({ error: 'Queue not found.' });
  const personName = (req.body?.person_name || '').trim();
  if (!personName || personName.length > 80) return res.status(400).json({ error: 'Person name is required (maximum 80 characters).' });
  const result = db.prepare(`INSERT INTO tokens(queue_id,token_number,person_name,position)
    VALUES(?,?,?,?)`).run(q.id, db.prepare('SELECT COALESCE(MAX(token_number),0)+1 AS n FROM tokens WHERE queue_id=?').get(q.id).n, personName, waitingCount(q.id) + 1);
  logEvent(q.id, 'token_added');
  res.status(201).json({ token: db.prepare('SELECT * FROM tokens WHERE id=?').get(result.lastInsertRowid) });
});
app.post('/api/queues/:id/next', auth, (req, res) => {
  const q = ownedQueue(req.params.id, req.manager.id);
  if (!q) return res.status(404).json({ error: 'Queue not found.' });
  const active = db.prepare("SELECT id FROM tokens WHERE queue_id=? AND status='serving'").get(q.id);
  if (active) return res.status(409).json({ error: 'A token is already in service. Complete it before calling the next person.' });
  const top = db.prepare("SELECT * FROM tokens WHERE queue_id=? AND status='waiting' ORDER BY position,id LIMIT 1").get(q.id);
  if (!top) return res.status(409).json({ error: 'There are no people waiting in this queue.' });
  db.prepare("UPDATE tokens SET status='serving',service_started_at=CURRENT_TIMESTAMP WHERE id=?").run(top.id);
  normalizePositions(q.id); logEvent(q.id, 'called');
  res.json({ token: db.prepare('SELECT * FROM tokens WHERE id=?').get(top.id) });
});
app.post('/api/tokens/:id/complete', auth, (req, res) => {
  const token = db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE t.id=? AND q.manager_id=?`).get(req.params.id, req.manager.id);
  if (!token || token.status !== 'serving') return res.status(404).json({ error: 'Active service token not found.' });
  db.prepare("UPDATE tokens SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?").run(token.id);
  logEvent(token.queue_id, 'completed');
  res.json({ success: true });
});
app.delete('/api/tokens/:id', auth, (req, res) => {
  const token = db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE t.id=? AND q.manager_id=?`).get(req.params.id, req.manager.id);
  if (!token || !['waiting','serving'].includes(token.status)) return res.status(404).json({ error: 'Active token not found.' });
  db.prepare("UPDATE tokens SET status='cancelled' WHERE id=?").run(token.id);
  normalizePositions(token.queue_id); logEvent(token.queue_id, 'cancelled');
  res.json({ success: true });
});
app.post('/api/tokens/:id/move', auth, (req, res) => {
  const direction = req.body?.direction;
  if (!['up','down'].includes(direction)) return res.status(400).json({ error: 'Direction must be up or down.' });
  const token = db.prepare(`SELECT t.* FROM tokens t JOIN queues q ON q.id=t.queue_id WHERE t.id=? AND q.manager_id=? AND t.status='waiting'`).get(req.params.id, req.manager.id);
  if (!token) return res.status(404).json({ error: 'Waiting token not found.' });
  const order = direction === 'up' ? 'DESC' : 'ASC';
  const operator = direction === 'up' ? '<' : '>';
  const neighbor = db.prepare(`SELECT * FROM tokens WHERE queue_id=? AND status='waiting' AND position ${operator} ? ORDER BY position ${order}, id ${order} LIMIT 1`).get(token.queue_id, token.position);
  if (!neighbor) return res.json({ success: true });
  const tx = db.transaction(() => {
    db.prepare('UPDATE tokens SET position=? WHERE id=?').run(neighbor.position, token.id);
    db.prepare('UPDATE tokens SET position=? WHERE id=?').run(token.position, neighbor.id);
  });
  tx(); logEvent(token.queue_id, 'reordered');
  res.json({ success: true });
});
app.get('/api/queues/:id/analytics', auth, (req, res) => {
  const q = ownedQueue(req.params.id, req.manager.id);
  if (!q) return res.status(404).json({ error: 'Queue not found.' });
  const counts = db.prepare(`SELECT
    SUM(status='waiting') AS waiting, SUM(status='serving') AS serving,
    SUM(status='completed') AS completed, SUM(status='cancelled') AS cancelled,
    COUNT(*) AS total FROM tokens WHERE queue_id=?`).get(q.id);
  const avg = db.prepare(`SELECT ROUND(AVG((julianday(service_started_at)-julianday(created_at))*1440),1) AS avg_wait
    FROM tokens WHERE queue_id=? AND service_started_at IS NOT NULL`).get(q.id);
  const trend = db.prepare(`SELECT created_at AS ts, waiting_count AS length FROM queue_events
    WHERE queue_id=? AND created_at >= datetime('now','-1 day') ORDER BY id DESC LIMIT 40`).all(q.id).reverse()
    .map(r => ({ ts: r.ts.replace(' ', 'T') + 'Z', length: r.length }));
  const recent = db.prepare(`SELECT id,token_number,person_name,status,created_at,service_started_at,completed_at
    FROM tokens WHERE queue_id=? ORDER BY id DESC LIMIT 8`).all(q.id);
  res.json({ counts: Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v||0])), average_wait_minutes: avg.avg_wait || 0, trend, recent });
});
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Something went wrong on the server.' }); });
app.listen(PORT, () => console.log(`Queue Manager API running at http://localhost:${PORT}`));
