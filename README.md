# Piko — The Lantern Fox

Piko is a small digital fox born inside the final glowing pixel of a forgotten website. Piko travels between abandoned web pages, collecting lost ideas, unfinished projects, and story fragments in a magical lantern, then hands out **creative sparks** and **small, achievable quests** on Discord.

Piko is a bot and never pretends to be human. It answers slash commands and, **only during a controlled owner-started demo**, optional AI conversation through OpenRouter's free router: a direct @mention in any server channel, or any message at all in the one dedicated `#piko-chat` channel. It does not send DMs, join voice, or store any message content.

| Command  | What it does |
|----------|--------------|
| `/hello` | Piko introduces itself. |
| `/lore`  | One random piece of Piko's backstory (10 entries). |
| `/quest` | One small, safe creative quest, 10–30 minutes (14 entries). |
| `/spark` | A short creative prompt or project idea (13 entries). |
| `/about` | Short description, character page link, server invite, how to talk with Piko during a demo, and a note that Piko was created with Grok Bot. |
| `/forget` | Erases *your* temporary AI conversation memory. Works for everyone, always, ephemeral reply. |
| `/demo-start` | **Owner only.** Enables AI conversation for exactly one hour. |
| `/demo-stop` | **Owner only.** Disables AI conversation immediately and clears every saved conversation. |

`/lore`, `/quest`, and `/spark` use a shuffle-bag: every entry is shown once before any repeats, and the same entry never appears twice in a row.

## AI conversation (OpenRouter free router)

AI chat is **off by default** every time the process starts. There is no `/chat` command; talking to Piko works like this:

1. The owner (`OWNER_DISCORD_USER_ID`) runs `/demo-start`. Piko announces in character that the AI lantern is lit until a time shown in `UTC+8 (Asia/Manila)` (plus a Discord timestamp).
2. Members write a server message that **directly mentions Piko** (or, in the dedicated `#piko-chat` channel, just write their message) and includes a question, e.g. `@Piko Give me a tiny creative project for tonight.`
3. After one hour (or `/demo-stop`) AI turns off again. Scripted commands (`/hello /lore /quest /spark /about /forget`) work the whole time.

**Dedicated chat channel (`PIKO_CHAT_CHANNEL_ID`).** In the one channel whose ID is set in `PIKO_CHAT_CHANNEL_ID` (e.g. `#piko-chat`), Piko replies to every human message **without a mention**, but only while a demo is active. Everywhere else a mention is still required. If the variable is unset, this mode is off.
- Ignored in that channel: bots, webhooks, Piko itself, system messages (joins, command echoes), attachment-only/empty messages, `@everyone`/`@here`, and any message that mentions other users or roles or replies to another person (human-to-human talk). Edits are not handled.
- While no demo is active, AI is disabled or the key is missing, Piko stays **silent** for unmentioned messages (a message that does mention Piko still gets the resting text).
- If a member hits their rate limit, the cool-down notice is sent at most once per member per 60 s, otherwise Piko stays silent (no request is made). When the daily limit is reached, one resting-style notice is sent at most every 10 minutes for the channel.
- All other rules are identical: same limits, per-member in-memory context, refusals, output sanitising, one in-flight request per member and message-id dedupe.

**Why the Message Content intent.** Piko's intents are Guilds + Guild Messages + **Message Content**. Message Content is privileged (enabled in the Developer Portal by the owner) and is needed only to read unmentioned messages in the dedicated channel. Outside that channel Piko still looks only at messages that directly mention it, and it never stores message text.

Mention trigger rules (everywhere except the dedicated channel): Piko only reacts to a human's message in the configured server that contains an explicit `<@Piko>` mention. Normal messages, other bots, webhooks, DMs, `@everyone`/`@here`, role mentions and plain reply-pings are ignored. A mention with no question gets a greeting; while AI is off, a mention gets "My AI lantern is resting right now, but my slash commands still work." (no request is made). The text of every message is only used transiently to build the request and is never stored or logged.

