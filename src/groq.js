const axios = require('axios');
const { GROQ_API_KEY } = require('../config');

// Groq model used for every AI feature. gpt-oss-120b is Groq's recommended
// replacement for llama-3.3-70b-versatile (deprecated 2026-08-16). Change
// this one constant to swap models everywhere.
const MODEL = 'openai/gpt-oss-120b';

// gpt-oss is a reasoning model: by default it spends hundreds of "thinking"
// tokens before answering, which adds latency, cost and (worse) can blow the
// max_tokens budget so the JSON answer is truncated. Our tasks (summaries,
// quizzes, polls, news Q&A) don't need deep reasoning, so keep it low.
const REASONING_EFFORT = 'low';

// Shared persona for free-text Q&A.
// The formatting rules matter: replies are sent in a Telegram chat, which
// does NOT support Markdown tables, headings (#) or HTML/<br> — those render
// as raw pipes and tags. Keep the model to what Telegram can display.
const PERSONA = `You are NOMO, a friendly, clear-headed financial and world-news analyst built by MIN. Think knowledgeable friend who reads the markets all day and explains them simply — warm and approachable, never corporate.

USING LIVE INFO — your own training knowledge is OUT OF DATE, especially on prices, products, versions and recent events. When the user message includes a "LIVE WEB RESULTS" block, treat it as today's truth and base every fact, number, price, date and name on it; if the results mention different dates or versions, ALWAYS go with the most recent. If instead you see "NO LIVE WEB RESULTS FOUND", or the results don't actually cover the question, and the question is about anything current, recent, niche or specific, do NOT answer from memory — say plainly you couldn't confirm the latest. Only answer from your own knowledge for timeless general concepts (e.g. "what is inflation", "how do bonds work").

ATTRIBUTION & CERTAINTY — each live result begins with a ready-made source link in the form "[Name](url)". Cite like this: right AFTER the sentence or claim a source supports, append its link as a standalone citation tag, e.g. "Palantir is trading around $126.97 per share, up about 8.8% on the day. [MarketWatch](https://www.marketwatch.com/...)". Place the tag at the END of the statement — do NOT weave it into the prose (avoid "per [Name]" or "according to [Name]"); it reads like a little reference tag. Copy the whole [Name](url) string verbatim — never alter the URL, strip it, paste a bare domain, or write a source name as plain text (a source name must ALWAYS be its [Name](url) link). If several consecutive facts come from the same source, one tag at the end of that group is fine; when different claims use different sources, tag each with its own. If two or more sources back the same claim, put their tags together separated by ", " (e.g. "[Yahoo Finance](url), [Reuters](url)"). Don't say vague things like "according to the latest market data" — attach the actual source tag. Crucially, distinguish confirmed facts from unconfirmed ones: if the results describe something as a report, rumour, leak, or "sources say" rather than an official announcement, SAY SO ("..., though this isn't officially confirmed. [Bloomberg](url)") instead of stating it as settled fact. Concrete numbers (prices, %moves, dates) make an answer stronger — include them when the results have them.

ANSWER WHAT'S ASKED — match the answer to the actual question. The live results often contain extra data (stock prices, ranges, volume, ratings) that may NOT be what the user asked about. Only include a price or market snapshot if the user actually asked about the price, stock, or how it's trading. For a definitional or general question ("what is Palantir", "who is X", "explain Y"), just explain it — do NOT tack on a market/price breakdown. Use the live results to answer the specific question, not to dump everything you found.

VOICE:
- Just answer the question directly in plain, friendly language. Do not open with a one-liner, hook, headline or "hot take" — start straight with the actual answer.
- Humour is welcome but subtle and natural: a genuinely funny aside lands best when it's occasional, not every line. Skip it entirely if it doesn't come naturally. No forced jokes, no cheeky roasts, no try-hard one-liners, no corny filler.
- Be down-to-earth and a little humble — share views lightly, don't act like a know-it-all, and be upfront when something's uncertain or you're not sure. Every FACT must come from the live results or solid knowledge, never invented.

HONESTY — never make up facts. Do NOT invent specific numbers, prices, dates, statistics, product details or events. If the live results don't cover it, or it's too recent/niche to confirm, just say so plainly — a quick honest "couldn't find anything solid on that" beats a confident wrong answer.

LENGTH — keep it tight but complete. Default to a short paragraph (3-5 sentences); give the key numbers and the "why it matters" without padding. If a list genuinely helps, a quick intro line plus at most 3-4 tight bullets — never a long multi-section breakdown with labelled categories. Go a bit longer only when the question is layered or the user asks for a deep dive or full comparison, but always favour substance over filler.

FORMATTING — your reply is shown in a Telegram message. Use ONLY short plain-text paragraphs and "• " bullets when a list genuinely helps. Do NOT bold the opening line or whole sentences, and don't use bold as a headline; use *bold* (single asterisks) only sparingly for a key word or number. NEVER use Markdown tables, pipes (|), headings (#, ##), HTML tags, or <br>.`;

