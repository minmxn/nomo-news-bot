const mcqQuestions = [
  { level: '🟢 Easy', question: 'How are companies weighted in the S&P 500 index?', options: ['A — By market capitalisation', 'B — Equally', 'C — By share price', 'D — By annual revenue'], answer: 'A', explanation: 'The S&P 500 is market-cap weighted, so larger companies move the index more than smaller ones. A handful of mega-caps can drive much of its daily change.' },
  { level: '🟡 Medium', question: 'A bond is trading above its face (par) value. What does this imply about its coupon versus current market rates?', options: ['A — Its coupon is below market rates', 'B — Its coupon is above market rates', 'C — Coupon equals market rates', 'D — The issuer has defaulted'], answer: 'B', explanation: 'A bond trades at a premium (above par) when its fixed coupon is higher than prevailing market rates, making it more attractive than newly issued bonds.' },
  { level: '🔴 Hard', question: 'An inverted yield curve (short-term yields above long-term) has historically been a leading signal of what?', options: ['A — Accelerating GDP growth', 'B — An approaching recession', 'C — Imminent hyperinflation', 'D — A stronger currency'], answer: 'B', explanation: 'When short-term yields exceed long-term yields, investors expect rate cuts amid a slowdown. It has preceded most modern US recessions, often by 6–18 months.' },
  { level: '🟢 Easy', question: 'Which of these is counted in a country’s GDP?', options: ['A — The value of goods and services newly produced', 'B — Stock market gains', 'C — Sales of second-hand goods', 'D — Government debt repayments'], answer: 'A', explanation: 'GDP counts the value of newly produced goods and services in a period. Asset price gains and resale of existing goods are excluded.' },
  { level: '🟡 Medium', question: 'Headline inflation includes food and energy; what does "core" inflation do?', options: ['A — Excludes volatile food and energy prices', 'B — Counts only food and energy', 'C — Adjusts for currency moves', 'D — Measures wages only'], answer: 'A', explanation: 'Core inflation strips out volatile food and energy prices to reveal the underlying trend — central banks watch it closely when setting policy.' },
  { level: '🔴 Hard', question: 'Quantitative tightening (QT) is the reverse of QE. What is its main effect?', options: ['A — It expands the money supply', 'B — It drains liquidity by shrinking the central bank balance sheet', 'C — It cuts income tax rates', 'D — It lowers bank reserve requirements'], answer: 'B', explanation: 'QT reduces liquidity as the central bank lets bonds mature or sells them, shrinking its balance sheet — generally tightening financial conditions.' },
  { level: '🟢 Easy', question: 'A market index falls 12% from its recent high. What is this called?', options: ['A — A correction', 'B — A bear market', 'C — A recession', 'D — A crash'], answer: 'A', explanation: 'A drop of 10% or more is a "correction"; a bear market needs a fall of 20%+. A recession refers to the economy, not the index itself.' },
  { level: '🟡 Medium', question: 'Under its dual mandate, which TWO goals does the US Federal Reserve target?', options: ['A — Stable prices and maximum employment', 'B — Maximum GDP and low taxes', 'C — A strong dollar and trade surplus', 'D — High stock prices and low debt'], answer: 'A', explanation: 'The Fed’s dual mandate is price stability and maximum sustainable employment. It pursues both mainly by adjusting short-term interest rates.' }
];

// Mutable state shared between commands and scheduler.
// currentMCQs holds the three questions (Easy/Medium/Hard) posted at 10am
// so the 11am job can reveal their answers.
const mcqState = {
  currentMCQIndex: 0,
  currentMCQs: []
};

module.exports = { mcqQuestions, mcqState };
