const cron = require('node-cron');
const { TZ, CHAT_IDS, ADMIN_ID } = require('../config');
const { fetchCombinedNews } = require('./news');
const { generateBriefing, generateMCQSet } = require('./groq');
const { startReader } = require('./reader');
const { mcqQuestions, mcqState } = require('../data/mcq');
const mcqHistory = require('./mcqHistory');

// ─── KEYBOARD ─────────────────────────────────────────────────────

const mainKeyboard = {
  keyboard: [
    [{ text: '📈 Markets' }, { text: '🌍 World' }],
    [{ text: '💻 Tech' }, { text: '☀️ Briefing' }],
    [{ text: '😎 Mood' }, { text: '🔍 Search' }],
    [{ text: '🌏 Singapore' }, { text: '🇺🇸 US' }, { text: '🇨🇳 China' }],
    [{ text: '📊 Stock' }, { text: '📖 Read' }, { text: '📅 Schedule' }]
  ],
  resize_keyboard: true
};

// ─── SCHEDULE TEXT ────────────────────────────────────────────────

const scheduleText =
`📅 *NOMO NEWS BOT*
*Daily Schedule* 🇸🇬 Singapore Time

━━━━━━━━━━━━━━━━━━━━━
🌅 *MORNING*
━━━━━━━━━━━━━━━━━━━━━
☀️  8:00am — Morning Briefing
🧠 10:00am — Daily MCQ Quiz
✅ 11:00am — MCQ Answer Revealed

━━━━━━━━━━━━━━━━━━━━━
🌆 *AFTERNOON & EVENING*
━━━━━━━━━━━━━━━━━━━━━
📖 12:00pm — News Reader
📖  3:00pm — News Reader
🌆  6:00pm — Evening Top News
📖  8:00pm — News Reader

━━━━━━━━━━━━━━━━━━━━━
_BUILT BY MIN_ ⚡`;

// ─── BROADCAST HELPER ─────────────────────────────────────────────
// Runs a per-chat post function for every configured target chat (private
// group + any public group/channel). Failures are isolated per chat so one
// broken target (bot kicked, chat deleted, etc.) never blocks the others.
async function broadcast(fn) {
  for (const chatId of CHAT_IDS) {
    try {
      await fn(chatId);
    } catch (err) {
      console.error(`Broadcast to ${chatId} failed:`, err.message);
    }
  }
}

// ─── MCQ FALLBACK ─────────────────────────────────────────────────
// Picks one Easy, one Medium and one Hard question from the hardcoded set.
// Rotation is keyed to the calendar day so it advances daily even after a
// restart/redeploy (an in-memory counter would reset and repeat).

function fallbackMCQSet() {
  const dayNum = Math.floor(Date.now() / 86400000); // days since epoch (SGT-ish)
  const pick = (level) => {
    const pool = mcqQuestions.filter(q => q.level === level);
    return pool[dayNum % pool.length];
  };
  return [pick('🟢 Easy'), pick('🟡 Medium'), pick('🔴 Hard')];
}

// ─── MCQ HELPERS (shared by the cron jobs and /testquiz) ──────────

