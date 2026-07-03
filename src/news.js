const axios = require('axios');
const { NEWS_API_KEY } = require('../config');
const { trackApiCall } = require('./quota');
const { isBlocked } = require('./blocklist');
const { filterRelevantNews } = require('./groq');

// Retail/affiliate "deals" signals. NewsAPI's broad query + popularity sort
// pulls in shopping roundups ("Deals: iPad $350 off", "50% off", "stock up …
// dirt cheap") from tech sites — not news. These patterns are deliberately
// specific to SHOPPING deals so genuine business stories (an M&A "deal", a
// "trade deal") are NOT caught by a bare word like "deal".
const DEAL_SIGNALS = [
  /\bdeals?\s*:/i,                     // "Deals: …" roundup prefix
  /\b\d{1,3}%\s*off\b/i,               // "50% off"
  /\$\s?\d+(?:\.\d+)?\s*off\b/i,       // "$350 off"
  /\bsave\s+\$?\d/i,                   // "save $50" / "save 20%"
  /\b(?:discount|coupon|promo)\s*codes?\b/i,
  /\b(?:prime day|black friday|cyber monday)\b/i,
  /\b(?:stock up|dirt cheap|on sale|in stock|best buys?)\b/i,
  /\b(?:best|top)\s+(?:\w+\s+)?deals?\b/i, // "best deals", "top tech deals"
];

// True if an article looks like a shopping/affiliate deal rather than news.
function isCommercialDeal(a) {
  const text = `${a.title || ''} ${a.description || ''}`;
  return DEAL_SIGNALS.some(re => re.test(text));
}

// Obvious lifestyle/fluff signals — cheap first pass before the AI relevance
// filter. Kept deliberately HIGH-PRECISION (only clear fluff) so the AI step
// handles the subtler cases and we don't wrongly drop real news.
const FLUFF_SIGNALS = [
  /^\s*\d+\s+(?:things|ways|products|items|gadgets|habits|foods|snacks|places|tips|hacks|tricks|secrets)\b/i, // listicles
  /\bI\s+(?:moved|tried|quit|left|switched|lived|worked at|visited|stayed|ate|wore|spent a)\b/i,              // personal essays
  /\baccording to (?:a|an)\s+(?:flight attendant|barista|chef|waiter|waitress|bartender|nutritionist|trainer|dietitian|therapist|pilot)\b/i,
  /\b(?:horoscopes?|zodiac|recipes?)\b/i,
];

// True if an article looks like lifestyle/human-interest fluff.
function isFluff(a) {
  const text = `${a.title || ''} ${a.description || ''}`;
  return FLUFF_SIGNALS.some(re => re.test(text));
}

// Removes blocked-domain articles, shopping/deals content, and obvious
// lifestyle fluff from a NewsAPI response. The blocklist is managed at runtime
// via /block and /unblock (see blocklist.js). Subtler off-topic fluff is caught
// later by the AI relevance filter (see fetchCombinedNews).
function filterArticles(articles) {
  return (articles || []).filter(a =>
    a && a.url && !isBlocked(a.url) && !isCommercialDeal(a) && !isFluff(a));
}

async function fetchNews(category, pageSize = 10) {
  // Quoted phrases force exact-phrase matches so a partial word (e.g. "stock"
  // inside a package name like "…-stock-lot") doesn't false-match.
  const queries = {
    markets: '"stock market" OR "financial markets" OR "S&P 500" OR nasdaq OR "dow jones"',
    world: 'geopolitics OR "international relations" OR war OR diplomacy OR sanctions',
    technology: '"artificial intelligence" OR technology OR semiconductor OR cybersecurity',
  };
  trackApiCall();
  const response = await axios.get('https://newsapi.org/v2/everything', {
    params: { q: queries[category], language: 'en', sortBy: 'publishedAt', pageSize: pageSize + 12, apiKey: NEWS_API_KEY }
  });
  return filterArticles(response.data.articles).slice(0, pageSize);
}

async function fetchNewsByKeyword(keyword, pageSize = 5) {
  trackApiCall();
  const response = await axios.get('https://newsapi.org/v2/everything', {
    params: { q: keyword, language: 'en', sortBy: 'publishedAt', pageSize: pageSize + 10, apiKey: NEWS_API_KEY }
  });
  return filterArticles(response.data.articles).slice(0, pageSize);
}

async function fetchNewsByCountry(country, pageSize = 5) {
  trackApiCall();
  const response = await axios.get('https://newsapi.org/v2/top-headlines', {
    params: { country, pageSize: pageSize + 10, apiKey: NEWS_API_KEY }
  });
  return filterArticles(response.data.articles).slice(0, pageSize);
}

// Used by all scheduled posts to stay within the 100 calls/day free tier limit.
// Replaces the old pattern of fetchNews('markets') + fetchNews('world') + fetchNews('technology').
// Fetches extra so enough remain after blocked-domain filtering.
// sortBy: 'popularity' (default — lead with significant stories from major
// outlets) or 'publishedAt' (newest first, used by the timed news updates).
// fromDaysAgo constrains results to a recent window. This matters: without a
// date filter, sortBy=popularity ranks across NewsAPI's whole ~month window
// and returns the SAME most-popular articles every day (the feed never moves).
// A sliding recent window keeps the content fresh day to day.
// aiFilter: run the best-effort AI relevance pass (drops subtler fluff). Keep
// it ON for user-facing feeds (reader carousel, Mini App, teaser). Turn it OFF
// for context-only fetches (briefing/poll/quiz) — they just need raw headlines
// for topic ideas, and skipping it avoids a heavy Groq call right before those
// features' own Groq call, which was tripping the rate limit → fallbacks.
async function fetchCombinedNews(pageSize = 15, sortBy = 'popularity', fromDaysAgo = 2, aiFilter = true) {
  trackApiCall();
  const from = new Date(Date.now() - fromDaysAgo * 86400000).toISOString().slice(0, 10);
  const response = await axios.get('https://newsapi.org/v2/everything', {
    params: {
      // Quoted multi-word phrases → exact matches, so partial words don't
      // false-match (e.g. "stock" inside an unrelated package name).
      q: '"stock market" OR geopolitics OR "artificial intelligence" OR economy',
      language: 'en',
      sortBy,
      from,
      // Over-fetch so enough remain after blocked-domain + deals + fluff
      // filtering and the AI relevance pass below.
      pageSize: Math.min(pageSize + 20, 100),
      apiKey: NEWS_API_KEY
    }
  });
  // Cheap filters first (blocklist + deals + obvious fluff), then optionally
  // an AI relevance pass to drop subtler off-topic fluff from legit outlets
  // (best-effort — returns everything if Groq is unavailable), then trim.
  const clean = filterArticles(response.data.articles);
  const relevant = aiFilter ? await filterRelevantNews(clean) : clean;
  return relevant.slice(0, pageSize);
}

module.exports = { fetchNews, fetchNewsByKeyword, fetchNewsByCountry, fetchCombinedNews };
