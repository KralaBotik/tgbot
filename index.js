require("dotenv").config();
const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const axios = require("axios");
const { addUser, isAuthorized, getUserInfo } = require("./database");

const bot = new Bot(process.env.BOT_API_KEY);

const mainMenu = new Keyboard()
  .text("📅 Записаться на мойку")
  .text("👤 Личный кабинет")
  .resized();

const autorKeyboard = new Keyboard()
  .requestContact("📱 Авторизироваться")
  .resized()
  .oneTime();

const cabinetMenu = new Keyboard()
  .text("📜 Архив моек")
  .text("📋 Мои текущие записи")
  .row()
  .text("🔙 Вернуться в меню")
  .resized();

const API_URL = "https://molot.papillon.ru/rty/wht/reserv/get.php";

async function fetchSchedule(date, box) {
  try {
    const response = await axios.get(API_URL, {
      params: { dates: `[${date}]`, box },
    });
    return response.data[0]?.intervals || [];
  } catch (error) {
    console.error("Ошибка при запросе API:", error);
    return [];
  }
}
async function createTimeButtons(date, box, step = 15) {
  const intervals = await fetchSchedule(date, box);

  const reservedSlots = intervals
    .filter((interval) => interval.time?.start && interval.time?.duration)
    .map((interval) => {
      const [startH, startM] = interval.time.start.split(":").map(Number);
      const startMins = startH * 60 + startM;
      const duration = parseInt(interval.time.duration, 10);
      return {
        startMins,
        endMins: startMins + duration,
      };
    });

  const keyboard = new InlineKeyboard();
  let [hours, minutes] = [0, 0];

  while (hours < 24) {
    const currentStartMins = hours * 60 + minutes;
    const currentEndMins = currentStartMins + step;

    const isReserved = reservedSlots.some(
      (slot) =>
        (currentStartMins >= slot.startMins && currentStartMins < slot.endMins) ||
        (currentEndMins > slot.startMins && currentEndMins <= slot.endMins) ||
        (currentStartMins <= slot.startMins && currentEndMins >= slot.endMins)
    );

    const timeLabel = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    if (isReserved) {
      keyboard.text("Занято", `busy_${timeLabel}`);
    } else {
      keyboard.text(timeLabel, `time_${timeLabel}`);
    }

    minutes += step;
    if (minutes >= 60) {
      minutes -= 60;
      hours += 1;
    }

    if (hours < 24 && minutes === 0) keyboard.row();
  }

  return keyboard;
}

bot.hears("📅 Записаться на мойку", async (ctx) => {
  const date = "2024-04-01";
  const box = 1;

  const keyboard = await createTimeButtons(date, box);

  await ctx.reply("Выберите время для записи:", {
    reply_markup: keyboard,
  });
});

bot.callbackQuery(/time_(.+)/, async (ctx) => {
  const selectedTime = ctx.match[1];

  const durationKeyboard = new InlineKeyboard()
    .text("15 мин", `duration_15`)
    .text("30 мин", `duration_30`)
    .text("45 мин", `duration_45`)
    .text("60 мин", `duration_60`);

  await ctx.reply(`Вы выбрали время: ${selectedTime}. Выберите длительность:`, {
    reply_markup: durationKeyboard,
  });
});

bot.command("start", async (ctx) => {
  const userId = ctx.from.id;

  if (await isAuthorized(userId)) {
    return ctx.reply("✅ Ты уже авторизован!", { reply_markup: mainMenu });
  }

  await ctx.reply(
    "Привет! Я бот автомойки Папилон. Пожалуйста, авторизируйся, отправив свой контакт.",
    { reply_markup: autorKeyboard }
  );
});

bot.on(":contact", async (ctx) => {
  const contact = ctx.message.contact;
  const userId = ctx.from.id;

  if (contact.user_id !== userId) {
    return ctx.reply("🚫 Ты должен отправить свой контакт!");
  }

  try {
    await addUser(userId, contact.phone_number);
    ctx.reply("✅ Авторизация прошла успешно!", { reply_markup: mainMenu });
  } catch (err) {
    ctx.reply("🚫 Ты уже зарегистрирован.", { reply_markup: mainMenu });
  }
});

bot.hears("👤 Личный кабинет", async (ctx) => {
  const userId = ctx.from.id;

  const userInfo = await getUserInfo(userId);
  if (!userInfo) {
    return ctx.reply("🚫 Ты не авторизован! Пожалуйста, отправь свой контакт.", {
      reply_markup: autorKeyboard,
    });
  }

  await ctx.reply(
    `<b>👤 Личный кабинет</b>\n\n` +
      `<b>🆔 ID:</b> ${userInfo.Id}\n` +
      `<b>🔑 UserID:</b> ${userInfo.user_id}\n` +
      `<b>📱 Телефон:</b> ${userInfo.phone}`,
    {
      parse_mode: "HTML",
      reply_markup: cabinetMenu,
    }
  );
});

bot.hears("🔙 Вернуться в меню", async (ctx) => {
  await ctx.reply("Вы вернулись в главное меню.", { reply_markup: mainMenu });
});

bot.catch((err) => {
  console.error("Ошибка в боте:", err);
});

bot.start();
