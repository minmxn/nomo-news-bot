const axios = require('axios');
const { GROQ_API_KEY } = require('../config');

async function askGroq(question, newsContext = '') {
  const prompt = `You are a witty, friendly financial and geopolitical news analyst built by MIN.
You explain complex news in plain simple English that anyone can understand.
Keep answers concise, clear and occasionally add a light humorous remark.
${newsContext ? `\nLatest news context:\n${newsContext}\n` : ''}
Question: ${question}`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    { model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 1000 },
    { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
  );
  return response.data.choices[0].message.content;
}

module.exports = { askGroq };