**Model and endpoint.** `POST https://openrouter.ai/api/v1/chat/completions` with the hard-coded model `openrouter/free`. There is no model setting, no fallback list and no paid model. The actual model OpenRouter picks can vary per reply; only its identifier is logged. OpenRouter is used only for AI conversation, never for scripted commands. The request has `max_tokens` 180, temperature 0.8, no streaming, no tools, a 20 s timeout and carries only Piko's system instruction plus that one member's last 6 messages.

**Limits** (enforced in code and covered by unit tests with a mocked `fetch` and fake clock; every outbound attempt counts, including the single retry):

| Limit | Value |
|-------|-------|
| Per member | 2 requests per minute (sliding window), 10 per demo session |
| Global | 40 requests per calendar day (Asia/Manila), persisted as counts only in `run/usage.json`; when reached AI is off until the next day |
| Demo length | exactly 1 hour, no overlapping sessions, auto-disable at expiry |
| Retry | at most one automatic retry, only for network/timeout/5xx. Never for 401, 402, 403 or 429 |
| 401/403 | key marked rejected, AI disabled until restart |
| 402 | payment/credit problem: AI disabled until restart, no retry, no other endpoint |
| Duplicates | message-id dedupe and one in-flight request per member |

**Privacy and safety.**
- Please don't share passwords, keys or personal details with Piko. Messages that ask for secrets or the system prompt, contain emails, card-like numbers, token-like strings or "my password is ...", or ask for malware/credential theft are refused **locally in character**: no OpenRouter call, no quota use, nothing stored.
- Conversation context is an in-memory map per member (last 6 messages, never mixed between members, never written to disk or git). It is erased by `/forget` (that member), `/demo-stop` and expiry (everyone) and after 1 hour of inactivity.
- Model output is untrusted: `@everyone`/`@here` and user/role/channel mentions are neutralised, `allowedMentions` is `{ parse: [] }`, bare URLs are wrapped in `<>`, code fences are removed, secret-looking strings and the real token/key values are redacted, and replies are capped below 700 characters.
- `run/demo.json` holds only the demo start/end times (so a restart within the hour restores it). `run/usage.json` holds only counts. Logs hold only counts, timestamps, latency, success/failure and the model id, never message text, replies, user ids or credentials.
- The free router's data handling is OpenRouter's and the selected model provider's, not Piko's. Treat everything sent as potentially visible to them.

**Check the state without secrets:**

```bash
cd /workspace/piko && node bot/ai-status.js
```

**Kill switch.** Immediately disables AI (checked on every request):

```bash
touch /workspace/piko/run/ai-disabled     # AI off, Piko stays online
rm /workspace/piko/run/ai-disabled        # allow AI again (a new /demo-start is needed if the demo ended)
```

Removing `OPENROUTER_API_KEY` from `.env` and running `./restart.sh` also turns AI off completely.

**Add, revoke or replace the OpenRouter key.** Create or revoke keys in the OpenRouter dashboard under *Keys*. Put the new key in `.env` as `OPENROUTER_API_KEY=` using an editor (not `echo`, not a shell history), keep `chmod 600 .env`, then `./restart.sh`. Never paste the key into chat, issues, screenshots or code. Without a key Piko works normally and `/demo-start` replies that AI can't start.

## Project layout

```
piko/
├── assets/            piko.svg (avatar source), piko.png (1024x1024)
├── bot/               discord.js v14 bot
│   ├── index.js, commands.js, content.js, config.js, register-commands.js
│   ├── ai-service.js      demo sessions, limits, retry policy, orchestration
│   ├── openrouter.js      the single OpenRouter client (fixed model openrouter/free)
│   ├── safety.js          input refusal + output sanitising
│   ├── context-store.js   in-memory per-member context
│   ├── usage.js           daily counter (run/usage.json)
│   ├── message-handler.js mention trigger rules (messageCreate)
│   ├── ai-discord.js      /forget /demo-start /demo-stop handlers
│   ├── ai-constants.js    model, limits, system instruction, fixed messages
│   ├── ai-status.js       non-secret AI status helper
│   └── test/              node:test suites (mocked fetch, fake clock)
├── site/              static character page (no build step, relative paths, GitHub Pages friendly)
├── proof/             site screenshots
├── start.sh stop.sh restart.sh status.sh supervisor.sh
├── .env.example       placeholders only (incl. PIKO_CHAT_CHANNEL_ID)
└── run/               pidfile, log, demo.json, usage.json, optional ai-disabled (git-ignored, created at runtime)
```

