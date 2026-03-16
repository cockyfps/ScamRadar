# 🛡️ ScamRadar — Cross-Server Scam Protection Bot

ScamRadar lets sellers mark scammers once and alert every connected server automatically.

---

## Commands

| Command | Shortform | Description |
|---|---|---|
| `!mark @user <reason>` | `/mark` | Mark a user as scammer (owner only) |
| `!unmark @user` | `/unmark` | Remove from scammer list (owner only) |
| `!profile @user or ID` | `/profile` | View scammer status + info |
| `!scammerlist [page]` | `!sl` / `/sl` | List all marked scammers |
| `!setchannel #channel` | `/setchannel` | Set alert channel (admin only) |
| `!help` | `/help` | Show all commands |

---

## Setup

See the full setup guide in the conversation where this was generated.

## Environment Variables

| Variable | Description |
|---|---|
| `TOKEN` | Your bot token from Discord Developer Portal |
| `OWNER_ID` | Your Discord user ID |
| `PREFIX` | Command prefix (default: `!`) |
