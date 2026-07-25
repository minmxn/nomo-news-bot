# Nomo News Bot — Handoff & Journey

*A plain-English narrative of how this bot got to where it is, and how to run it going forward. Last updated: July 2026.*

If you're a future maintainer (human or AI) picking this up: read this for the **story and the gotchas**, and read [CLAUDE.md](../CLAUDE.md) for the **technical structure**.

---

## What this is

A Telegram news bot ("BUILT BY MIN", handle `@nomogh_bot`) that pulls financial/world/tech news, uses AI to summarize it and generate polls & quizzes, and posts on a daily schedule (all times Singapore). Users can also ask it free-text questions and it answers using live web search. It's a personal/hobby project.

---

## TL;DR — where things stand right now

- ✅ **Live and running 24/7 on Oracle Cloud** (Always Free ARM instance). Auto-restarts on crash and on reboot.
- ✅ **All features working**, including the AI ones (summaries, quizzes, Q&A).
- ✅ **3 of 4 API keys rotated** (Telegram, Groq, Tavily). NewsAPI wasn't — its free tier has no self-serve key reset, and it's the lowest-risk key.
- ✅ **Deploy workflow set up**: `git push` to `main`, then run `deploy`.
- ✅ **A budget alert** guards against surprise Oracle charges.
- ✅ The old **Mini App was removed** — the bot is now purely in-chat.

---

## The journey (how we got here)

### 1. Why we migrated
The bot used to run on **Railway**, but the subscription ended. We moved to **Oracle Cloud (OCI) Always Free** — chosen over AWS because Oracle's free tier **never expires**, whereas AWS's free tier runs out after ~12 months and starts charging. For an always-on hobby bot, "free forever" won.

