require('dotenv').config();

const TZ = 'Asia/Singapore';
const BOT_USERNAME = process.env.BOT_USERNAME || 'nomogh_bot';
const CHAT_ID = process.env.CHAT_ID;
// Scheduled posts can fan out to multiple chats (e.g. a private group + a
// public channel). Set CHAT_ID to a comma-separated list. A single id still
// works unchanged. CHAT_IDS is the parsed, trimmed, de-duplicated array.
const CHAT_IDS = (CHAT_ID || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .filter((v, i, a) => a.indexOf(v) === i);
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Fail fast with a clear message if anything required is missing, instead of
// crashing later with a cryptic error mid-request.
//   required — the bot cannot start without these
//   recommended — the bot starts but some features are degraded
const REQUIRED = {
  TELEGRAM_TOKEN: 'Bot auth token from @BotFather — without it the bot cannot connect to Telegram.',
  NEWS_API_KEY: 'newsapi.org API key — without it no news can be fetched.',
};
const RECOMMENDED = {
  GNEWS_API_KEY: 'GNews API key — the primary (real-time) news source. Without it the bot falls back to NewsAPI (free tier ~24h delayed).',
  GROQ_API_KEY: 'Groq API key — without it AI briefings, summaries, polls and quizzes are skipped.',
  CHAT_ID: 'Target chat/channel id — without it scheduled posts have nowhere to go.',
  TAVILY_API_KEY: 'Tavily search key — without it the free-text Q&A can\'t fetch live web info and will only answer from (stale) model knowledge.',
};

const missingRequired = Object.keys(REQUIRED).filter(k => !process.env[k]);
const missingRecommended = Object.keys(RECOMMENDED).filter(k => !process.env[k]);

if (missingRecommended.length) {
  console.warn('⚠️  Missing recommended environment variables (some features will be degraded):');
  for (const k of missingRecommended) console.warn(`   - ${k}: ${RECOMMENDED[k]}`);
}

if (missingRequired.length) {
  console.error('❌ Cannot start — missing required environment variables:');
  for (const k of missingRequired) console.error(`   - ${k}: ${REQUIRED[k]}`);
  console.error('\nSet them in your .env file (local) or the host environment, then restart.');
  process.exit(1);
}

module.exports = { TZ, BOT_USERNAME, CHAT_ID, CHAT_IDS, NEWS_API_KEY, GNEWS_API_KEY, GROQ_API_KEY, TELEGRAM_TOKEN, ADMIN_ID, TAVILY_API_KEY };
