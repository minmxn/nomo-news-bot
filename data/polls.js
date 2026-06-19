const dailyPolls = {
  1: { question: '🗳️ Monday Market Pulse\n\nHow are you feeling about markets this week?', options: ['📈 Bullish — expecting gains', '📉 Bearish — expecting drops', '😐 Neutral — nothing exciting', '🤷 Not sure yet', '👀 Here to observe and learn'] },
  2: { question: '🗳️ Sector Spotlight\n\nWhich sector do you think performs best this week?', options: ['💻 Technology', '🏦 Banking and Finance', '🛢️ Oil and Energy', '🏥 Healthcare', '🤷 Too hard to call'] },
  3: { question: '🗳️ Mid Week Check\n\nHow are markets performing vs your expectation?', options: ['🚀 Better than expected', '😅 Worse than expected', '😐 Pretty much as expected', '🤷 Will check on Friday'] },
  4: { question: '🗳️ Biggest Market Risk Right Now\n\nWhat do you think is the biggest threat to markets?', options: ['🇺🇸 US recession fears', '🇨🇳 China slowdown', '💸 Inflation returning', '⚔️ Geopolitical tensions', '🤷 Honestly all of the above'] },
  5: { question: '🗳️ Friday Verdict\n\nHow did markets perform vs your prediction this week?', options: ['🎯 Called it perfectly', '😅 Surprised me completely', '💀 Nobody saw that coming', '🤷 I only check on Fridays', '👀 Setting up for next week'] },
  6: { question: '🗳️ Weekend Read\n\nWhat topic do you want more coverage on?', options: ['📈 Stock market deep dives', '🌍 Geopolitics and market impact', '💰 Crypto and digital assets', '🏦 Central banks and interest rates', '🌏 Asia and Singapore markets'] },
  0: { question: '🗳️ Sunday Prediction Corner\n\nYour call for next week — S&P 500?', options: ['📈 Up more than 1%', '📈 Up less than 1%', '😐 Flat', '📉 Down less than 1%', '📉 Down more than 1%', '🤷 Markets are unpredictable'] }
};

const weeklyQuestions = [
  '💬 *Weekly Big Question*\n\nIs the US dollar losing its dominance as the world reserve currency? Drop your thoughts below!',
  '💬 *Weekly Big Question*\n\nWill AI stocks keep outperforming the broader market in 2026? Agree or disagree?',
  '💬 *Weekly Big Question*\n\nIs a global recession coming in the next 12 months? What is your read?',
  '💬 *Weekly Big Question*\n\nAre interest rates going to stay higher for longer? How is it affecting you?',
  '💬 *Weekly Big Question*\n\nIs China a good investment opportunity right now? Bullish or bearish?',
  '💬 *Weekly Big Question*\n\nWill crypto become a mainstream asset class in the next 5 years?',
  '💬 *Weekly Big Question*\n\nIs Singapore economy resilient enough to weather a global slowdown?',
  '💬 *Weekly Big Question*\n\nWith AI disrupting industries — which sector do you think is most at risk?'
];

module.exports = { dailyPolls, weeklyQuestions };
