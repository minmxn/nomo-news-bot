const { TZ } = require('../config');

const DAILY_LIMIT = 100;
let quotaDate = new Date().toLocaleDateString('en-SG', { timeZone: TZ });
let quotaCount = 0;

function trackApiCall() {
  const today = new Date().toLocaleDateString('en-SG', { timeZone: TZ });
  if (today !== quotaDate) {
    quotaDate = today;
    quotaCount = 0;
  }
  quotaCount++;
}

function getQuota() {
  return { quotaCount, quotaDate };
}

module.exports = { DAILY_LIMIT, trackApiCall, getQuota };
