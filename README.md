# Piko — The Lantern Fox

Piko is a small digital fox born inside the final glowing pixel of a forgotten website. Piko travels between abandoned web pages, collecting lost ideas, unfinished projects, and story fragments in a magical lantern, then hands out **creative sparks** and **small, achievable quests** on Discord.

Piko is a bot, never pretends to be human, and only answers slash commands. It does not read messages, send DMs, join voice, or collect any data.

| Command  | What it does |
|----------|--------------|
| `/hello` | Piko introduces itself. |
| `/lore`  | One random piece of Piko's backstory (10 entries). |
| `/quest` | One small, safe creative quest, 10–30 minutes (14 entries). |
| `/spark` | A short creative prompt or project idea (13 entries). |
| `/about` | Short description, character page link, server invite, and a note that Piko was created with Grok Bot. |

`/lore`, `/quest`, and `/spark` use a shuffle-bag: every entry is shown once before any repeats, and the same entry never appears twice in a row.

## Project layout

```
piko/
├── assets/            piko.svg (avatar source), piko.png (1024x1024)
├── bot/               discord.js v14 bot (index.js, register-commands.js, content.js, ...)
├── site/              static character page (no build step, relative paths, GitHub Pages friendly)
├── proof/             site screenshots
├── start.sh stop.sh restart.sh status.sh supervisor.sh
├── .env.example       placeholders only
└── run/               pidfile + log (git-ignored, created at runtime)
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
2. Edit `.env` with an editor (not with `echo` or a command that puts the token in your shell history) and fill in `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, and optionally `PAGE_URL`. `DISCORD_CLIENT_ID` is already filled in; it is public.
3. `.env` is listed in `.gitignore`. Never paste the token into chat, screenshots, issues, or code. If it is ever exposed, reset it in the Developer Portal (Bot → Reset Token) and update `.env`.

The bot only reads the token from the `DISCORD_TOKEN` environment variable (loaded from `/workspace/piko/.env`). If a required variable is missing, it exits with a clear message that names the variable but never prints any value.

### Register the slash commands (guild-specific, instant)

```bash
cd /workspace/piko/bot
npm run register        # or: node register-commands.js
```

This uses a REST `PUT` to the guild commands endpoint, so the five commands replace any previous set in that server. Re-run it whenever command definitions change.

### Run the tests

```bash
cd /workspace/piko/bot && npm test
```

The tests check the content counts (≥8 lore, ≥12 quests, ≥12 sparks), that random picks never repeat back-to-back, and that every reply disables mentions.

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
- Intents: only **Guilds**. No privileged intents (Message Content, Server Members, Presence) are needed or enabled.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Configuration problem: ... is missing` | Fill in the named variable in `/workspace/piko/.env`. |
| `Login failed` / exit code 3 | The token is wrong or was reset. Paste the new token into `.env`, then `./start.sh`. |
| Commands do not appear | Run `npm run register`; confirm `DISCORD_GUILD_ID` is the right server and that the bot was installed with the `applications.commands` scope. Restart Discord (Ctrl+R) to refresh the command list. |
| "The application did not respond" | The bot is offline. Run `./status.sh`, then `./start.sh`. |
| Bot replies "The lantern flickered" | A transient error; try again. See `run/piko.log`. |
| `./start.sh` says already running | Use `./restart.sh`. |
| Stale pidfile | `./stop.sh` cleans it up. |

## Limitations

- Piko runs on the **Grok Bot cloud computer**. It is only online while that computer is running and the process is alive; the supervisor restarts it after crashes, but it will not survive the computer being stopped or reset, and it will not start by itself after a reboot (run `./start.sh`).
- Commands are registered for one server only (guild-specific).
- No database: nothing is stored, and the shuffle-bag order resets when the bot restarts.

## Security notes

- Token only via `DISCORD_TOKEN` in `.env` (mode 600), excluded from git; `.env.example` has placeholders only.
- Only the Guilds intent; no `messageCreate` handler, no DMs, no voice.
- Every reply sets `allowedMentions: { parse: [] }`; no mass mentions.
- No outbound requests other than Discord's own API/gateway through discord.js. The website makes no external requests at all (system fonts, no CDNs, no trackers).
- Each interaction id is handled once; errors produce a generic ephemeral reply, and logs contain short messages only.
- Before publishing, run a secret scan (see below). Never commit `run/` or logs.

```bash
cd /workspace/piko
grep -rIEn --exclude-dir=node_modules --exclude-dir=.git '[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}' .
```

## Character page

`site/` is plain static HTML/CSS (plus a tiny optional `script.js`). Preview locally with `cd site && python3 -m http.server 8000`. All asset paths are relative, so it works from a GitHub Pages project subpath such as `/piko/`.

---
Piko and this site were created with Grok Bot.
