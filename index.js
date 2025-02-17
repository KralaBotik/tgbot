require("dotenv").config();
const { Bot, Keyboard, InlineKeyboard, session } = require("grammy");
const axios = require("axios");
const { addUser, isAuthorized, getUserInfo, saveAppointment, deleteAppointmentsForToday } = require("./database");


const bot = new Bot(process.env.BOT_API_KEY);

bot.use(session({
  initial: () => ({
    appointment: {}
  })
}));

const mainMenu = new Keyboard()
  .text("📅 Записаться на мойку")
  .text("👤 Личный кабинет")
  .resized();

const authKeyboard = new Keyboard()
  .requestContact("📱 Авторизироваться")
  .resized()
  .oneTime();

  const cabinetMenu = new Keyboard()
  .text("📜 Архив моек")
  .text("📋 Мои текущие записи")
  .row()
  .text("🗑 Удалить все записи на сегодня")
  .row()
  .text("🔙 Вернуться в меню")
  .resized();


const API_URL = "https://molot.papillon.ru/rty/wht/reserv/";

function formatDate(dateString) {
  const [year, month, day] = dateString.split('-');
  return `${day}.${month}.${year}`;
}

// Функция для удаления бронирования
async function cancelReservation(date, time, duration, userId, boxId = 1) {
  const url = `${API_URL}set.php?box=${boxId}`;

  const data = {
    id: null,
    date: date, // Формат YYYY-MM-DD
    time: {
      start: time, // Формат HH:MM
      duration: duration
    },
    free: true,
    service: false,
    person: {
      id: userId // ID пользователя
    }
  };

  try {
    const response = await axios.post(url, data, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log("Бронирование отменено:", response.data);
    return response.data;
  } catch (error) {
    console.error("Ошибка при отмене бронирования:", error.response?.data || error.message);
    throw error;
  }
}

async function getAppointmentsFromAPI(userId) {
  try {
    const today = new Date().toISOString().split('T')[0]; // Формат YYYY-MM-DD
    const response = await axios.get(`${API_URL}get.php`, {
      params: {
        user_id: userId,
        dates: `[${today}]` // Передаем текущую дату
      }
    });
    console.log("Ответ от API:", JSON.stringify(response.data, null, 2)); // Логируем ответ

    // Извлекаем интервалы из ответа
    if (Array.isArray(response.data)) {
      const appointments = response.data.flatMap(box => box.intervals);
      return appointments;
    } else {
      console.error("Неправильный формат данных от API:", response.data);
      return [];
    }
  } catch (error) {
    console.error("Ошибка при получении записей с API:", error);
    return [];
  }
}

bot.hears("📜 Архив моек", async (ctx) => {
  const today = new Date().toISOString().split('T')[0];
  const appointments = await getAppointmentsFromAPI(ctx.from.id);

  if (appointments.length === 0) {
    return ctx.reply("❌ Записи на сегодня отсутствуют.", { reply_markup: cabinetMenu });
  }

  for (const { id, date, time } of appointments) {
    const formattedDate = formatDate(date);
    const keyboard = new InlineKeyboard().text("🗑 Удалить", `delete_${id}`);
    await ctx.reply(
      `📅 Дата: ${formattedDate}\n⏰ Время: ${time.start}\n⏱ Длительность: ${time.duration} минут`,
      { reply_markup: keyboard }
    );
  }
});

bot.callbackQuery(/delete_(\d+)/, async (ctx) => {
  const appointmentId = ctx.match[1];
  const userId = ctx.from.id;

  try {
    const appointments = await getAppointmentsFromAPI(userId);

    if (!Array.isArray(appointments)) {
      console.error("Ожидался массив записей, получено:", appointments);
      await ctx.answerCallbackQuery("❌ Ошибка при получении записей.");
      return;
    }

    const appointment = appointments.find(app => app.id === appointmentId);

    if (!appointment) {
      await ctx.answerCallbackQuery("❌ Запись не найдена.");
      return;
    }

    const formattedDate = formatDate(appointment.date);

    await cancelReservation(appointment.date, appointment.time.start, appointment.time.duration, userId);

    await ctx.answerCallbackQuery("✅ Запись удалена.");
    await ctx.editMessageText(
      `🚗 Запись удалена:\n\n` +
      `📅 Дата: ${formattedDate}\n` +
      `⏰ Время: ${appointment.time.start}\n` +
      `⏱ Длительность: ${appointment.time.duration} минут`
    );
  } catch (error) {
    console.error("Ошибка удаления:", error);
    await ctx.answerCallbackQuery("❌ Ошибка при удалении записи.");
  }
});

async function fetchSchedule(date, box = 1) {
  try {
    const response = await axios.get(API_URL + 'get.php', { params: { dates: `[${date}]`, box } });
    return response.data[0]?.intervals || [];
  } catch (error) {
    console.error("Ошибка при запросе расписания:", error);
    return [];
  }
}

async function setReservation(data, box = 1) {
  console.log('запущено!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', data)
  try {
    const response = await axios({
      method: 'post',
      url: API_URL + 'set.php?box=' + box,
      headers: {
      'Content-Type': 'application/json'
        },
      data: data
    });
    
    console.log(response.data);
    return response;
  } catch (error) {
    console.error("Ошибка бронирования:", error);
    return [];
  }
}


async function createTimeButtons(date, box) {
  const intervals = await fetchSchedule(date, box);
  const keyboard = new InlineKeyboard();

  const busySlots = new Set();

  intervals.forEach(({ time }) => {
    if (time?.start && time?.duration) {
      const [startHour, startMinute] = time.start.split(":").map(Number);
      const duration = parseInt(time.duration, 10);
      const startTotal = startHour * 60 + startMinute;
      const endTotal = startTotal + duration;

      for (let minutes = startTotal; minutes < endTotal; minutes += 15) {
        const slotStart = Math.floor(minutes / 60) * 60 + (Math.floor(minutes % 60 / 15) * 15);
        const hours = Math.floor(slotStart / 60);
        const mins = slotStart % 60;
        const slot = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        busySlots.add(slot);
      }
    }
  });

  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      if (busySlots.has(time)) {
        keyboard.text(`⛔️ ${time}`, `busy_${time}`);
      } else {
        keyboard.text(`✅ ${time}`, `time_${date}_${time}`);
      }
    }
    keyboard.row();
  }

  keyboard.row().text("🔙 Назад", "back_to_dates");
  return keyboard;
}

