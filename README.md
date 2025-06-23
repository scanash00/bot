# >< Bot

[![Node.js](https://img.shields.io/badge/node-%3E=16.9.0-green?logo=node.js)](https://nodejs.org/) [![CC BY-NC 4.0](https://licensebuttons.net/l/by-nc/4.0/80x15.png)](https://creativecommons.org/licenses/by-nc/4.0/)

A privacy-conscious, production-ready Discord user bot with AI chat, reminders, and utility commands. Built with Node.js, Discord.js v14, PostgreSQL, and robust security best practices.

---

## Features

- **AI Chat**: `/ai` command with custom API key support (OpenRouter, OpenAI, Grok)
- **Reminders**: `/remind` command for scheduling reminders
- **Utilities**: `/weather`, `/wiki`, `/joke`, `/cat`, `/dog`, `/8ball`, `/whois`
- **Ephemeral Replies** for sensitive commands
- **Encrypted API Key Storage** (AES-256-GCM)
- **Rate Limiting & Logging**
- **Express Status Endpoint** for monitoring

---

## Getting Started

### 1. Clone & Install

```sh
git clone https://github.com/scanash00/bot.git
cd bot
bun i
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

- `DISCORD_TOKEN` (your bot token)
- `DATABASE_URL` (Postgres connection string)
- `OPENROUTER_API_KEY` (optional, default AI key)
- `API_KEY_ENCRYPTION_SECRET` (32+ char secret)
- `STATUS_API_KEY` (for status endpoint)
- `ALLOWED_ORIGINS`, `NODE_ENV`, etc.

### 3. Database Migrations

Run all SQL migrations:

```sh
bun run scripts/run-migration.js # or node scripts/run-migration.js
```

---

## Usage

- Start the bot: `bun start`
- Add the bot to your account and use `/ai`, `/remind`, etc.
- Use `/ai use_custom_api:true` to set your own API key (encrypted)

---

## Privacy & Security

- **No plaintext API keys stored or logged**
- **User data is encrypted and can be deleted by user command**
- **No data sold or shared with third parties**
- **See https://bot.pur.cat/legal/privacy for full policy**

---

## Contributing

- PRs welcome! Open issues for bugs/feature requests.
- Follow code style (ESLint, Prettier).
- Add tests for new features.

---

## License

[![CC BY-NC 4.0][cc-by-nc-shield]][cc-by-nc-link]

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License.

You are free to share and adapt the code for non-commercial purposes, provided you give appropriate credit.

See [LICENSE](LICENSE) and [Creative Commons CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) for details.

[cc-by-nc-shield]: https://licensebuttons.net/l/by-nc/4.0/80x15.png
[cc-by-nc-link]: https://creativecommons.org/licenses/by-nc/4.0/

7. Start the bot:
   ```bash
   bun start
   ```

## Usage

- Use `/ai` for AI chat, with optional custom API key for private usage
- Use `/remind` to schedule reminders
- Use utility commands: `/weather`, `/wiki`, `/joke`, `/cat`, `/dog`, `/8ball`, `/whois`
- Sensitive commands use ephemeral replies for privacy
- Use `/ai use_custom_api:true` to set your own (encrypted) API key

---

## Requirements

- Node.js 16.9.0 or higher
- Discord.js 14.11.0
