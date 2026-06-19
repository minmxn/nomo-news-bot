require('dotenv').config();

const TZ = 'Asia/Singapore';
const BOT_USERNAME = process.env.BOT_USERNAME || 'nomogh_bot';
const CHAT_ID = process.env.CHAT_ID;
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

module.exports = { TZ, BOT_USERNAME, CHAT_ID, NEWS_API_KEY, GROQ_API_KEY, TELEGRAM_TOKEN };