async function askGroq(question, newsContext = '') {
  const prompt = `${PERSONA}
${newsContext ? `\nLatest news context:\n${newsContext}\n` : ''}
Question: ${question}`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    { model: MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 1000, reasoning_effort: REASONING_EFFORT },
    { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
  );
  return response.data.choices[0].message.content;
}

// Multi-turn chat completion for the free-text Q&A. `webContext` is a short
// Tavily snippet block (see search.js) injected so the model answers from
// live info instead of stale training memory. We do the search ourselves and
// cap its size, which keeps the request small and well under Groq's limits.
async function chatGroq(history, question, webContext = '') {
  // Only keep the last couple of exchanges so the request stays lean.
  const recentHistory = Array.isArray(history) ? history.slice(-4) : [];
  const userContent = webContext
    ? `LIVE WEB RESULTS (today's info — base facts on these; if they mention different dates or versions, go with the most recent):\n${webContext}\n\nQuestion: ${question}`
    : `NO LIVE WEB RESULTS FOUND.\n\nQuestion: ${question}`;
  const messages = [
    { role: 'system', content: PERSONA },
    ...recentHistory,
    { role: 'user', content: userContent }
  ];
  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    // Headroom for a slightly longer answer; brevity is enforced by the persona.
    { model: MODEL, messages, max_tokens: 800, reasoning_effort: REASONING_EFFORT },
    { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
  );
  return response.data.choices[0].message.content;
}

// Rejects if the wrapped promise doesn't settle within `ms` so a slow
// Groq call falls back to hardcoded content instead of hanging the cron job.
function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Groq timeout')), ms))
  ]);
}

// Asks Groq for a JSON response and parses it. A higher temperature yields
// more varied wording/angles (used by the MCQ generator to avoid repeats).
// timeoutMs can be raised for heavier generations (e.g. the 3-question quiz
// with per-option explanations) so they don't time out and force a fallback.
async function groqJSON(prompt, maxTokens = 1000, temperature = 1, timeoutMs = 20000) {
  const response = await withTimeout(axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
      reasoning_effort: REASONING_EFFORT,
      response_format: { type: 'json_object' }
    },
    { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
  ), timeoutMs);
  return JSON.parse(response.data.choices[0].message.content);
}

// Validates one MCQ object has the expected shape.
function isValidMCQ(q) {
  return q && q.question && q.explanation &&
    Array.isArray(q.options) && q.options.length === 4 &&
    ['A', 'B', 'C', 'D'].includes(q.answer);
}

