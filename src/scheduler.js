const cron = require('node-cron');
const { TZ, CHAT_ID, ADMIN_ID } = require('../config');
const { fetchCombinedNews } = require('./news');
const { askGroq, generateMCQSet, generatePoll } = require('./groq');
const { startReader } = require('./reader');
const { dailyPolls } = require('../data/polls');
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
🗳️  9:00am — Daily Poll
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

// Maps answer letter to 0-indexed option position for Telegram quiz polls.
const ANSWER_INDEX = { A: 0, B: 1, C: 2, D: 3 };

// Sends each MCQ as a native Telegram quiz poll. Returns an array of the
// sent message objects (callers can pull .message_id to stopPoll later).
async function sendMCQPolls(bot, chatId, mcqs) {
  const msgs = [];
  for (const q of mcqs) {
    const msg = await bot.sendPoll(
      chatId,
      `${q.level}  ${q.question}`,
      q.options,
      {
        type: 'quiz',
        correct_option_id: ANSWER_INDEX[q.answer],
        // Telegram caps poll explanations at 200 chars; full breakdown posts at 11am.
        explanation: q.explanation.length <= 200 ? q.explanation : q.explanation.slice(0, 197) + '…',
        is_anonymous: false,
      }
    );
    msgs.push(msg);
  }
  return msgs;
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

async function postNewsUpdate(bot, label) {
  await bot.sendMessage(CHAT_ID, `${label}\n\n_Tap through the latest stories_ 👇`, { parse_mode: 'Markdown' });
  // Timed updates show the newest stories, not the most "significant" ones.
  await startReader(bot, CHAT_ID, { silent: true, sortBy: 'publishedAt' });
}

// ─── SCHEDULER ────────────────────────────────────────────────────

function registerScheduler(bot) {
  const cronOpts = { timezone: TZ };

  // API call budget per day (100 limit on free tier):
  //   8am briefing:        1 (fetchCombinedNews)
  //   9am poll:            1 (fetchCombinedNews — for AI poll context)
  //   10am MCQ:            1 (fetchCombinedNews — for AI quiz context)
  //   6pm evening carousel: 1 (fetchCombinedNews via startReader)
  //   3x reader updates:   1 each = 3 (fetchCombinedNews via startReader — 12pm, 3pm, 8pm)
  //   Total scheduled: ~7/day — leaves ~90 calls for user commands

  // 8:00am SGT — Morning briefing (AI summary only)
  cron.schedule('0 8 * * *', async () => {
    try {
      const allArticles = await fetchCombinedNews(15, 'popularity', 2, false);
      const allNews = allArticles.map(a => a.title).join('\n');
      const summary = await askGroq('Give me a short friendly morning briefing. Simple, clear and easy to understand.', allNews);
      await bot.sendMessage(CHAT_ID, `☀️ *Good Morning! Your Daily Briefing*\n\n${summary}\n\n_BUILT BY MIN_ ⚡`, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Morning briefing error:', err.message);
    }
  }, cronOpts);

  // 9:00am SGT — Daily poll (+ weekly question on Mondays)
  // Tries to generate a fresh poll from today's headlines via Groq;
  // falls back silently to the hardcoded daily poll if Groq is down/slow.
  cron.schedule('0 9 * * *', async () => {
    try {
      const day = new Date().toLocaleString('en-US', { weekday: 'short', timeZone: TZ });
      const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const d = dayMap[day];

      let poll;
      try {
        const articles = await fetchCombinedNews(15, 'popularity', 2, false);
        const headlines = articles.map(a => a.title).join('\n');
        poll = await generatePoll(headlines);
      } catch (genErr) {
        console.error('AI poll generation failed, using fallback:', genErr.message);
        poll = dailyPolls[d];
      }

      await bot.sendPoll(CHAT_ID, poll.question, poll.options, { is_anonymous: false });
    } catch (err) {
      console.error('Daily poll error:', err.message);
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

      await bot.sendMessage(CHAT_ID, '🧠 *Daily Market Quiz!* — 3 questions, answers revealed at 11am ⏰\n\nTap your answer on each one 👇', { parse_mode: 'Markdown' });
      const pollMsgs = await sendMCQPolls(bot, CHAT_ID, mcqState.currentMCQs);
      mcqState.pollMessageIds = pollMsgs.map(m => m.message_id);
    } catch (err) {
      console.error('MCQ error:', err.message);
    }
  }, cronOpts);

  // 11:00am SGT — close polls, guilt trip, then full answer breakdown
  cron.schedule('0 11 * * *', async () => {
    try {
      if (!mcqState.currentMCQs || mcqState.currentMCQs.length === 0) return;
      // Stop each quiz poll — Telegram reveals the correct option to everyone.
      for (const msgId of (mcqState.pollMessageIds || [])) {
        await bot.stopPoll(CHAT_ID, msgId).catch(() => {});
      }
      // Duo-style guilt trip before the answers drop.
      await bot.sendMessage(CHAT_ID, pickGuiltTrip(), { parse_mode: 'MarkdownV2' });
      await postMCQAnswers(bot, CHAT_ID, mcqState.currentMCQs);
    } catch (err) {
      console.error('MCQ answer error:', err.message);
    }
  }, cronOpts);

  // 6:00pm SGT — Evening Top News (in-chat swipeable carousel).
  // Uses the in-chat carousel and the default popularity
  // sort so it leads with the day's most significant stories.
  cron.schedule('0 18 * * *', async () => {
    try {
      await bot.sendMessage(CHAT_ID, '🌆 *Evening Top News* — tap through today\'s top stories 👇', { parse_mode: 'Markdown' });
      await startReader(bot, CHAT_ID, { silent: true });
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
    let mcqs, source;
    try {
      // Same fetch as the 10am cron (aiFilter off, 25 headlines — just need
      // topic material, kept small to stay under Groq's per-minute limit).
      const articles = await fetchCombinedNews(25, 'publishedAt', 2, false);
      const headlines = articles.map(a => a.title).join('\n');
      mcqs = await generateMCQSet(headlines, mcqHistory.recent());
      source = '🤖 AI-generated from today’s headlines';
    } catch (e) {
      console.error('testquiz generation failed, using fallback:', e.message);
      mcqs = fallbackMCQSet();
      source = `⚠️ AI generation failed (${e.response ? 'HTTP ' + e.response.status : e.message}) — showing hardcoded fallback`;
    }
    try {
      await bot.sendMessage(chatId, `🧪 *Test Quiz*\n_${source}_\n\nTap your answer on each poll 👇`, { parse_mode: 'Markdown' });
      const pollMsgs = await sendMCQPolls(bot, chatId, mcqs);
      // Stop immediately so answers show right away in the test flow.
      for (const m of pollMsgs) await bot.stopPoll(chatId, m.message_id).catch(() => {});
      await bot.sendMessage(chatId, pickGuiltTrip(), { parse_mode: 'MarkdownV2' });
      await postMCQAnswers(bot, chatId, mcqs);
    } catch (err) {
      console.error('testquiz post error:', err.message);
      bot.sendMessage(chatId, `😬 Test quiz failed to send: ${err.message}`);
    }
  });

  // News updates at fixed SGT times: 12pm, 3pm, 8pm, 10pm
  cron.schedule('0 12 * * *', () => postNewsUpdate(bot, '🔔 *News Update — 12pm*').catch(e => console.error(e.message)), cronOpts);
  cron.schedule('0 15 * * *', () => postNewsUpdate(bot, '🔔 *News Update — 3pm*').catch(e => console.error(e.message)), cronOpts);
  cron.schedule('0 20 * * *', () => postNewsUpdate(bot, '🔔 *News Update — 8pm*').catch(e => console.error(e.message)), cronOpts);
}

module.exports = { registerScheduler, mainKeyboard, scheduleText };
