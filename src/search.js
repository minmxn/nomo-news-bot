const axios = require('axios');
const { TAVILY_API_KEY, GROQ_API_KEY } = require('../config');

// Lightweight web search via Tavily (https://tavily.com). Returns a SHORT,
// token-bounded context string to ground the AI Q&A, or '' if search is
// unavailable or finds nothing. Keeping this small is the whole point: it's
// what lets the free-text Q&A use live info without blowing Groq's token
// limits (the reason we don't let the model search the web itself).

const MAX_RESULTS = 10;
const SNIPPET_CHARS = 600;
const TIMEOUT_MS = 12000; // advanced search can be slow; give it room

// High-quality finance sources to restrict to when the question is about
// prices/markets, so we get live quote pages instead of stale blog spam.
const FINANCE_DOMAINS = [
  'finance.yahoo.com',
  'stockanalysis.com',
  'marketwatch.com',
  'cnbc.com',
  'reuters.com',
  'bloomberg.com',
  'investing.com',
  'google.com', // Google Finance
];

// One Tavily call. Returns a context string ('' if empty). When `financeOnly`
// is set, results are restricted to the finance sources above.
async function runSearch(query, searchDepth, timeRange, topic, financeOnly) {
  const body = {
    query,
    max_results: MAX_RESULTS,
    search_depth: searchDepth,
    time_range: timeRange,
    include_answer: 'advanced', // Tavily's own synthesis of the results
    include_raw_content: true,  // fuller page text so more numbers survive
    topic,
  };
  if (financeOnly) body.include_domains = FINANCE_DOMAINS;

  const resp = await axios.post(
    'https://api.tavily.com/search',
    body,
    { headers: { Authorization: `Bearer ${TAVILY_API_KEY}` }, timeout: TIMEOUT_MS }
  );

  const data = resp.data || {};
  const lines = [];
  if (data.answer) lines.push(`Summary: ${data.answer}`);
  for (const r of data.results || []) {
    // Prefer Tavily's curated extract; fall back to raw page text if thin.
    const text = (r.content && r.content.length > 80 ? r.content : r.raw_content) || r.content || '';
    const snippet = String(text).replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CHARS);
    if (!snippet) continue;
    // Prefix each result with its source domain so the model can attribute
    // facts (e.g. "per Yahoo Finance") instead of vaguely saying "the data".
    lines.push(`• [${domainOf(r.url)}] ${r.title} — ${snippet}`);
  }
  return lines.join('\n');
}

// Extracts a readable source name from a URL (e.g. "finance.yahoo.com").
function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'source'; }
}

// Ask Groq to plan the search in ONE call: clean up the user's raw question
// into a tight search query (fix typos, expand tickers, add keywords) and
// classify it. Returns { query, timeRange, topic, finance }. Falls back to
// sensible defaults (and the raw query) on any error.
async function planSearch(rawQuery) {
  const defaults = { query: rawQuery, timeRange: 'week', topic: 'news', finance: false };
  if (!GROQ_API_KEY) return defaults;
  try {
    const resp = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'openai/gpt-oss-120b',
        messages: [{
          role: 'user',
          content: `You turn a user's raw chat message into a clean web-search plan. Given the message below:
1. query — rewrite it into a short, keyword-rich web search query. Fix typos, spell out company/ticker names (e.g. "palantir" → "Palantir PLTR"), and add words that get good results (e.g. "stock price today", "latest news"). No filler words.
2. time_range — how recent the info needs to be: "day", "week", "month", or "year".
3. topic — "news" for news/events/announcements, or "general" for prices, data, stats, or factual lookups.
4. finance — true if the question is about a specific stock/crypto price, quote, or market value; otherwise false.

User message: "${rawQuery}"

Respond ONLY with JSON: {"query":"...","time_range":"day|week|month|year","topic":"news|general","finance":true|false}`,
        }],
        max_tokens: 120,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
      },
      { headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 6000 }
    );
    const p = JSON.parse(resp.data.choices[0].message.content);
    return {
      query: (typeof p.query === 'string' && p.query.trim()) ? p.query.trim() : rawQuery,
      timeRange: ['day', 'week', 'month', 'year'].includes(p.time_range) ? p.time_range : defaults.timeRange,
      topic: ['news', 'general'].includes(p.topic) ? p.topic : defaults.topic,
      finance: p.finance === true,
    };
  } catch (e) {
    console.error('planSearch failed:', e.message);
  }
  return defaults;
}

async function webSearchContext(rawQuery) {
  if (!TAVILY_API_KEY) return '';
  const { query, timeRange, topic, finance } = await planSearch(rawQuery);
  // For finance questions, try the curated finance sources first, then widen
  // to the whole web if that comes back empty. Non-finance skips straight to
  // the open web. Each tier also falls back from advanced→basic depth.
  const attempts = finance
    ? [
        ['advanced', timeRange, topic, true],
        ['advanced', timeRange, topic, false],
        ['basic', timeRange, topic, false],
      ]
    : [
        ['advanced', timeRange, topic, false],
        ['basic', timeRange, topic, false],
      ];
  for (const [depth, tr, tp, fin] of attempts) {
    try {
      const ctx = await runSearch(query, depth, tr, tp, fin);
      if (ctx) return ctx;
      console.error(`Tavily ${depth}/${tr}/${tp}${fin ? '/finance' : ''} no results for: ${query}`);
    } catch (e) {
      console.error(`Tavily ${depth}/${tr}/${tp}${fin ? '/finance' : ''} failed:`, e.response ? e.response.status : e.message);
    }
  }
  return '';
}

module.exports = { webSearchContext };
