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
  .row()
  .text("💲 Цены")
  .text("⚖️ Правила")
  .resized();


const authKeyboard = new Keyboard()
  .requestContact("📱 Авторизироваться")
  .resized()
  .oneTime();

const cabinetMenu = new Keyboard()
 // .text("📜 Архив моек")
  .text("📋 Мои текущие записи")
  .row()
  .text("🔙 Вернуться в меню")
  .resized();

const API_URL = "https://molot.papillon.ru/rty/wht/reserv/";

bot.hears("⚖️ Правила", async(ctx) => {
  await ctx.reply("- зарезервировать время мойки автомобиля (см. Инструкция по резервированию времени на автомойке) \n" +
"- начало и окончание автомойки определяется идентификацией по лицу и нажатием на мониторе кнопок «НАЧАТЬ МОЙКУ» и «ЗАКОНЧИТЬ МОЙКУ». В начале мойки свет, в выбранном при резервировании посту, автоматически включается, при окончании мойки свет автоматически выключается. \n" +
"- Непосредственно мойка автомобиля производиться в строгом соответствии с инструктажем. В процессе мойки шланги от пистолетов и леек не затягивать в петлю и не перекручивать, не бросать пистолеты и лейки на пол, вставлять их только в специальные хомуты на стенах. \n" +
"- после завершения мойки автомобиля выехать из бокса. Смыть всю грязь с пола и стен, помыть ведра(если использовали), расправить и развесить шланги. Закрыть ворота, шторы. \n" +
"- когда, все описанные выше действия сделаны, пользователь обязан покинуть территорию подземного гаража. Любые действия, протирка стекол, укладка ковриков, просушка и т. д. разрешены только в помещении автомоек. Вне территории помывочных боксов разрешена только подкачка колес (5 мин). \n" +
"Правильный порядок действий в автомойке: \n" +
"- заезд в подземный гараж \n" +
"- включение «НАЧАТЬ МОЙКУ» \n" +
"- заезд в соответствующий резервированию пост \n" +
"- мойка транспортного средства \n" +
"- выезд из бокса \n" +
"- мойка бокса \n" +
"- выключение «ЗАКОНЧИТЬ МОЙКУ» \n " +
"- выезд из подземного гаража. \n" +
"Нахождение транспортного средства в помывочном боксе без отметки «НАЧАТЬ МОЙКУ» запрещено. \n" +
"Нарушителям ПРАВИЛ администрация может отказать в получении услуги без объяснения причин.", {reply_markup: mainMenu})
})

bot.hears("💲 Цены", async (ctx) => {
  await ctx.reply("В будние: \n" +
"с 00:00 до 07:00 - 1 руб/ мин \n" +
"с 07:00 до 08:00 - 8 руб/ мин \n" +
"с 08:00 до 17:00 - 4 руб/ мин \n" +
"с 17:00 до 19:00 - 8 руб/ мин \n" +
"с 19:00 до 24:00 - 4 руб/ мин \n" +
"в выходные и праздничные дни: \n" +
"с 00:00 до 07:00 - 1 руб/ мин \n" +
"с 07:00 до 24:00 - 4 руб/ мин \n" +
"За пользование агрегатами: \n" +
"АВД(керхер) — 8 руб/ мин. \n" +
"пена — 26 руб/ мин", { reply_markup: mainMenu });
});

async function getAppointmentsForArchive(userId) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  try {
    const formattedYesterday = yesterday.toISOString().split('T')[0];
    const formattedThirtyDaysAgo = thirtyDaysAgo.toISOString().split('T')[0];

    const response = await axios.get(`${API_URL}get.php`, {
      params: {
        user_id: userId,
        dates: `[${formattedThirtyDaysAgo},${formattedYesterday}]`
      }
    });

    if (Array.isArray(response.data)) {
      const appointments = response.data.flatMap(box => box.intervals);
      return appointments;
    } else {
      console.error("Неправильный формат данных от API:", response.data);
      return [];
    }
  } catch (error) {
    console.error("Ошибка при получении записей для архива:", error);
    return [];
  }
}

bot.hears("📜 Архив моек", async (ctx) => {
  const userId = ctx.from.id;
  const appointments = await getAppointmentsForArchive(userId);

  if (appointments.length === 0) {
    return ctx.reply("❌ Записи за последние 30 дней отсутствуют.", { reply_markup: cabinetMenu });
  }

  let message = "📜 Архив моек за последние 30 дней:\n\n";
  appointments.forEach(({ id, date, time }) => {
    const formattedDate = formatDate(date);
    message += `📅 Дата: ${formattedDate}\n⏰ Время: ${time.start}\n⏱ Длительность: ${time.duration} минут\n Цена:\n\n`;
  });

  await ctx.reply(message, { reply_markup: cabinetMenu });
});

function formatDate(dateString) {
  const [year, month, day] = dateString.split('-');
  return `${day}.${month}.${year}`;
}

