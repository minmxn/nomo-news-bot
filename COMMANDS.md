# Nomo News Bot — Commands

## Telegram Commands

| Command | Description |
|---|---|
| `/start` | Welcome message + keyboard |
| `/markets` | Latest market news |
| `/world` | World and geopolitics news |
| `/tech` | Latest tech news |
| `/briefing` | AI morning briefing |
| `/mood` | Market sentiment today |
| `/search <topic>` | Search any topic e.g. `/search Bitcoin` |
| `/stock <ticker>` | Stock news e.g. `/stock NVDA` |
| `/sg` | Singapore news |
| `/us` | US news |
| `/cn` | China news |
| `/read` | Tap-through news reader (flip stories with ◀ ▶ buttons) |
| `/news` | Open the fullscreen news reader (Mini App; requires `WEBAPP_URL`). `/swipe` also works |
| `/reset` | Clear your conversation memory with the bot (start a fresh thread) |
| `/quota` | Check NewsAPI usage today (100/day limit) |
| `/blocked` | List domains currently filtered out of the news |
| `/block <domain>` | Block a domain from the news (admin) — e.g. `/block junk.com` |
| `/unblock <domain>` | Remove a domain from the blocklist (admin) |
| `/myid` | Show your Telegram user ID (used to set `ADMIN_ID`) |
| `/testpdf` | Generate a test PDF magazine |
| `/schedule` | View the daily posting schedule |

## Keyboard Buttons

| Button | Equivalent Command |
|---|---|
| 📈 Markets | `/markets` |
| 🌍 World | `/world` |
| 💻 Tech | `/tech` |
| ☀️ Briefing | `/briefing` |
| 😎 Mood | `/mood` |
| 🔍 Search | `/search` |
| 🌏 Singapore | `/sg` |
| 🇺🇸 US | `/us` |
| 🇨🇳 China | `/cn` |
| 📊 Stock | `/stock` |
| 📖 Read | `/read` |
| 📅 Schedule | `/schedule` |

## Register Commands with BotFather

To show commands in the Telegram menu, send `/setcommands` to @BotFather and paste:

```
start - Welcome message
markets - Latest market news
world - World and geopolitics news
tech - Latest tech news
briefing - AI morning briefing
mood - Market sentiment today
search - Search any topic e.g. /search Bitcoin
stock - Stock news e.g. /stock NVDA
sg - Singapore news
us - US news
cn - China news
read - Tap-through news reader
news - Open the fullscreen news reader
reset - Clear your conversation memory
quota - Check NewsAPI usage today
testpdf - Generate a test PDF
schedule - View the daily schedule
```

## Project Structure

```
nomo-news-bot/
├── bot.js              # Entry point (wires registrars + web server)
├── config.js           # Env vars, constants, startup validation
├── src/
│   ├── commands.js     # All bot command handlers + free-text Q&A
│   ├── scheduler.js    # Cron jobs, reply keyboard, /schedule text
│   ├── reader.js       # /read tap-through carousel (persisted sessions)
│   ├── webserver.js    # Express server for the Mini App + /api/stories
│   ├── teaser.js       # Evening Top News teaser card
│   ├── news.js         # NewsAPI fetch functions + blocklist filtering
│   ├── groq.js         # Groq AI (summaries, briefing, poll, quiz, chat)
│   ├── quota.js        # Daily NewsAPI call tracker
│   ├── memory.js       # Per-user chat memory for free-text Q&A
│   ├── blocklist.js    # Runtime domain blocklist (/block, /unblock)
│   ├── pdf.js          # PDF magazine generator (used by /testpdf)
│   └── helpers.js      # Shared utilities
├── data/
│   ├── polls.js        # Daily polls (per weekday)
│   └── mcq.js          # Quiz questions and shared state
└── public/
    └── index.html      # Mini App — fullscreen swipe reader
```

## Daily Schedule (SGT)

| Time | Post |
|---|---|
| 8:00am | Morning Briefing (AI summary) |
| 9:00am | Daily Poll |
| 10:00am | MCQ Quiz |
| 11:00am | MCQ Answer Revealed |
| 12:00pm | News Reader (tap-through carousel) |
| 3:00pm | News Reader (tap-through carousel) |
| 6:00pm | Evening Top News teaser (photo + headline + button to open the reader) |
| 8:00pm | News Reader (tap-through carousel) |
| 10:00pm | News Reader (tap-through carousel) |
