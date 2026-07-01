const axios = require('axios');
const { TAVILY_API_KEY, GROQ_API_KEY } = require('../config');

// Lightweight web search via Tavily (https://tavily.com). Returns a SHORT,
// token-bounded context string to ground the AI Q&A, or '' if search is
// unavailable or finds nothing. Keeping this small is the whole point: it's
// what lets the free-text Q&A use live info without blowing Groq's token
// limits (the reason we don't let the model search the web itself).

const MAX_RESULTS = 7;
const SNIPPET_CHARS = 400;
const TIMEOUT_MS = 12000; // advanced search can be slow; give it room

// One Tavily call at the given depth. Returns a context string ('' if empty).
async function runSearch(query, searchDepth, timeRange) {
  const resp = await axios.post(
    'https://api.tavily.com/search',
    {
      query,
      max_results: MAX_RESULTS,
      search_depth: searchDepth,
      time_range: timeRange,
      include_answer: 'basic', // Tavily's own short synthesis of the results
      topic: 'news',
    },
    { headers: { Authorization: `Bearer ${TAVILY_API_KEY}` }, timeout: TIMEOUT_MS }
  );

  const data = resp.data || {};
  const lines = [];
  if (data.answer) lines.push(`Summary: ${data.answer}`);
  for (const r of data.results || []) {
    const snippet = String(r.content || '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CHARS);
    if (snippet) lines.push(`• ${r.title} — ${snippet}`);
  }
  return lines.join('\n');
}

// Ask Groq to infer the right search time window from the query.
// Returns 'day' | 'week' | 'month' | 'year'. Falls back to 'week' on error.
async function inferTimeRange(query) {
  if (!GROQ_API_KEY) return 'week';
  try {
    const resp = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'openai/gpt-oss-120b',
        messages: [{
          role: 'user',
          content: `Based on this question, what is the most appropriate time window to search for news?\nQuestion: "${query}"\nReply with exactly one word — day, week, month, or year — nothing else.`,
        }],
        max_tokens: 5,
        reasoning_effort: 'low',
      },
      { headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 5000 }
    );
    const word = resp.data.choices[0].message.content.trim().toLowerCase();
    if (['day', 'week', 'month', 'year'].includes(word)) return word;
  } catch (e) {
    console.error('inferTimeRange failed:', e.message);
  }
  return 'week';
}

async function webSearchContext(query) {
  if (!TAVILY_API_KEY) return '';
  const timeRange = await inferTimeRange(query);
  const attempts = [['advanced', timeRange], ['basic', timeRange]];
  for (const [depth, tr] of attempts) {
    try {
      const ctx = await runSearch(query, depth, tr);
      if (ctx) return ctx;
      console.error(`Tavily ${depth}/${tr} returned no results for: ${query}`);
    } catch (e) {
      console.error(`Tavily ${depth}/${tr} failed:`, e.response ? e.response.status : e.message);
    }
  }
  return '';
}

module.exports = { webSearchContext };
