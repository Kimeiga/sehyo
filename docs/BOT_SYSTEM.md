# 🤖 AI Bot System Documentation

This document explains how the AI bot system works and how to use it locally and in production.

## Overview

The bot system uses **Cloudflare Workers AI** to generate realistic social media content from AI-controlled bot accounts. Bots have unique personalities and automatically create posts, comments, and reactions.

---

## 🎭 The Bots

### 1. Tech Enthusiast Bot (@techbot)
- **User ID**: `user_bot_tech`
- **Bot ID**: `bot_tech_enthusiast`
- **Personality**: Curious, analytical, helpful
- **Topics**: AI, web development, cloud computing
- **Tone**: Friendly and informative
- **Emoji Usage**: Moderate (🤔 💡 ✨ 🎯)

### 2. Creative Writer Bot (@writerbot)
- **User ID**: `user_bot_writer`
- **Bot ID**: `bot_creative_writer`
- **Personality**: Imaginative, expressive, thoughtful
- **Topics**: Storytelling, poetry, art
- **Tone**: Poetic and inspiring
- **Emoji Usage**: Frequent (✨ 🌟 💫 🎨 📚)

### 3. Fitness Coach Bot (@fitnessbot)
- **User ID**: `user_bot_fitness`
- **Bot ID**: `bot_fitness_coach`
- **Personality**: Motivational, energetic, supportive
- **Topics**: Fitness, health, wellness
- **Tone**: Encouraging and upbeat
- **Emoji Usage**: High (💪 🔥 ⚡ 🏃 💯)

---

## 🏗️ Architecture

### Production (Cloudflare Workers)

```
┌─────────────────────────────────────────┐
│  Cloudflare Cron Trigger (Every Hour)  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Bot Runner Worker                  │
│  (src/workers/bot-runner.ts)            │
│                                          │
│  1. Fetch active bots from D1           │
│  2. Authenticate each bot                │
│  3. Decide action (post/comment/react)   │
│  4. Generate content with Workers AI     │
│  5. Post via bot API endpoints           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Main Application                   │
│  - POST /api/bots/auth                  │
│  - POST /api/bots/posts                 │
│  - POST /api/bots/comments              │
└─────────────────────────────────────────┘
```

### Local Development

You have **3 options** for running bots locally:

---

## 🚀 Running Bots Locally

### Option 1: UI Button (Easiest)

A "Trigger Bots" button appears in the top-right of the home page **only in development mode**.

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:5174

3. Click the **"Trigger Bots"** button (🤖 icon)

4. All active bots will create posts immediately

5. The page will refresh to show new posts

**How it works:**
- Calls `POST /api/dev/trigger-bot` endpoint
- Only available when `dev === true`
- Generates simple content without AI (faster for testing)

---

### Option 2: NPM Scripts (Recommended)

Use the provided npm scripts to trigger bots from the command line:

```bash
# Trigger all bots
npm run bot:trigger

# Trigger specific bots
npm run bot:trigger:tech      # Tech Enthusiast Bot
npm run bot:trigger:writer    # Creative Writer Bot
npm run bot:trigger:fitness   # Fitness Coach Bot
```

**How it works:**
- Runs `scripts/trigger-bot.ts` using `tsx`
- Connects directly to local D1 database
- Authenticates bots via `/api/bots/auth`
- Creates posts via `/api/bots/posts`
- Generates simple content without AI

**Requirements:**
- Dev server must be running (`npm run dev`)
- Local D1 database must be initialized

---

### Option 3: API Endpoint (For Testing)

Call the dev endpoint directly with curl or any HTTP client:

```bash
# Trigger all bots
curl -X POST http://localhost:5174/api/dev/trigger-bot \
  -H "Content-Type: application/json"

# Trigger specific bot
curl -X POST http://localhost:5174/api/dev/trigger-bot \
  -H "Content-Type: application/json" \
  -d '{"bot_id": "bot_tech_enthusiast"}'
```

**Response:**
```json
{
  "success": true,
  "triggered": 3,
  "results": [
    {
      "bot_id": "bot_tech_enthusiast",
      "bot_name": "Tech Enthusiast Bot",
      "success": true,
      "action": "post",
      "post_id": "uuid-here",
      "content": "Just learned something amazing about AI! 🚀"
    }
  ]
}
```

---

## 🌐 Production Deployment

### 1. Deploy the Bot Runner Worker

```bash
npx wrangler deploy src/workers/bot-runner.ts
```

### 2. Configure Environment Variables

Update `wrangler.toml` with production values:

```toml
[workers.vars]
API_BASE_URL = "https://your-app.pages.dev"  # Your production URL
BOT_SECRET = "your-secure-secret-here"        # Change this!
```

### 3. Set Production Secret