async function createDateButtons() {
  const today = new Date();
  const keyboard = new InlineKeyboard();

  keyboard.text("Сегодня", `date_${today.toISOString().split('T')[0]}`);
  keyboard.text("Завтра", `date_${new Date(today.setDate(today.getDate() + 1)).toISOString().split('T')[0]}`);
  keyboard.row();

  keyboard.text("01.04.2024", "date_2024-04-01");
  keyboard.row();

  keyboard.text("📅 Календарь", "open_calendar");
  keyboard.row();

  keyboard.text("🔙 Вернуться в меню", "back_to_main_menu");

  return keyboard;
}

async function createCalendarButtons() {
  const today = new Date();
  const keyboard = new InlineKeyboard();

  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    keyboard.text(date.toLocaleDateString('ru-RU'), `date_${date.toISOString().split('T')[0]}`);
    if ((i + 1) % 5 === 0) keyboard.row();
  }

  keyboard.row().text("🔙 Назад", "back_to_dates");

  return keyboard;
}

async function createDurationButtons() {
  return new InlineKeyboard()
    .text("15 мин", "duration_15")
    .text("30 мин", "duration_30")
    .text("45 мин", "duration_45")
    .text("60 мин", "duration_60")
    .row()
    .text("🔙 Назад", "back_to_time");
}

async function createConfirmationButtons() {
  return new InlineKeyboard()
    .text("✅ Подтвердить", "confirm_appointment")
    .text("❌ Отменить", "cancel_appointment")
    .row()
    .text("🔙 Назад", "back_to_duration");
}

bot.command("start", async (ctx) => {
  const userId = ctx.from.id;
  if (await isAuthorized(userId)) {
    await ctx.reply("Добро пожаловать обратно! 🚗", { reply_markup: mainMenu });
  } else {
    await ctx.reply("Для начала работы пройдите авторизацию:", { reply_markup: authKeyboard });
  }
});

bot.hears("📅 Записаться на мойку", async (ctx) => {
  await ctx.reply("Выберите дату:", {
    reply_markup: {
      remove_keyboard: true
    }
  });

  const keyboard = await createDateButtons();
  await ctx.reply("Выберите дату для записи на мойку:", { reply_markup: keyboard });
});

bot.hears("👤 Личный кабинет", async (ctx) => {
  const user = await getUserInfo(ctx.from.id);
  if (!user) return ctx.reply("❌ Авторизуйтесь сначала!", { reply_markup: authKeyboard });

  await ctx.reply(
    `👤 Ваш профиль:\n\n` +
    `🆔 ID: ${user.id}\n` +
    `📱 Телефон: ${user.phone}\n` +
    `📅 Записей: 0`,
    { reply_markup: cabinetMenu }
  );
});

