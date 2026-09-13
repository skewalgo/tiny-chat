const authScreen = document.getElementById('auth-screen');
const chatScreen = document.getElementById('chat-screen');
const authError = document.getElementById('auth-error');
const authNote = document.getElementById('auth-note');

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const tabBtns = document.querySelectorAll('.tab-btn');

const messagesEl = document.getElementById('messages');
const composer = document.getElementById('composer');
const composerInput = document.getElementById('composer-input');
const memberLine = document.getElementById('member-line');
const logoutBtn = document.getElementById('logout-btn');

let me = null;
let socket = null;

// ---------- Tabs ----------

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabBtns.forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const showSignup = btn.dataset.tab === 'signup';
    loginForm.hidden = showSignup;
    signupForm.hidden = !showSignup;
    clearError();
  });
});

function clearError() {
  authError.hidden = true;
  authError.textContent = '';
}

function showError(message) {
  authError.textContent = message;
  authError.hidden = false;
}

// ---------- Auth ----------

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const data = await postJSON('/api/login', { username, password });
    enterChat(data.username);
  } catch (err) {
    showError(err.message);
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;
  try {
    const data = await postJSON('/api/signup', { username, password });
    enterChat(data.username);
  } catch (err) {
    showError(err.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  if (socket) socket.disconnect();
  me = null;
  messagesEl.innerHTML = '';
  chatScreen.hidden = true;
  authScreen.hidden = false;
});

// ---------- Chat ----------

async function enterChat(username) {
  me = username;
  authScreen.hidden = true;
  chatScreen.hidden = false;

  const history = await fetch('/api/messages').then((r) => r.json());
  messagesEl.innerHTML = '';
  history.forEach(renderMessage);
  scrollToBottom();

  connectSocket();
}

function connectSocket() {
  socket = io();

  socket.on('message', (msg) => {
    renderMessage(msg);
    scrollToBottom();
  });

  socket.on('presence', ({ online, memberCount, maxMembers }) => {
    memberLine.textContent = `${memberCount}/${maxMembers} members · ${online.length} online`;
  });

  socket.on('connect_error', () => {
    authNote.textContent = '';
  });
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = composerInput.value.trim();
  if (!text || !socket) return;
  socket.emit('message', text);
  composerInput.value = '';
});

function renderMessage(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (msg.username === me ? 'is-own' : 'is-other');

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = `${msg.username} · ${formatTime(msg.createdAt)}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = msg.content;

  wrap.appendChild(meta);
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---------- Resume session on reload ----------

(async function init() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      await enterChat(data.username);
    }
  } catch {
    // not logged in — stay on auth screen
  }
})();
