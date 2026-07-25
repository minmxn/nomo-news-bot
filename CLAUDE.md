# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Nomo News Bot

A Telegram news bot ("BUILT BY MIN") that fetches financial/world/tech news, summarizes it with AI, and posts it on a daily schedule — as an in-chat tap-through card reader, polls, and quizzes.

## Tech stack

- **Node.js** (CommonJS modules)
- **node-telegram-bot-api** — Telegram bot (long polling)
- **axios** — HTTP (NewsAPI, Groq, image downloads)
- **node-cron** — scheduled posts (all times Asia/Singapore)
- **NewsAPI** (newsapi.org) — news source (free tier: 100 calls/day, ~24h article delay)
- **Groq** (runs `openai/gpt-oss-120b`) — AI summaries, briefings, polls, quizzes, and the free-text Q&A
- **Tavily** (tavily.com) — web search that grounds the free-text Q&A in live info
- Runs under **PM2** on an **Oracle Cloud (OCI) Always Free** ARM instance — see [Deployment & operations](#deployment--operations). The bot is a long-polling Telegram client and needs no inbound ports. (A `Dockerfile` / `.dockerignore` remain in the repo from an abandoned Fly.io attempt but are **unused** by the current PM2 deployment — safe to delete.)

## Commands

```bash
npm install      # install dependencies
npm start        # run the bot (= node bot.js)
```

There is no test suite and no linter configured.

Only one instance may poll Telegram at a time, or you get HTTP 409 conflicts. Since the deployed bot polls continuously, don't also run it locally against the same token. Use a separate `TELEGRAM_TOKEN` pointing to a test bot for local development.

## Deployment & operations

The bot runs on an **Oracle Cloud (OCI) Always Free** instance. It migrated off **Railway** (subscription ended) in **July 2026**. Deployment is plain Node + PM2 — **not** Docker/containers, despite the leftover `Dockerfile`.

**Where it runs**
- OCI instance `nomo-news-bot`, region `ap-singapore-1`, shape `VM.Standard.A1.Flex` (ARM / `aarch64`, 4 OCPU / 24 GB — the Always Free max), Ubuntu 24.04.
- Code lives at `/home/ubuntu/nomo-news-bot`, cloned from GitHub **`main`**. Secrets are in `/home/ubuntu/nomo-news-bot/.env` — **git-ignored, so the real keys live only on the server** (`git pull` never touches `.env`).
- Runs under **PM2** as process **`nomo-bot`**; auto-starts on reboot via the systemd unit `pm2-ubuntu` (`pm2 startup` + `pm2 save` already configured).

**SSH access**
- Connect with the shortcut **`ssh nomo`** (alias in the operator's `~/.ssh/config` → HostName = the instance's public IP, User `ubuntu`). The private key is held in the **Windows ssh-agent** (no loose key file on disk).
- ⚠️ **Corporate wifi (Accenture) blocks outbound SSH (port 22).** You must be on a **personal network / phone hotspot** to SSH in. The bot itself is unaffected — it reaches Telegram/Groq/Tavily *outbound from the server*, independent of the operator's laptop network.

**Deploying changes** (the server tracks `main`)
1. Commit and push to **`main`**: `git add -A && git commit -m "..." && git push`.
2. Deploy: run **`deploy`** (a PowerShell function in the operator's profile) — or the explicit `ssh nomo "bash ~/deploy.sh"`. Both run the same 4 steps on the server:
   `cd ~/nomo-news-bot && git pull && npm install && pm2 restart nomo-bot`. Both need hotspot.

**Monitoring**
- `ssh nomo "pm2 list"` — status (healthy = `online`).
- `ssh nomo "pm2 logs nomo-bot --lines 20 --nostream"` — recent logs. Note PM2's `error.log` also collects harmless Node **warnings** (deprecation notices, best-effort Groq fallbacks like "Reader summary generation failed, using descriptions"), not just real errors — a `429` from Groq is a free-tier rate limit, not a bug.

## Environment variables

Validated at startup in [config.js](config.js) — the process exits with a clear message if a required var is missing.

| Var | Required | Purpose |
|---|---|---|
| `TELEGRAM_TOKEN` | ✅ | Bot token from @BotFather |
| `NEWS_API_KEY` | ✅ | newsapi.org key |
| `GROQ_API_KEY` | recommended | AI features; degrade gracefully if absent |
| `TAVILY_API_KEY` | recommended | Tavily (tavily.com) web-search key. Powers the live-web grounding for the free-text Q&A so it answers current questions from real sources instead of stale model memory. Without it the Q&A still works but only from the model's training (and says "can't confirm" on recent topics). Free tier ~1,000 searches/mo |
| `CHAT_ID` | recommended | Target chat/channel for scheduled posts |
| `BOT_USERNAME` | optional | Defaults to `nomogh_bot` (used for group mention/reply detection) |
| `READER_STORE` | optional | Path for persisted reader sessions; point at a persistent volume (e.g. `/data/reader-sessions.json`) to survive redeploys |
| `MEMORY_STORE` | optional | Path for persisted per-user chat memory; point at a persistent volume to survive redeploys |
| `BLOCKLIST_STORE` | optional | Path for the persisted runtime domain blocklist; point at a persistent volume to survive redeploys |
| `ADMIN_ID` | optional | Telegram user id allowed to run `/block`, `/unblock`, and `/testquiz`. If unset, anyone can run these |
| `MCQ_HISTORY_STORE` | optional | Path for the persisted recent-MCQ history (the avoid-list that stops repeated quiz questions); point at a persistent volume to survive redeploys |

## Architecture

`bot.js` is a thin entry point: it creates the bot and calls three registrars.

```
bot.js
├── config.js              env vars + constants + startup validation
├── src/
│   ├── commands.js        registerCommands(bot) — all bot.onText handlers + the
│   │                      free-text AI fallback (bot.on('message'))
│   ├── scheduler.js       registerScheduler(bot) — all cron jobs, the reply
│   │                      keyboard, the /schedule text, MCQ fallback picker
│   ├── reader.js          registerReader(bot) + startReader() — the /read
│   │                      swipeable carousel (inline-button navigation)
│   ├── news.js            NewsAPI fetchers + blocked-domain filtering
│   ├── search.js          webSearchContext() — Tavily web search returning a
│   │                      short, token-capped snippet block to ground the Q&A
│   ├── groq.js            askGroq + chatGroq (free-text Q&A, takes web context)
│   │                      + generateSummaries / generateMCQSet / generatePoll
│   │                      + filterRelevantNews (JSON mode, with timeout);
│   │                      MODEL = openai/gpt-oss-120b
│   ├── memory.js          per-user chat memory (10 exchanges, 60-min idle,
│   │                      persisted to MEMORY_STORE) for the free-text Q&A
│   ├── blocklist.js       runtime domain blocklist (defaults + user-added via
│   │                      /block), persisted to BLOCKLIST_STORE; used by news.js
│   ├── helpers.js         escapeMarkdown, sanitizeForTelegram (GFM→Telegram-safe
│   │                      Markdown), truncate, buildNewsBody, formatNews,
│   │                      shouldRespond, cleanMessage, cleanSourceName
│   ├── mcqHistory.js      rolling 30-question avoid-list fed to generateMCQSet()
│   │                      so Groq doesn't repeat topics; persisted to MCQ_HISTORY_STORE
│   └── quota.js           in-memory daily NewsAPI call counter (resets SGT midnight)
└── data/
    ├── polls.js           dailyPolls (per weekday)
    └── mcq.js             mcqQuestions (hardcoded fallback) + mcqState
```

> The Mini App (a swipeable web reader served by an Express server) was **removed** in July 2026 — `src/webserver.js`, `src/teaser.js`, and `public/` are gone, along with the `express` dependency and the `WEBAPP_URL`/`PORT` env vars. The bot is now purely an in-chat experience.

### Data flow (scheduled post)

`cron fires → news.js fetchCombinedNews() (1 NewsAPI call, blocked domains filtered)
→ groq.js summarizes/builds content → bot sends to CHAT_ID`.

### Key registrars

- **commands.js** — `/start`, `/markets`, `/world`, `/tech`, `/briefing`, `/mood`, `/search`, `/stock`, `/sg`, `/us`, `/cn`, `/quota`, `/reset`, `/schedule`, the blocklist commands (`/block`, `/unblock`, `/blocked`, `/myid`), plus reply-keyboard buttons and an AI fallback for free-text questions. The free-text Q&A uses `chatGroq` with per-user memory ([memory.js](src/memory.js)), reply-context (anchors to the message a user replied to), and a live web-search grounding step ([search.js](src/search.js) via Tavily) so it answers current questions from real sources instead of fabricating. The persona ("NOMO") is punchy/short and only states facts from the web results or admits it can't confirm. `/read` is registered in reader.js. See [COMMANDS.md](COMMANDS.md).
- **scheduler.js** — cron jobs (see schedule below). `postNewsUpdate()` posts the carousel; `fallbackMCQSet()` rotates hardcoded questions when Groq is unavailable. Also registers `/testquiz` (on-demand quiz that mirrors the 10am path, admin-gated when `ADMIN_ID` is set, never touches `mcqState` or history).
- **reader.js** — the carousel. Sessions (articles + summaries + cached Telegram `file_id`s) live in a `Map`, persisted to `READER_STORE` (24h TTL). Images are pre-downloaded so `Next`/`Prev` (via `editMessageMedia`) are fast; cached `file_id`s make repeat views instant. Image source order: cached file_id → buffer → URL → placeholder.

## Daily schedule (SGT)

| Time | Post | Source |
|---|---|---|
| 8:00am | Morning briefing (AI summary only) | scheduler.js |
| 9:00am | Daily poll — AI-generated, falls back to hardcoded | scheduler.js + data/polls.js |
| 10:00am | MCQ quiz (3 questions) — AI-generated, falls back to hardcoded | scheduler.js + data/mcq.js |
| 11:00am | MCQ answers | scheduler.js |
| 12:00pm | News reader (carousel) | scheduler.js → reader.js |
| 3:00pm | News reader (carousel) | scheduler.js → reader.js |
| 6:00pm | Evening Top News (in-chat carousel, popularity sort) | scheduler.js → reader.js |
| 8:00pm | News reader (carousel) | scheduler.js → reader.js |

## Design notes / conventions

- **AI is best-effort.** Every Groq-backed feature (summaries, poll, MCQ) has a silent fallback (description / hardcoded poll / hardcoded MCQ) and logs failures via `console.error`. Users always get content — so log lines like "summary generation failed, using descriptions" are *graceful fallbacks*, not outages.
- **Groq model.** `MODEL = 'openai/gpt-oss-120b'` (in `groq.js`) is a reasoning model; `REASONING_EFFORT = 'low'` keeps latency and token usage down. This replaced the deprecated `llama-3.3-70b-versatile` (deprecated 2026-08-16). Change the one constant to swap models everywhere. Groq's **free tier rate-limits** (HTTP 429) under bursts — expected during heavy manual testing, clears on its own under normal spaced-out use.
- **API budget.** Scheduled posts use ~8 NewsAPI calls/day (1 each) to stay well under the 100/day free-tier cap. The combined query (`fetchCombinedNews`) replaced 3 separate category fetches. Quota is tracked in `quota.js` (in-memory, resets at SGT midnight).
- **Feed quality.** `news.js` drops (1) blocked domains via `blocklist.js` (defaults include aggregators + non-news like pypi.org, github.com, fiction/blog/sports sites; more added at runtime with `/block`), (2) shopping/affiliate "deals" articles, and (3) obvious lifestyle fluff — all by keyword. `fetchCombinedNews` then runs a best-effort AI relevance pass (`filterRelevantNews` in `groq.js`) to drop subtler off-topic fluff from legit outlets. Queries use quoted phrases so partial words don't false-match. There is no source whitelist — the feed pulls from all of NewsAPI minus these filters.
- **Times are always Asia/Singapore** via the `TZ` constant and `cron` `{ timezone: TZ }`.

## Known limitations

- NewsAPI free tier delays articles up to ~24h and caps at 100 calls/day.
- Reader sessions persist to a file; this only survives redeploys if `READER_STORE` points at a mounted/persistent volume.
- Single polling instance only (no horizontal scaling). The long-polling Telegram connection needs the host running continuously; ensure exactly one instance is up at a time (a second instance causes HTTP 409 conflicts).
- The OCI instance's **public IP is ephemeral** — it can change if the instance is stopped/started. If it changes, update `HostName` in the operator's `~/.ssh/config` (`ssh nomo`). The bot's outbound functionality is unaffected by IP changes; only SSH access is.