bot.hears("🗑 Удалить все записи на сегодня", async (ctx) => {
  try {
    console.log("Удаление всех записей с ID 4937...");
    await deleteAllAppointmentsForToday(4937);
    await deleteAppointmentsForToday(4937);
    await ctx.reply("✅ Все записи с ID 4937 на сегодня успешно удалены!", { reply_markup: cabinetMenu });
  } catch (error) {
    console.error("Ошибка при удалении записей:", error);
    await ctx.reply(`❌ Произошла ошибка при удалении записей: ${error.message}`, { reply_markup: cabinetMenu });
  }
});


bot.hears("🔙 Вернуться в меню", async (ctx) => {
  await ctx.reply("Вы вернулись в главное меню.", { reply_markup: mainMenu });
});

bot.callbackQuery(/date_(.+)/, async (ctx) => {
  const date = ctx.match[1];
  ctx.session.appointment.date = date;
  const keyboard = await createTimeButtons(date, 1);
  await ctx.editMessageText(`Выберите время для ${date}:`, { reply_markup: keyboard });
});

bot.callbackQuery("open_calendar", async (ctx) => {
  const keyboard = await createCalendarButtons();
  await ctx.editMessageText("Выберите дату из календаря:", { reply_markup: keyboard });
});

bot.callbackQuery(/time_(.+)_(.+)/, async (ctx) => {
  const [_, date, time] = ctx.match;
  ctx.session.appointment.time = time;
  const keyboard = await createDurationButtons();
  await ctx.editMessageText(`Вы выбрали время: ${time}. Выберите длительность:`, { reply_markup: keyboard });
});

bot.callbackQuery(/duration_(\d+)/, async (ctx) => {
  const duration = ctx.match[1];
  ctx.session.appointment.duration = duration;
  const { date, time } = ctx.session.appointment;

  const confirmationKeyboard = await createConfirmationButtons();
  await ctx.editMessageText(
    `Подтвердите запись:\n\n` +
    `📅 Дата: ${date}\n` +
    `⏰ Время: ${time}\n` +
    `⏱ Длительность: ${duration} минут`,
    { reply_markup: confirmationKeyboard }
  );
});

bot.callbackQuery("confirm_appointment", async (ctx) => {
  const { date, time, duration } = ctx.session.appointment;

const reserv = {
  "id": null,
  "date": date,
  "time": {
    "start": time,
    "duration": duration
  },
  "free": false,
  "service": false,
  "person": {
    "id": 4937
  }
}

  try {
    await setReservation(reserv);
    await saveAppointment(ctx.from.id, date, time, duration);
    await ctx.editMessageText(
      `✅ Запись успешно создана!\n\n` +
      `📅 Дата: ${date}\n` +
      `⏰ Время: ${time}\n` +
      `⏱ Длительность: ${duration} минут`
    );
    ctx.session.appointment = {};
    await ctx.reply("Вы вернулись в главное меню.", { reply_markup: mainMenu });
  } catch (error) {
    console.error("Ошибка записи:", error);
    await ctx.reply("❌ Произошла ошибка при создании записи");
  }
});

bot.callbackQuery("cancel_appointment", async (ctx) => {
  ctx.session.appointment = {};
  await ctx.editMessageText("Запись отменена.");
  await ctx.reply("Вы вернулись в главное меню.", { reply_markup: mainMenu });
});

bot.callbackQuery("back_to_dates", async (ctx) => {
  const keyboard = await createDateButtons();
  await ctx.editMessageText("Выберите дату:", { reply_markup: keyboard });
});

bot.callbackQuery("back_to_time", async (ctx) => {
  const { date } = ctx.session.appointment;
  const keyboard = await createTimeButtons(date, 1);
  await ctx.editMessageText(`Выберите время для ${date}:`, { reply_markup: keyboard });
});

bot.callbackQuery("back_to_duration", async (ctx) => {
  const { date, time } = ctx.session.appointment;
  const keyboard = await createDurationButtons();
  await ctx.editMessageText(`Вы выбрали время: ${time}. Выберите длительность:`, { reply_markup: keyboard });
});

bot.callbackQuery("back_to_main_menu", async (ctx) => {
  await ctx.editMessageText("Вы вернулись в главное меню.");
  await ctx.reply("Выберите действие:", { reply_markup: mainMenu });
});

bot.on(":contact", async (ctx) => {
  const contact = ctx.message.contact;
  if (contact.user_id !== ctx.from.id) {
    return ctx.reply("❌ Пожалуйста, отправьте свой собственный контакт");
  }

  try {
    await addUser(ctx.from.id, contact.phone_number);
    await ctx.reply("✅ Авторизация прошла успешно!", { reply_markup: mainMenu });
  } catch (error) {
    await ctx.reply("❌ Этот номер уже зарегистрирован");
  }
});

bot.start();