// Generates a set of three fresh MCQs (Easy, Medium, Hard) based on
// recent headlines. `recentQuestions` is an avoid-list of recently-asked
// question texts (see mcqHistory.js) so Groq doesn't reuse the same topics.
// Throws if Groq is down/slow or returns malformed questions — the caller
// is expected to fall back to hardcoded ones.
async function generateMCQSet(headlines, recentQuestions = []) {
  // Cap the avoid-list to the most recent 15 so the prompt stays small — a
  // bloated prompt + a big max_tokens reservation trips Groq's per-minute
  // token limit (HTTP 413) and forces the fallback.
  const avoid = recentQuestions.slice(-15);
  const avoidBlock = avoid.length
    ? `\n────────────────────────────────────────
🚫 BANNED SUBJECTS — these questions were already asked on recent days:
${avoid.map(q => `- ${q}`).join('\n')}

HARD RULE: every one of your three questions must be about a DIFFERENT subject from every banned question above. A subject is banned even if you reword it, change the difficulty, flip the angle, or focus on a different detail of the same company / event / asset / metric. If a headline below relates to any banned subject (e.g. the same company, the same conflict, the same IPO, the same commodity), SKIP that headline and choose a different one. There are many headlines — use the less obvious ones.
────────────────────────────────────────\n`
    : '';

  const prompt = `You are a financial educator creating a daily quiz for a markets/news Telegram channel.
Based on these recent headlines, create THREE multiple-choice questions connected to the news, at three clearly different difficulty levels:
- 🟢 Easy: beginner-friendly, tests one basic concept.
- 🟡 Medium: intermediate, needs real understanding of how something works.
- 🔴 Hard: challenging and thought-provoking — tests a real mechanism or a second-order effect that makes the reader think — BUT it must be verifiably correct. CORRECTNESS BEATS CLEVERNESS: a hard question that is subtly WRONG is far worse than a clearly-correct one that is a bit easier. So:
  • Do NOT chase "trick even the professionals" difficulty with subtle distractors where two options are both arguably right — that is exactly how questions end up wrong. Difficulty must come from testing a real concept the reader has to reason about, NOT from a coin-flip between two defensible answers.
  • Test a SINGLE clear mechanism. Do NOT build a speculative "given X, Y and Z, which chain of effects..." question stringing several events together.
  • The correct answer must be the TEXTBOOK-correct, standard explanation that any finance textbook or professional would confirm with zero debate — not a contrarian or "well, actually" take. (E.g. for why a weak dollar lifts gold: the standard answer is that dollar-priced gold becomes CHEAPER for buyers using other currencies, so demand rises. Do not mark that wrong.)
  • The three wrong options must be DEFINITIVELY wrong — clear, common misconceptions a knowledgeable person can rule out, not "also true" statements.
  • Before finalising, sanity-check that the correct answer's mechanism points in the right DIRECTION (finance relationships are easy to state backwards). If you are not 100% sure an option is textbook-correct, choose a different, safer question you ARE sure about.
  • PREFER reasoning over arithmetic: no multi-step numerical problems (forward pricing, discounting, bond math). If a number is unavoidable, keep the calculation trivial and verifiably right.
  • AVOID currency/FX-denomination questions — anything of the form "how does a weaker/stronger dollar affect the price of gold / Bitcoin / commodity X". These hinge on subtle denomination effects that are very easy to state backwards, so steer clear of them entirely. Prefer mechanisms that are clean and unambiguous, e.g.: what a specific metric measures and why it moved, the direct effect of a central-bank rate change on borrowing or bond prices, how supply/demand shifted for a named asset, why a company's margins or earnings changed, or a clear cause→effect from a specific headline.

IMPORTANT — vary the topics: tie ALL THREE questions (the Easy one included) to a specific company, asset, market, region or event mentioned in TODAY'S headlines below. Do NOT fall back on generic evergreen textbook questions (e.g. "what does the S&P 500 track", "what does GDP stand for") — pick fresh angles that would differ from day to day.
Each question must be self-contained (do not assume the reader saw a specific article).

EXPLAIN FOR A COMPLETE BEGINNER — assume the reader has ZERO finance knowledge and has never invested. Teach, don't just assert. Rules for ALL explanation text:
- Use plain everyday language and short sentences.
- Explain EVERY finance term you use, in brackets, right where it appears — even common-sounding ones. E.g. "market cap (the total value of a company, found by multiplying its share price by how many shares exist)", "revenue (the total money a company takes in from sales)", "interest rate (the cost of borrowing money, set as a percentage)". Never assume a term like "shares", "balance sheet", "earnings", "yield" or "dividend" is already understood.
- Write like you're kindly teaching a curious friend who is smart but knows nothing about markets.

For each question provide:
- "explanation": 2-4 sentences that TEACH why the correct answer is right — explain the underlying idea from scratch, defining each term, so the reader actually learns the concept (not just "A is correct because it's the definition").
- "whyWrong": an object with an entry for EACH of the three incorrect option letters. Each entry must be genuinely educational: first explain in plain words what that wrong option actually refers to (define its terms too), THEN why that isn't the answer to this question. The reader should come away understanding all four options, not just being told "nope". Keys are the option letters that are NOT the answer.
Example of a GOOD whyWrong entry (teaches the concept): "B: 'Cash on hand' means the money a company keeps in its bank accounts right now. That's useful to know, but it's usually far smaller than the company's market cap and measures something different — money available today, not the total value of the whole company." Example of a BAD one (too curt, teaches nothing): "B: Cash on hand is a balance-sheet item, not market cap."

Recent headlines:
${headlines}
${avoidBlock}
Respond ONLY with valid JSON in exactly this shape:
{
  "questions": [
    { "level": "🟢 Easy",   "question": "...", "options": ["A — ...","B — ...","C — ...","D — ..."], "answer": "A", "explanation": "plain-language reason A is right", "whyWrong": { "B": "plain reason B is wrong", "C": "plain reason C is wrong", "D": "plain reason D is wrong" } },
    { "level": "🟡 Medium", "question": "...", "options": ["A — ...","B — ...","C — ...","D — ..."], "answer": "B", "explanation": "plain-language reason B is right", "whyWrong": { "A": "...", "C": "...", "D": "..." } },
    { "level": "🔴 Hard",   "question": "...", "options": ["A — ...","B — ...","C — ...","D — ..."], "answer": "C", "explanation": "plain-language reason C is right", "whyWrong": { "A": "...", "B": "...", "D": "..." } }
  ]
}
Make every option plausible and tempting — NO joke, silly, or filler answers. Aim for genuinely challenging questions that test real understanding and application, not just definitions; the wrong options should be common misconceptions. Keep each option under 90 characters.`;

  // Higher temperature → more varied wording and angles day to day.
  // max_tokens 4000: enough for 3 questions with per-option explanations plus
  // reasoning, but low enough that prompt + reserved tokens stay under Groq's
  // per-minute token cap (a 6000 reservation was hitting HTTP 413). Longer
  // timeout so the sizeable generation doesn't time out into the fallback.
  const data = await groqJSON(prompt, 4000, 1.1, 45000);
  const qs = data && data.questions;
  const valid = Array.isArray(qs) && qs.length === 3 && qs.every(isValidMCQ);
  if (!valid) throw new Error('Malformed MCQ set from Groq');
  // whyWrong is best-effort: keep it only when it's a proper object covering
  // the three non-answer letters, else drop it so the answers post falls back
  // to the plain explanation (never fail the whole set over it).
  for (const q of qs) {
    const letters = ['A', 'B', 'C', 'D'].filter(l => l !== q.answer);
    const w = q.whyWrong;
    const ok = w && typeof w === 'object' &&
      letters.every(l => typeof w[l] === 'string' && w[l].trim());
    if (!ok) delete q.whyWrong;
  }
  // Force canonical level labels by position so a slightly off label from
  // the model doesn't matter (and the 3 tiers are always Easy/Medium/Hard).
  const levels = ['🟢 Easy', '🟡 Medium', '🔴 Hard'];
  qs.forEach((q, i) => { q.level = levels[i]; });
  return qs;
}