async function cancelReservation(date, time, duration, reservId, userId, boxId = 1) {
  const url = `${API_URL}set.php?box=${boxId}`;
  console.log('!начато удаление', );
  const data = {
    id: reservId,
    date: date,
    time: {
      start: time,
      duration: duration
    },
    free: true,
    service: false,
    person: {
      id: userId
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

async function getAppointmentsFromAPI(userId, daysAhead = 30) {
  try {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + daysAhead);
    
    const startDateStr = today.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const response = await axios.get(`${API_URL}get.php`, {
      params: {
        user_id: userId,
        dates: `[${startDateStr},${endDateStr}]`
      }
    });

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

bot.hears("📋 Мои текущие записи", async (ctx) => {
  const appointments = await getAppointmentsFromAPI(ctx.from.id, 30);

  if (appointments.length === 0) {
    return ctx.reply("❌ У вас нет записей на ближайшие 30 дней.", { reply_markup: cabinetMenu });
  }

  let message = "📋 Ваши записи на ближайшие 30 дней:\n\n";
  appointments.forEach(({ id, date, time }) => {
    const formattedDate = formatDate(date);
    message += `📅 Дата: ${formattedDate}\n⏰ Время: ${time.start}\n⏱ Длительность: ${time.duration} минут\n\n`;
  });

  const keyboard = new InlineKeyboard().text("🗑 Удалить запись", "delete_appointment");
  await ctx.reply(message, { reply_markup: keyboard });
});

bot.callbackQuery("delete_appointment", async (ctx) => {
  const userId = ctx.from.id;
  const appointments = await getAppointmentsFromAPI(userId, 30);

  if (appointments.length === 0) {
    return ctx.answerCallbackQuery("❌ Записи для удаления отсутствуют.");
  }

  const keyboard = new InlineKeyboard();
  appointments.forEach(({ id, date, time }) => {
    const formattedTime = time.start;
    keyboard.text(`❌ ${formattedTime}`, `delete_${id}`).row();
  });

  await ctx.editMessageText("Выберите запись для удаления:", { reply_markup: keyboard });
});

bot.callbackQuery(/^delete_(\d+)/, async (ctx) => {
  const appointmentId = ctx.match[1];
  const userId = ctx.from.id;

  try {
    const appointments = await getAppointmentsFromAPI(userId, 30);
    const appointment = appointments.find(app => app.id === appointmentId);

    if (!appointment) {
      return ctx.answerCallbackQuery("❌ Запись не найдена.");
    }

    const formattedDate = formatDate(appointment.date);

    const confirmationMessage = `Вы уверены, что хотите удалить запись?\n\n` +
      `📅 Дата: ${formattedDate}\n` +
      `⏰ Время: ${appointment.time.start}\n` +
      `⏱ Длительность: ${appointment.time.duration} минут`;

    const confirmationKeyboard = new InlineKeyboard()
      .text("✅ Подтвердить", `confirm_delete_${appointmentId}`)
      .text("❌ Отменить", "cancel_delete");

    await ctx.editMessageText(confirmationMessage, { reply_markup: confirmationKeyboard });
  } catch (error) {
    console.error("Ошибка удаления:", error);
    await ctx.answerCallbackQuery("❌ !!!!!!!Ошибка при удалении записи.");
  }
});

async function fetchSchedule(date, box = 1) {
  try {
    const response = await axios.get(API_URL + 'get.php', { params: { dates: `[${date}]`, box } });
    return response.data[0]?.intervals || [];
  } catch (error) {
    console.error("Ошибка при получении расписания:", error);
    return [];
  }
}

bot.callbackQuery(/^confirm_delete_(\d+)/, async (ctx) => {
  console.log(ctx);
  const appointmentId = ctx.match[1];
  const userId = ctx.from.id;
  console.log('delete confirmed' ,appointmentId)
  try {
    const appointments = await getAppointmentsFromAPI(userId, 30);
    const appointment = appointments.find(app => app.id === appointmentId);
console.log('dsadasdasdasoooooooooooo' ,appointments)
    if (!appointment) {
      return ctx.answerCallbackQuery("❌ Запись не найдена.");
    }

    await cancelReservation(
      appointment.date,
      appointment.time.start,
      appointment.time.duration,
      appointment.id,
      appointment.person.id
    );

    await ctx.editMessageText(
      `✅ Запись успешно удалена:\n\n` +
      `📅 Дата: ${formatDate(appointment.date)}\n` +
      `⏰ Время: ${appointment.time.start}\n` +
      `⏱ Длительность: ${appointment.time.duration} минут`
    );
  } catch (error) {
    console.error("Ошибка удаления:", error);
    await ctx.answerCallbackQuery("❌ Ошибка при удалении записи.");
}
});

async function setReservation(data, box = 1) {
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
  const prevDay = new Date(date);
  prevDay.setDate(prevDay.getDate() - 1);
  const prevDayStr = prevDay.toISOString().split('T')[0];

  const [intervalsToday, intervalsPrevDay] = await Promise.all([
    fetchSchedule(date, box),
    fetchSchedule(prevDayStr, box)
  ]);

  const busySlots = new Set();
  const today = new Date().toISOString().split('T')[0];
  const isToday = date === today;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  intervalsPrevDay.forEach(({ time }) => {
    if (time?.start && time?.duration) {
      const [startHour, startMinute] = time.start.split(":").map(Number);
      const duration = parseInt(time.duration, 10);
      const startTotal = startHour * 60 + startMinute;
      const endTotal = startTotal + duration;

      if (endTotal > 24 * 60) {
        const overlapMinutes = endTotal - 24 * 60;
        
        for (let minutes = 0; minutes < overlapMinutes; minutes += 15) {
          const hours = Math.floor(minutes / 60);
          const mins = minutes % 60;
          const slot = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
          busySlots.add(slot);
        }
      }
    }
  });

  intervalsToday.forEach(({ time }) => {
    if (time?.start && time?.duration) {
      const [startHour, startMinute] = time.start.split(":").map(Number);
      const duration = parseInt(time.duration, 10);
      const startTotal = startHour * 60 + startMinute;
      const endTotal = startTotal + duration;

      for (let minutes = startTotal; minutes < endTotal; minutes += 15) {
        const slotStart = Math.floor(minutes / 60) * 60 + (Math.floor(minutes % 60 / 15) * 15);
        if (slotStart >= 24 * 60) break;
        
        const hours = Math.floor(slotStart / 60);
        const mins = slotStart % 60;
        const slot = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        busySlots.add(slot);
      }
    }
  });

  const keyboard = new InlineKeyboard();
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const timeSlot = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const slotMinutes = hour * 60 + minute;
      const isPast = isToday && slotMinutes < currentMinutes;
      
      if (busySlots.has(timeSlot) || isPast) {
        keyboard.text(`⛔️ ${timeSlot}`, `busy_${timeSlot}`);
      } else {
        keyboard.text(`✅ ${timeSlot}`, `time_${date}_${timeSlot}`);
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
    const dayMonth = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    keyboard.text(dayMonth, `date_${date.toISOString().split('T')[0]}`);
    if ((i + 1) % 5 === 0) keyboard.row();
  }

  keyboard.row().text("🔙 Назад", "back_to_dates");

  return keyboard;
}

async function getAvailableDurations(date, time, box = 1) {
  const intervals = await fetchSchedule(date, box);
  const [selectedHour, selectedMinute] = time.split(":").map(Number);
  const selectedTimeInMinutes = selectedHour * 60 + selectedMinute;

  const availableDurations = [15, 30, 45, 60];

  const validDurations = availableDurations.filter(duration => {
    const endTimeInMinutes = selectedTimeInMinutes + duration;

    const isAvailable = intervals.every(interval => {
      const [startHour, startMinute] = interval.time.start.split(":").map(Number);
      const startTimeInMinutes = startHour * 60 + startMinute;
      const intervalDuration = parseInt(interval.time.duration);
      const endTimeInMinutesInterval = startTimeInMinutes + intervalDuration;

      return !(
        (selectedTimeInMinutes < endTimeInMinutesInterval) &&
        (endTimeInMinutes > startTimeInMinutes)
      );
    });
    return isAvailable;
  });
  return validDurations;
}

async function createDurationButtons(date, time) {
  const availableDurations = await getAvailableDurations(date, time);
  const keyboard = new InlineKeyboard();

  if (availableDurations.length === 0) {
    console.log("Нет доступных длительностей для данного времени");
  }

  availableDurations.forEach(duration => {
    keyboard.text(`${duration} мин`, `duration_${duration}`);
  });

  keyboard.row().text("🔙 Назад", "back_to_time");

  return keyboard;
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
  const keyboard = await createDateButtons();
  await ctx.reply("Выберите дату из календаря:", { reply_markup: keyboard });
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
  const keyboard = await createDurationButtons(date, time);
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
  if (!date) {
    await ctx.editMessageText("❌ Ошибка: дата не найдена. Выберите дату снова.");
    const keyboard = await createDateButtons();
    return await ctx.reply("Выберите дату для записи на мойку:", { reply_markup: keyboard });
  }
  const keyboard = await createTimeButtons(date, 1);
  await ctx.editMessageText(`Выберите время для ${date}:`, { reply_markup: keyboard });
});

bot.callbackQuery("back_to_duration", async (ctx) => {
  const { date, time } = ctx.session.appointment;
  if (!date || !time) {
    await ctx.editMessageText("❌ Ошибка: данные не найдены. Начните с выбора даты.");
    const keyboard = await createDateButtons();
    return await ctx.reply("Выберите дату для записи на мойку:", { reply_markup: keyboard });
  }

  const keyboard = await createDurationButtons(date, time);
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