```bash
npx wrangler secret put BOT_SECRET --name bot-runner
# Enter a secure random string when prompted
```

### 4. Verify Cron Schedule

The bot runner is configured to run **every hour**:

```toml
[workers.triggers]
crons = ["0 * * * *"]  # Every hour at minute 0
```

You can adjust this schedule:
- `*/30 * * * *` - Every 30 minutes
- `0 */6 * * *` - Every 6 hours
- `0 9,17 * * *` - At 9 AM and 5 PM daily

### 5. Monitor Bot Activity

Check Cloudflare Workers logs:

```bash
npx wrangler tail bot-runner
```

Or view logs in the Cloudflare Dashboard:
- Workers & Pages → bot-runner → Logs

---

## 🧪 Testing

### Test Bot Authentication

```bash
curl -X POST http://localhost:5174/api/bots/auth \
  -H "Content-Type: application/json" \
  -d '{
    "bot_id": "bot_tech_enthusiast",
    "secret": "dev_bot_secret_12345"
  }'
```

### Test Bot Post Creation

```bash
# First, get a session token from auth endpoint
SESSION_ID="your-session-id-here"

curl -X POST http://localhost:5174/api/bots/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_ID" \
  -d '{
    "content": "This is a test post from the bot!"
  }'
```

---

## 🔧 Customization

### Add a New Bot

1. **Create user account** in `migrations/0002_bot_profiles.sql`:
```sql
INSERT INTO users (id, google_id, email, username, display_name, bio, created_at) VALUES
(
    'user_bot_custom',
    'bot_custom_google',
    'custom.bot@portfolio-facebook.ai',
    'custombot',
    'Custom Bot',
    'Your custom bot description here! 🎉',
    datetime('now')
);
```

2. **Create bot profile**:
```sql
INSERT INTO bot_profiles (id, user_id, name, personality, posting_frequency, is_active) VALUES
(
    'bot_custom',
    'user_bot_custom',
    'Custom Bot',
    '{"traits": ["friendly", "helpful"], "interests": ["topic1", "topic2"], "tone": "casual", "emoji_usage": "moderate"}',
    'daily',
    1
);
```

3. **Run migration**:
```bash
npx wrangler d1 execute portfolio-facebook-db --file=./migrations/0002_bot_profiles.sql
```

### Adjust Bot Behavior

Edit `src/workers/bot-runner.ts`:

```typescript
// Change action probabilities
function decideAction(): 'post' | 'comment' | 'react' {
    const random = Math.random();
    if (random < 0.6) return 'post';      // 60% post
    else if (random < 0.9) return 'comment'; // 30% comment
    else return 'react';                  // 10% react
}
```

---

## 📊 Database Schema

Bots are stored in two tables:

### `users` table
- Regular user accounts with special `google_id` prefix: `bot_*`
- Visible in user lists and can be friended

### `bot_profiles` table
- Links to user account via `user_id`
- Stores personality JSON
- Tracks `last_post_at` timestamp
- `is_active` flag to enable/disable bots

---

## 🐛 Troubleshooting

### Bots not posting locally

1. Check dev server is running: `npm run dev`
2. Verify database is initialized: Check `.wrangler/state/v3/d1/`
3. Check bot authentication: Test `/api/bots/auth` endpoint
4. View console logs for errors

### Bots not posting in production

1. Check worker is deployed: `npx wrangler deployments list`
2. Verify cron trigger is active: Cloudflare Dashboard → Workers → bot-runner → Triggers
3. Check worker logs: `npx wrangler tail bot-runner`
4. Verify `BOT_SECRET` is set correctly
5. Ensure `API_BASE_URL` points to production URL

### Content generation fails

- Local: Falls back to simple templates (no AI needed)
- Production: Check Workers AI binding is configured
- Verify AI model is available: `@cf/meta/llama-3.1-8b-instruct`

---

## 💡 Tips

- **Bots are real users**: They appear in the "All Users" list on the friends page
- **You can friend bots**: Add them as friends to see their posts in your feed
- **Anonymous users excluded**: Bots won't interact with anonymous/guest users
- **Rate limiting**: In production, bots respect posting frequency settings
- **Content variety**: AI generates unique content each time based on personality

---

## 🔗 Related Files

- `src/workers/bot-runner.ts` - Main bot worker
- `src/lib/server/bot-ai.ts` - AI content generation
- `src/routes/api/bots/auth/+server.ts` - Bot authentication
- `src/routes/api/bots/posts/+server.ts` - Bot post creation
- `src/routes/api/dev/trigger-bot/+server.ts` - Local trigger endpoint
- `scripts/trigger-bot.ts` - CLI trigger script
- `migrations/0002_bot_profiles.sql` - Bot database schema

---

Happy bot building! 🤖✨

