const axios = require('axios');
const { NEWS_API_KEY } = require('../config');
const { trackApiCall } = require('./quota');

async function fetchNews(category, pageSize = 10) {
  const queries = {
    markets: 'stock market OR financial markets OR S&P500 OR nasdaq OR dow jones',
    world: 'geopolitics OR international relations OR war OR diplomacy OR sanctions',
    technology: 'artificial intelligence OR technology OR semiconductor OR cybersecurity',
  };
  trackApiCall();
  const response = await axios.get('https://newsapi.org/v2/everything', {
    params: { q: queries[category], language: 'en', sortBy: 'publishedAt', pageSize, apiKey: NEWS_API_KEY }
  });
  return response.data.articles;
}

async function fetchNewsByKeyword(keyword, pageSize = 5) {
  trackApiCall();
  const response = await axios.get('https://newsapi.org/v2/everything', {
    params: { q: keyword, language: 'en', sortBy: 'publishedAt', pageSize, apiKey: NEWS_API_KEY }
  });
  return response.data.articles;
}

async function fetchNewsByCountry(country, pageSize = 5) {
  trackApiCall();
  const response = await axios.get('https://newsapi.org/v2/top-headlines', {
    params: { country, pageSize, apiKey: NEWS_API_KEY }
  });
  return response.data.articles;
}

// Used by all scheduled posts to stay within the 100 calls/day free tier limit.
// Replaces the old pattern of fetchNews('markets') + fetchNews('world') + fetchNews('technology').
async function fetchCombinedNews(pageSize = 15) {
  trackApiCall();
  const response = await axios.get('https://newsapi.org/v2/everything', {
    params: {
      q: 'stock market OR geopolitics OR artificial intelligence OR economy',
      language: 'en',
      sortBy: 'publishedAt',
      pageSize,
      apiKey: NEWS_API_KEY
    }
  });
  return response.data.articles;
}

module.exports = { fetchNews, fetchNewsByKeyword, fetchNewsByCountry, fetchCombinedNews };