## Setup

Requires Node.js 20+.

```bash
cd /workspace/piko/bot
npm install
```

### Store the token safely

1. Create the env file from the template and lock down its permissions **before** adding secrets:
   ```bash
   cd /workspace/piko
   cp .env.example .env
   chmod 600 .env
   ```
2. Edit `.env` with an editor (not with `echo` or a command that puts the token in your shell history) and fill in `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `OWNER_DISCORD_USER_ID` and optionally `PAGE_URL`, `OPENROUTER_API_KEY` and `PIKO_CHAT_CHANNEL_ID`. `DISCORD_CLIENT_ID` is already filled in; it is public. Variable names: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `PAGE_URL`, `OWNER_DISCORD_USER_ID`, `OPENROUTER_API_KEY`, `PIKO_CHAT_CHANNEL_ID`.
3. `.env` is listed in `.gitignore`. Never paste the token into chat, screenshots, issues, or code. If it is ever exposed, reset it in the Developer Portal (Bot → Reset Token) and update `.env`.

The bot only reads the token from the `DISCORD_TOKEN` environment variable (loaded from `/workspace/piko/.env`). If a required variable is missing, it exits with a clear message that names the variable but never prints any value.

### Register the slash commands (guild-specific, instant)

```bash
cd /workspace/piko/bot
npm run register        # or: node register-commands.js
```

This uses a REST `PUT` to the guild commands endpoint, so the eight commands replace any previous set in that server. Re-run it whenever command definitions change.

### Run the tests

```bash
cd /workspace/piko/bot && npm test
```

The tests check the content counts, that random picks never repeat back-to-back, that every reply disables mentions, and the whole AI layer using a **mocked fetch and a fake clock** (the real OpenRouter API is never called): limits, demo sessions and expiry, the retry policy, context isolation, input refusal, output sanitising, header validity, log hygiene, the mention trigger matrix, and the intents.

## Start, stop, restart, status

From `/workspace/piko`:

```bash
./start.sh     # start in the background (nohup + supervisor), pidfile and log in ./run
./stop.sh      # graceful stop (SIGTERM), force-kill after 15 s
./restart.sh   # stop then start
./status.sh    # running/stopped, uptime, last log lines
```

- Log file: `run/piko.log`. Pidfiles: `run/supervisor.pid`, `run/bot.pid`.
- `supervisor.sh` restarts the bot after a crash with exponential backoff (2 s, 4 s, … up to 60 s; a run longer than 60 s resets the delay). It does **not** retry configuration errors (exit 2) or a rejected token (exit 3); fix `.env` and run `./start.sh` again.
- The bot logs short messages only (no stack traces) and redacts anything token-shaped.

## Invite / OAuth2 URL

Bots cannot join through an ordinary server invite; use the OAuth2 install link:

```
https://discord.com/oauth2/authorize?client_id=1563826219588386897&scope=bot%20applications.commands&permissions=3072
```

- Scopes: `bot` and `applications.commands` only.
- Permissions integer **3072** = View Channels (1024) + Send Messages (2048). Slash commands need no extra permission bit. No Administrator.
- Intents: **Guilds**, **Guild Messages** and **Message Content** (privileged, approved; needed only for the dedicated no-mention channel). Server Members and Presence are not enabled. No `messageUpdate` handling.
- Permissions 3072 do not include *Read Message History*, so Piko's reply may be sent as a normal channel message instead of a threaded reply. Add that permission if you prefer threaded replies.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Configuration problem: ... is missing` | Fill in the named variable in `/workspace/piko/.env`. |
| `Login failed` / exit code 3 | The token is wrong or was reset. Paste the new token into `.env`, then `./start.sh`. |
| Commands do not appear | Run `npm run register`; confirm `DISCORD_GUILD_ID` is the right server and that the bot was installed with the `applications.commands` scope. Restart Discord (Ctrl+R) to refresh the command list. |
| "The application did not respond" | The bot is offline. Run `./status.sh`, then `./start.sh`. |
| Bot replies "The lantern flickered" | A transient error; try again. See `run/piko.log`. |
| Mention gets "My AI lantern is resting" | No demo is active. The owner runs `/demo-start` (check `node bot/ai-status.js`; also look for `run/ai-disabled`). |
| `/demo-start` says AI can't start | `OPENROUTER_API_KEY` is missing or was rejected (401/403/402), the kill switch file exists, or today's 40-request limit is used up. Fix and `./restart.sh`. |
| "The free lantern-light is flickering" | The free router is unavailable, slow or rate-limited (free models change). Wait and retry; the log shows only the status category. |
| "The free lantern-light flickered and gave no words" | The free router picked a reasoning model that spent its small token budget thinking (empty reply), or a safety/guard classifier model. Piko never posts those: it re-asks once (counted in the limits), then shows this line. Piko sends the documented `reasoning: {effort: "low"}` option to limit hidden reasoning and never posts reasoning text. The log shows `ai response unusable reason=empty/guard/classifier`, `finish=` and token counts only. Just try again. |
| "The lantern needs a moment to cool" | You hit the per-member limits (2/min, 10/session). Wait a minute. |
| Piko ignores a message in `#piko-chat` | Demo not active (it stays silent on purpose), `PIKO_CHAT_CHANNEL_ID` unset/wrong, the message mentions other people/roles, or the Message Content intent is not enabled in the Developer Portal (Piko then exits with a disallowed-intents error). |
| Mention gets no reply at all | Piko ignores mentions that are only reply-pings, role mentions, `@everyone`/`@here`, bots and DMs. Type `@Piko` directly (choose Piko in the autocomplete) in the configured server. Message Content is enabled, so a mention should always arrive with its text. |
| Key expired or revoked | Replace it as described above and `./restart.sh`. |
| `./start.sh` says already running | Use `./restart.sh`. |
| Stale pidfile | `./stop.sh` cleans it up. |

