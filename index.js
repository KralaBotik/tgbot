require("dotenv").config();
const { Bot, Keyboard, InlineKeyboard } = require("grammy");
const { addUser, isAuthorized, getUserInfo } = require("./database");

const bot = new Bot(process.env.BOT_API_KEY);

const mainMenu = new Keyboard()
  .text("📅 Записаться на мойку")
  .text("📋 Мои записи")
  .row()
  .text("📜 Архив моек")
  .text("👤 Личный кабинет")
  .resized();

const autorKeyboard = new Keyboard()
  .requestContact("📱 Авторизироваться")
  .resized()
  .oneTime();

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
    `<b>👤 Личный кабинет</b>\n\n<b>🆔 ID:</b> ${userInfo.userId}\n<b>📱 Телефон:</b> ${userInfo.phone}`,
    { parse_mode: "HTML" }
  );
});

bot.on("message", async (ctx) => {
  await ctx.reply("Я не понял ваш запрос. Пожалуйста, используйте доступные команды.");
});

bot.start();