const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { createServer } = require('http');
const { Server } = require('socket.io');

const db = require('./db');

const PORT = process.env.PORT || 3000;

const app = express();
app.set('trust proxy', 1); // needed on Render/Railway/etc. so sessions work behind their proxy
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'tiny-chat-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  }
});
app.use(sessionMiddleware);
// Give the Socket.IO handshake access to the same session as Express.
io.engine.use(sessionMiddleware);

// ---------- Auth routes ----------

function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_]{2,20}$/.test(username);
}

app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body || {};

  if (!isValidUsername(username)) {
    return res.status(400).json({
      error: 'Usernames are 2–20 characters: letters, numbers, underscores only.'
    });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (db.findUser(username)) {
    return res.status(409).json({ error: 'That username is taken.' });
  }
  if (db.getUserCount() >= db.MAX_MEMBERS) {
    return res.status(403).json({ error: `Tiny Chat is full (${db.MAX_MEMBERS}/${db.MAX_MEMBERS} members).` });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = db.createUser(username, passwordHash);

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = db.findUser(username || '');

  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in.' });
  res.json({
    username: req.session.username,
    memberCount: db.getUserCount(),
    maxMembers: db.MAX_MEMBERS
  });
});

app.get('/api/messages', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in.' });
  res.json(db.getRecentMessages());
});

// ---------- Real-time chat ----------

// Reject any socket whose handshake doesn't carry a logged-in session.
io.use((socket, next) => {
  const session = socket.request.session;
  if (session && session.userId) {
    socket.username = session.username;
    return next();
  }
  next(new Error('unauthorized'));
});

const onlineUsers = new Set();

function broadcastPresence() {
  io.emit('presence', {
    online: Array.from(onlineUsers),
    memberCount: db.getUserCount(),
    maxMembers: db.MAX_MEMBERS
  });
}

io.on('connection', (socket) => {
  onlineUsers.add(socket.username);
  broadcastPresence();

  socket.on('message', (text) => {
    if (typeof text !== 'string') return;
    const trimmed = text.trim().slice(0, 2000);
    if (!trimmed) return;
    const message = db.addMessage(socket.username, trimmed);
    io.emit('message', message);
  });

  socket.on('disconnect', () => {
    // Only mark offline once no more sockets remain for this user
    // (they may have more than one tab open).
    const stillConnected = Array.from(io.sockets.sockets.values()).some(
      (s) => s.username === socket.username
    );
    if (!stillConnected) {
      onlineUsers.delete(socket.username);
      broadcastPresence();
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Tiny Chat running at http://localhost:${PORT}`);
});