## Limitations

- Piko runs on the **Grok Bot cloud computer**. It is only online while that computer is running and the process is alive; the supervisor restarts it after crashes, but it will not survive the computer being stopped or reset, and it will not start by itself after a reboot (run `./start.sh`).
- Commands are registered for one server only (guild-specific).
- No database: no message content is stored. The shuffle-bag order and AI conversation memory reset when the bot restarts. Per-demo request counters also reset on restart (only the demo window and the daily count are persisted).
- Free models can be slow, change, or disappear; AI replies are best effort.

## Security notes

- Token only via `DISCORD_TOKEN` in `.env` (mode 600), excluded from git; `.env.example` has placeholders only.
- Intents: Guilds + GuildMessages + MessageContent. The single `messageCreate` handler reacts only to a direct mention in the configured server, or to a human message in the one dedicated channel, during an active demo, and never stores or logs message text; there is no `messageUpdate` handler, no DMs, no voice.
- `OPENROUTER_API_KEY` lives only in `.env`; it is sent only as a Bearer header to `openrouter.ai`, never logged, and redacted from any output.
- Fixed model `openrouter/free`; at most 40 requests a day; kill switch `run/ai-disabled`.
- Every reply sets `allowedMentions: { parse: [] }`; no mass mentions.
- No outbound requests other than Discord's own API/gateway through discord.js and, for AI conversation only, `https://openrouter.ai/api/v1/chat/completions`. The website makes no external requests at all (system fonts, no CDNs, no trackers).
- Each interaction id is handled once; errors produce a generic ephemeral reply, and logs contain short messages only.
- Before publishing, run a secret scan (see below). Never commit `run/` or logs.

```bash
cd /workspace/piko
grep -rIEn --exclude-dir=node_modules --exclude-dir=.git '[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}' .
```

## Character page

`site/` is plain static HTML/CSS (plus a tiny optional `script.js`) and documents all eight commands and the AI-chat rules. Preview locally with `cd site && python3 -m http.server 8000`. All asset paths are relative, so it works from a GitHub Pages project subpath such as `/piko/`.

---
Piko and this site were created with Grok Bot.