// Generates a fresh poll based on recent headlines.
// Throws on failure so the caller can fall back to a hardcoded poll.
async function generatePoll(headlines) {
  const prompt = `You run a finance/markets Telegram community. Based on these recent headlines, create ONE fun, engaging poll to spark discussion about markets, the economy or current financial events.

Recent headlines:
${headlines}

Respond ONLY with valid JSON in exactly this shape:
{
  "question": "🗳️ <catchy title>\\n\\n<the poll question>",
  "options": ["<option with emoji>", "...", "4 to 5 options total"]
}
Keep each option under 90 characters. Make the last option a lighthearted or neutral choice.`;

  const p = await groqJSON(prompt);
  const valid = p && p.question && Array.isArray(p.options) &&
    p.options.length >= 2 && p.options.length <= 10 &&
    p.options.every(o => typeof o === 'string' && o.length <= 100);
  if (!valid) throw new Error('Malformed poll from Groq');
  return p;
}

// Writes a clear 2-3 sentence editorial summary for each article, in one
// batched call. Returns an array of strings in the same order as `articles`.
// Throws on failure so callers (the reader carousel and the Mini App web
// server) can fall back to the article description.
async function generateSummaries(articles) {
  const list = articles.map((a, i) =>
    `${i + 1}. ${a.title || 'Untitled'} — ${(a.description || '').slice(0, 240)}`
  ).join('\n');

  const prompt = `You are the editor of a daily news magazine for everyday readers who are NOT finance or politics experts. For each numbered article below, write a clear 2-3 sentence summary that anyone can understand.

Rules for each summary:
- Use clear, everyday language — write like you are explaining it to a smart friend.
- You may use common financial, markets and political terms (jargon) naturally — no need to over-explain basics. Only add a quick plain-English note for genuinely obscure terms.
- Explain WHY it matters or how it affects ordinary people, not just what happened.
- Be factual and neutral. Do not invent details beyond the title and description.
- No hype, no clickbait, no emojis.

Articles:
${list}

Respond ONLY with valid JSON in exactly this shape:
{ "summaries": ["summary for article 1", "summary for article 2", "... one entry per article, same order"] }
Provide exactly ${articles.length} summaries.`;

  const data = await groqJSON(prompt, 2200);
  const s = data && data.summaries;
  const valid = Array.isArray(s) && s.length === articles.length &&
    s.every(x => typeof x === 'string' && x.trim().length > 0);
  if (!valid) throw new Error('Malformed summaries from Groq');
  return s.map(x => x.trim());
}