// Sends all 3 MCQs as a single text message.
async function sendMCQText(bot, chatId, mcqs) {
  const body = mcqs.map((q, i) =>
    `${q.level}\n*Q${i + 1}: ${q.question}*\n${q.options.join('\n')}`
  ).join('\n\n');
  const text = `🧠 *Daily Market Quiz!* — 3 Questions\n\n${body}\n\n_Reply with your answers! Revealed at 11am_ ⏰`;
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

// ─── GUILT TRIP (Duo-style) ────────────────────────────────────────

const GUILT_LINES = [
  "⏰ Quiz closed. Answers below. NOMO won't ask how it went.",
  "📊 The quiz is done. The market doesn't care if you skipped it. Neither does NOMO. (We care a little.)",
  "🧠 Answers incoming. For those who tried: respect. For everyone else: the market has no mercy either.",
  "📉 Quiz over. Your portfolio and your quiz score have something in common today — we're not looking.",
  "🤝 No judgement from NOMO. The quiz is closed, the answers are below, and we move on. Together. (Do better tomorrow.)",
  "💼 The quiz wrapped up. Some of you were ready. Some of you were doing literally anything else. NOMO sees all.",
  "📰 Breaking: local quiz goes unanswered. Markets unaffected. Your street cred: pending.",
  "🎯 Quiz closed! The correct answers are below. Your job now is to pretend you knew them all along.",
  "😌 It's fine. The quiz is over. NOMO is not mad. NOMO is just... disappointed. Answers below.",
  "🏦 Fun fact: Warren Buffett would have done the quiz. Just putting that out there. Answers below.",
  "📆 New day, same NOMO. Quiz is done — answers dropping now. No shame, only gains (of knowledge).",
  "🤓 The quiz has closed. Somewhere, a finance bro is already screenshot-ing his score. Be better. Answers below.",
  "🧾 Quiz receipts incoming. If you played — nice. If you didn't — NOMO is logging it as 'market research on human behaviour'.",
  "💡 The answers are in. Think of this as a free masterclass you almost missed. Almost.",
];


function pickGuiltTrip() {
  const today = new Date();
  // Day-keyed rotation so it changes daily but stays consistent across restarts.
  const idx = Math.floor(today.getTime() / 86400000) % GUILT_LINES.length;
  return GUILT_LINES[idx];
}

// Posts the answers: correct answer, plain-language explanation, and a line
// per wrong option (when whyWrong is present). One message if it fits under
// Telegram's 4096-char cap, else one message per question.
async function postMCQAnswers(bot, chatId, mcqs) {
  const blocks = mcqs.map((q, i) => {
    let block = `${q.level}\n*Q${i + 1}: ${q.question}*\n*Correct Answer: ${q.answer}*\n📖 ${q.explanation}`;
    if (q.whyWrong) {
      const wrongLines = ['A', 'B', 'C', 'D']
        .filter(l => l !== q.answer && q.whyWrong[l])
        .map(l => `❌ ${l}: ${q.whyWrong[l]}`)
        .join('\n');
      if (wrongLines) block += `\n\n${wrongLines}`;
    }
    return block;
  });
  const full = `✅ *MCQ Answers Revealed!*\n\n${blocks.join('\n\n')}\n\n_BUILT BY MIN_ ⚡`;
  if (full.length <= 4096) {
    await bot.sendMessage(chatId, full, { parse_mode: 'Markdown' });
  } else {
    await bot.sendMessage(chatId, '✅ *MCQ Answers Revealed!*', { parse_mode: 'Markdown' });
    for (const block of blocks) await bot.sendMessage(chatId, block, { parse_mode: 'Markdown' });
    await bot.sendMessage(chatId, '_BUILT BY MIN_ ⚡', { parse_mode: 'Markdown' });
  }
}

// ─── NEWS UPDATE HELPER (posts the swipeable story reader) ────────

async function postNewsUpdate(bot) {
  // Fetch once and share the same articles across all target chats so
  // broadcasting doesn't multiply NewsAPI/Groq calls per chat.
  // Timed updates show the newest stories, not the most "significant" ones.
  const articles = await fetchCombinedNews(15, 'publishedAt');
  await broadcast(async (chatId) => {
    await startReader(bot, chatId, { silent: true, sortBy: 'publishedAt', articles });
  });
}

// ─── SCHEDULER ────────────────────────────────────────────────────

function registerScheduler(bot) {
  const cronOpts = { timezone: TZ };

  // API call budget per day (100 limit on free tier):
  //   8am briefing:        1 (fetchCombinedNews)
  //   10am MCQ:            1 (fetchCombinedNews — for AI quiz context)
  //   6pm evening carousel: 1 (fetchCombinedNews via startReader)
  //   3x reader updates:   1 each = 3 (fetchCombinedNews via startReader — 12pm, 3pm, 8pm)
  //   Total scheduled: ~6/day — leaves ~90 calls for user commands

  // 8:00am SGT — Morning briefing (AI summary only)
  cron.schedule('0 8 * * *', async () => {
    try {
      const allArticles = await fetchCombinedNews(15, 'popularity', 2, false);
      const allNews = allArticles.map(a => a.title).join('\n');
      // No headlines to summarise (empty feed / quota / all filtered) — skip the
      // post rather than ask the model with no input, which produced the
      // "I don't have live info" apology.
      if (!allNews.trim()) {
        console.error('Morning briefing skipped: no news available');
        return;
      }
      const summary = await generateBriefing(allNews);
      await broadcast((chatId) => bot.sendMessage(chatId, `☀️ *Good Morning! Your Daily Briefing*\n\n${summary}\n\n_BUILT BY MIN_ ⚡`, { parse_mode: 'Markdown' }));
    } catch (err) {
      console.error('Morning briefing error:', err.message);
    }
  }, cronOpts);

  // 10:00am SGT — MCQ quiz (3 questions: Easy, Medium, Hard)
  // Tries to generate a fresh set from today's headlines via Groq;
  // falls back silently to hardcoded questions if Groq is down/slow.
  cron.schedule('0 10 * * *', async () => {
    try {
      try {
        // Pull a pool of the newest stories (still 1 NewsAPI call) so there's
        // fresh material to pick from, and hand Groq the recent questions to
        // steer it off repeated topics. 25 (not 50) keeps the prompt small
        // enough to stay under Groq's per-minute token cap. Skip the AI
        // relevance filter (aiFilter=false) — we only need raw headlines, and
        // avoiding that extra Groq call keeps us clear of the rate limit.
        const articles = await fetchCombinedNews(25, 'publishedAt', 2, false);
        const headlines = articles.map(a => a.title).join('\n');
        mcqState.currentMCQs = await generateMCQSet(headlines, mcqHistory.recent());
        mcqHistory.record(mcqState.currentMCQs);
      } catch (genErr) {
        console.error('AI MCQ generation failed, using fallback:', genErr.message);
        mcqState.currentMCQs = fallbackMCQSet();
      }

      await broadcast((chatId) => sendMCQText(bot, chatId, mcqState.currentMCQs));
    } catch (err) {
      console.error('MCQ error:', err.message);
    }
  }, cronOpts);

  // 11:00am SGT — guilt trip, then full answer breakdown
  cron.schedule('0 11 * * *', async () => {
    try {
      if (!mcqState.currentMCQs || mcqState.currentMCQs.length === 0) return;
      // Duo-style guilt trip before the answers drop. Sent as plain text — the
      // lines have no formatting, and MarkdownV2 would reject their unescaped
      // '.', '(', ')', '-', '!' characters (400 "can't parse entities").
      await broadcast(async (chatId) => {
        await bot.sendMessage(chatId, pickGuiltTrip());
        await postMCQAnswers(bot, chatId, mcqState.currentMCQs);
      });
    } catch (err) {
      console.error('MCQ answer error:', err.message);
    }
  }, cronOpts);

  // 6:00pm SGT — Evening Top News (in-chat swipeable carousel).
  // Uses the in-chat carousel and the default popularity
  // sort so it leads with the day's most significant stories.
  cron.schedule('0 18 * * *', async () => {
    try {
      // Fetch once (default popularity sort) and share across all target chats.
      const articles = await fetchCombinedNews(10, 'popularity');
      await broadcast(async (chatId) => {
        await startReader(bot, chatId, { silent: true, articles });
      });
    } catch (err) {
      console.error('Evening news error:', err.message);
    }
  }, cronOpts);

  // /testquiz — on-demand quiz for testing. Runs the REAL 10am generation
  // path and reports whether it came from the AI or the hardcoded fallback
  // (and why it fell back), then posts the questions and answers to the chat
  // where it was run. Does NOT touch mcqState or the recent-question history,
  // so it never disturbs the real daily quiz. Admin-gated when ADMIN_ID is set.
  bot.onText(/^\/testquiz(?:@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    if (ADMIN_ID && String(msg.from && msg.from.id) !== String(ADMIN_ID)) {
      return bot.sendMessage(chatId, '🔒 Only the admin can run /testquiz.');
    }
    bot.sendChatAction(chatId, 'typing').catch(() => {});
    let mcqs;
    try {
      // Same fetch as the 10am cron (aiFilter off, 25 headlines — just need
      // topic material, kept small to stay under Groq's per-minute limit).
      const articles = await fetchCombinedNews(25, 'publishedAt', 2, false);
      const headlines = articles.map(a => a.title).join('\n');
      mcqs = await generateMCQSet(headlines, mcqHistory.recent());
    } catch (e) {
      console.error('testquiz generation failed, using fallback:', e.message);
      mcqs = fallbackMCQSet();
    }
    try {
      await sendMCQText(bot, chatId, mcqs);
      await bot.sendMessage(chatId, pickGuiltTrip());
      await postMCQAnswers(bot, chatId, mcqs);
    } catch (err) {
      console.error('testquiz post error:', err.message);
      bot.sendMessage(chatId, `😬 Test quiz failed to send: ${err.message}`);
    }
  });

  // News updates at fixed SGT times: 12pm, 3pm, 8pm, 10pm
  cron.schedule('0 12 * * *', () => postNewsUpdate(bot).catch(e => console.error(e.message)), cronOpts);
  cron.schedule('0 15 * * *', () => postNewsUpdate(bot).catch(e => console.error(e.message)), cronOpts);
  cron.schedule('0 20 * * *', () => postNewsUpdate(bot).catch(e => console.error(e.message)), cronOpts);
}

module.exports = { registerScheduler, mainKeyboard, scheduleText };
