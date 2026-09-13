// Tiny file-based "database". Good enough for a single shared room
// capped at 10 members — no need for a real DB engine.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');
const MAX_MESSAGES = 200; // keep the history file from growing forever

function load() {
  if (!fs.existsSync(DB_PATH)) {
    return { users: [], messages: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    console.error('Could not read data.json, starting fresh:', err.message);
    return { users: [], messages: [] };
  }
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

let data = load();

module.exports = {
  MAX_MEMBERS: 10,

  getUserCount() {
    return data.users.length;
  },

  findUser(username) {
    const lower = username.toLowerCase();
    return data.users.find((u) => u.username.toLowerCase() === lower);
  },

  createUser(username, passwordHash) {
    const user = {
      id: data.users.length ? data.users[data.users.length - 1].id + 1 : 1,
      username,
      passwordHash,
      createdAt: new Date().toISOString()
    };
    data.users.push(user);
    save(data);
    return user;
  },

  listUsernames() {
    return data.users.map((u) => u.username);
  },

  getRecentMessages(limit = 50) {
    return data.messages.slice(-limit);
  },

  addMessage(username, content) {
    const message = {
      id: data.messages.length ? data.messages[data.messages.length - 1].id + 1 : 1,
      username,
      content,
      createdAt: new Date().toISOString()
    };
    data.messages.push(message);
    if (data.messages.length > MAX_MESSAGES) {
      data.messages = data.messages.slice(-MAX_MESSAGES);
    }
    save(data);
    return message;
  }
};