// Best-effort relevance filter. Given articles, asks Groq which headlines are
// genuine finance/world/tech NEWS (vs lifestyle, listicles, opinion, sports,
// human-interest fluff) and returns only those, in original order. On ANY
// failure — no key, timeout, bad JSON, or an empty/over-aggressive result —
// it returns the input unchanged, so it can never starve the feed.
async function filterRelevantNews(articles) {
  if (!GROQ_API_KEY || !Array.isArray(articles) || articles.length === 0) return articles;
  const list = articles.map((a, i) => `${i + 1}. ${a.title || ''}`).join('\n');
  const prompt = `You are the editor of a finance, world-affairs and technology news channel. Below are ${articles.length} numbered headlines. For EACH one, decide if it is GENUINE hard news about markets, the economy, business, finance, technology, science, world affairs or politics.
Mark it false if it is: lifestyle, a personal essay ("I moved to…", "I tried…"), travel, food/recipes, shopping/deals, a product roundup, an "N things/tips/ways" listicle, human-interest fluff, celebrity, sports, a horoscope, an opinion/blog post, or a how-to guide.
Headlines:
${list}
Respond ONLY with JSON containing a "news" array of EXACTLY ${articles.length} booleans, in the same order (true = keep as news, false = drop):
{"news":[true,false,true, ...]}`;
  try {
    // temperature 0 → deterministic classification. Ordered boolean array
    // (like generateSummaries) avoids the model merging/miscounting indices.
    // Generous max_tokens: gpt-oss "reasons" before answering, and a tight
    // budget got consumed by reasoning and returned an empty (invalid) body.
    const data = await groqJSON(prompt, 3000, 0);
    const verdicts = data && data.news;
    // Must be a boolean array of the right length, or we can't trust it.
    if (!Array.isArray(verdicts) || verdicts.length !== articles.length) return articles;
    const filtered = articles.filter((_, i) => verdicts[i] !== false);
    return filtered.length ? filtered : articles;
  } catch (e) {
    console.error('filterRelevantNews failed:', e.message);
    return articles;
  }
}

module.exports = { askGroq, chatGroq, generateMCQSet, generatePoll, generateSummaries, filterRelevantNews };