### 2. Setting up Oracle Cloud
Created a VM (compute instance) named `nomo-news-bot` in the **Singapore** region. It ended up on the **big ARM shape** (`VM.Standard.A1.Flex`, 4 CPUs / 24 GB RAM — the max of Oracle's Always Free ARM allowance), running **Ubuntu 24.04**. That's far more than the bot needs, but it's free, so great.

### 3. The networking maze (the hard part)
This was the most painful stretch. In order:
- The instance-creation wizard wouldn't let us enable a **public IP** because the subnet didn't exist yet — a known quirk.
- Along the way, **7 duplicate empty VCNs** (virtual networks, all named `vcn-20260722-1105`) got created accidentally. Only one is actually used; the rest are harmless leftovers that can be deleted.
- The VCN the instance landed on had **no Internet Gateway and an empty route table**, so it couldn't reach the internet at all. We fixed this by creating an Internet Gateway and adding a `0.0.0.0/0` route rule to it.
- Confirmed the security list already allowed inbound SSH (port 22).
- Assigned an **ephemeral public IP** (`140.245.102.12` at the time — but see the gotcha about this changing).

### 4. Getting the bot running
Once networking worked: installed **Node.js 22** (via NodeSource), confirmed `git` was present, cloned the repo to `/home/ubuntu/nomo-news-bot`, ran `npm install`, and created the `.env` file with the API keys. Then set up **PM2** (a process manager) to run the bot as `nomo-bot`, keep it alive on crashes, and **auto-start on reboot**.

### 5. The corporate firewall discovery
A big "aha": SSH kept timing out. Turned out **Accenture's corporate wifi blocks outbound SSH (port 22)** entirely — even connecting to GitHub's SSH failed. The fix: **connect over a phone hotspot** instead. Important nuance — this only affects *you logging in to manage the server*. The **bot itself is fine** on corporate wifi or anywhere, because it reaches Telegram/Groq/Tavily *outbound from the Oracle server*, not from your laptop.

### 6. Rotating the API keys
Because some keys had been shown on screen, we rotated them:
- **Telegram** — revoked the old token via @BotFather, put the new one in `.env`, restarted. (Revoking auto-kills the old one.)
- **Groq** — swapped to a new key. ⚠️ There was a **false-alarm scare** here: a raw shell test reported the key as "Invalid," but that was a **test artifact** (a stray hidden character the test included but the bot's config loader strips). The key was valid all along — proven by the bot making real API calls. Lesson: test the key the way the app actually loads it (`dotenv`), not with a raw `grep`.
- **Tavily** — created a new key, verified it with a live search, swapped it in.
- **NewsAPI** — left as-is (free tier has no self-serve reset; lowest risk).

### 7. Quality-of-life setup
- **`ssh nomo`** — an SSH config alias so you connect with two words instead of a long command. The private key now lives in the **Windows ssh-agent** (the OS keychain), so there's **no loose key file** sitting in a folder.
- **`deploy`** — a one-word command (a PowerShell function) that runs the full deploy on the server.

### 8. Removing the Mini App
The bot used to have a "Mini App" (a swipeable web reader served by an Express web server). That was removed — `src/webserver.js`, `src/teaser.js`, `public/`, the `express` dependency, and the `WEBAPP_URL`/`PORT` env vars are all gone. This was done on a branch, merged into `main` (resolving one trivial `bot.js` conflict), and deployed. The bot is now purely in-chat.

---

## How to operate it now

### Connecting to the server
Get on your **phone hotspot** (not office wifi), then:
```
ssh nomo
```
You'll land in the server. Type `exit` to leave.

### Deploying code changes
1. Make your edits, then commit and push to **`main`** (the server tracks `main`):
   ```
   git add -A && git commit -m "what changed" && git push
   ```
2. On hotspot, run:
   ```
   deploy
   ```
   (That's shorthand for `ssh nomo "cd ~/nomo-news-bot && git pull && npm install && pm2 restart nomo-bot"`.)

### Checking on it
```
ssh nomo "pm2 list"                          # is it online?
ssh nomo "pm2 logs nomo-bot --lines 20 --nostream"   # recent activity
```
`status: online` = healthy.

---

## Gotchas & things to remember

- 🔌 **SSH needs a personal network / hotspot.** Corporate wifi blocks port 22. The bot doesn't care; only your management access does.
- 📌 **The public IP is ephemeral** — it can change if the instance is stopped and started. If `ssh nomo` suddenly can't connect but the instance is "Running," check the instance's current Public IP in the Oracle console and update `HostName` in `C:\Users\min.y.seet\.ssh\config`. *(Optional fix: reserve the IP in Oracle to make it permanent.)*
- 🧾 **The logs look scarier than they are.** PM2's `error.log` also collects Node **warnings**, not just errors. Normal, harmless lines include: a `429` (Groq free-tier rate limit, common during rapid testing), a `DeprecationWarning` from the Telegram library, and "Reader summary generation failed, using descriptions" (a *graceful fallback* — the bot uses the article's own description when Groq hiccups). A **real** problem would look like the bot going `offline`, a `Cannot find module` crash, or restart-looping — none of which are normal here.
- ☝️ **Only one instance can run at a time.** Two copies polling the same Telegram token = HTTP 409 conflicts. Don't run it locally against the live token.
- 🔑 **Back up the SSH key.** It lives in the Windows keychain (no file), which survives reboots — but if the Windows profile is ever reset, keep a backup (e.g., in a password manager) or you'd have to re-key via the Oracle console.

---

## Open / optional items (nice-to-haves, not urgent)

- 🗑️ Delete the **6 duplicate empty VCNs** in Oracle (tidiness).
- 🗑️ Delete the leftover **`Dockerfile` / `.dockerignore`** from the repo (unused — we run PM2, not Docker).
- 🔑 Delete the **old Tavily key** in its dashboard if not already done (retire the leaked one).
- 📌 **Reserve the public IP** in Oracle so it never changes.
- 🤫 Silence the Telegram library's `DeprecationWarning` (set `NTBA_FIX_350=1` in `.env`) — purely cosmetic.
- 🔎 If **"summary generation failed / Malformed summaries from Groq"** shows up frequently under *normal* use (not just testing bursts), investigate why Groq returns malformed output for the reader's summaries — that would mean AI summaries are degrading for real, rather than an occasional hiccup.

---

## Key facts at a glance

| Thing | Value |
|---|---|
| Host | Oracle Cloud (OCI) Always Free |
| Instance | `nomo-news-bot`, region `ap-singapore-1`, shape `VM.Standard.A1.Flex` (ARM, 4 CPU / 24 GB), Ubuntu 24.04 |
| Public IP | `140.245.102.12` *(ephemeral — verify in console if SSH fails)* |
| Code path (server) | `/home/ubuntu/nomo-news-bot` (tracks GitHub `main`) |
| Secrets | `/home/ubuntu/nomo-news-bot/.env` (git-ignored; lives only on server) |
| Process manager | PM2, process `nomo-bot`, auto-starts via systemd `pm2-ubuntu` |
| Connect | `ssh nomo` (needs hotspot; key in Windows ssh-agent) |
| Deploy | `git push` to `main` → `deploy` |
| Repo | https://github.com/minmxn/nomo-news-bot |
