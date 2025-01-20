const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("bot.db");

// Создание таблицы
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      phone TEXT
    )
  `);
});

// Функция для добавления пользователя
async function addUser(userId, phone) {
  return new Promise((resolve, reject) => {
    db.run("INSERT INTO users (user_id, phone) VALUES (?, ?)", [userId, phone], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// Проверка авторизации
async function isAuthorized(userId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE user_id = ?", [userId], (err, row) => {
      if (err) return reject(err);
      resolve(!!row);
    });
  });
}

// Получение информации о пользователе
async function getUserInfo(userId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE user_id = ?", [userId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

// Закрытие базы данных при завершении
function closeDatabase() {
  db.close((err) => {
    if (err) {
      console.error("Ошибка при закрытии базы данных:", err);
    } else {
      console.log("База данных закрыта.");
    }
  });
}

module.exports = { addUser, isAuthorized, getUserInfo, closeDatabase };