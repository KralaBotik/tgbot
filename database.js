const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("bot.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      phone TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      date TEXT,
      time TEXT,
      duration INTEGER,
      FOREIGN KEY(user_id) REFERENCES users(user_id)
    )
  `);
});

async function addUser(userId, phone) {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO users (user_id, phone) VALUES (?, ?)",
      [userId, phone],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function isAuthorized(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM users WHERE user_id = ?",
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

async function getUserInfo(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM users WHERE user_id = ?",
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

async function saveAppointment(userId, date, time, duration) {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO appointments (user_id, date, time, duration) VALUES (?, ?, ?, ?)",
      [userId, date, time, duration],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function deleteAppointmentsForToday(userId) {
  const today = new Date().toISOString().split('T')[0];
  return new Promise((resolve, reject) => {
    db.run(
      "DELETE FROM appointments WHERE user_id = ? AND date = ?",
      [userId, today],
      (err) => {
        if (err) {
          console.error("Ошибка при удалении записей из базы данных:", err);
          reject(err);
        } else {
          console.log(`Записи пользователя ${userId} на ${today} удалены`);
          resolve();
        }
      }
    );
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  addUser,
  isAuthorized,
  getUserInfo,
  saveAppointment,
  deleteAppointmentsForToday,
  getAppointmentById,
  closeDatabase,
};




async function getAppointmentById(appointmentId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM appointments WHERE id = ?",
      [appointmentId],
      (err, row) => {
        if (err) {
          console.error("Ошибка получения записи:", err);
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
}
