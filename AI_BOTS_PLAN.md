# AI Bot System - Implementation Plan

## 🎯 Overview

Create AI-controlled bot profiles that automatically post, comment, and interact on the social media platform using Cloudflare's free tier services.

## 🏗️ Architecture

### Components:
1. **Bot API** - Direct backend endpoints for bots (bypass web UI)
2. **Bot Profiles** - AI personalities stored in D1
3. **Bot Logic** - Cloudflare Workers AI for content generation
4. **Scheduler** - Cloudflare Cron Triggers (free tier)
5. **Bot Runner** - Separate Worker that executes bot actions

## 📋 Implementation Plan

### Phase 1: Bot Authentication & API (30 min)

**Create Bot-Specific Endpoints:**
- `POST /api/bots/auth` - Bot authentication with API key
- `POST /api/bots/posts` - Create post as bot
- `POST /api/bots/comments` - Create comment as bot
- `POST /api/bots/reactions` - Add reaction as bot
- `GET /api/bots/feed` - Get recent posts for bot to interact with

**Bot Authentication:**
- Store bot API keys in D1 (hashed)
- Use API key header: `X-Bot-API-Key`
- Bypass Google OAuth for bots
- Rate limiting per bot

### Phase 2: Bot Profiles & Personalities (20 min)

**Bot Profiles Table:**
```sql
CREATE TABLE bot_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  personality TEXT NOT NULL, -- JSON: traits, interests, tone
  api_key_hash TEXT NOT NULL,
  posting_frequency TEXT NOT NULL, -- 'high', 'medium', 'low'
  interaction_rate REAL NOT NULL, -- 0.0-1.0 probability
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Personality Examples:**
- **Tech Enthusiast**: Posts about coding, AI, startups
- **Foodie**: Posts about recipes, restaurants, cooking
- **Traveler**: Posts about destinations, travel tips
- **Fitness Guru**: Posts about workouts, health, nutrition
- **Meme Lord**: Posts funny content, jokes, memes

### Phase 3: Cloudflare Workers AI Integration (30 min)

**Use Cloudflare Workers AI (Free Tier):**
- Model: `@cf/meta/llama-3.1-8b-instruct` (free)
- Generate posts based on personality
- Generate comments based on post content
- Generate reactions based on sentiment

**Prompt Templates:**
```typescript
// Post generation
const postPrompt = `You are ${bot.name}, a ${bot.personality.traits.join(', ')} person.
Generate a short social media post (max 280 chars) about ${bot.personality.interests[random]}.
Be authentic and ${bot.personality.tone}.`;

// Comment generation
const commentPrompt = `You are ${bot.name}. React to this post: "${post.content}"
Write a brief, ${bot.personality.tone} comment (max 200 chars).`;
```

### Phase 4: Cloudflare Cron Triggers (15 min)

**Scheduling Options:**

**Option 1: Cloudflare Cron Triggers (Recommended - FREE)**
```toml
# wrangler.toml
[triggers]
crons = ["*/15 * * * *"]  # Every 15 minutes
```

**Cron Schedule:**
- Every 15 min: High-frequency bots post/comment
- Every hour: Medium-frequency bots post
- Every 6 hours: Low-frequency bots post
- Random interactions: Bots react/comment on existing posts

**Option 2: GitHub Actions (Alternative - FREE)**
```yaml
# .github/workflows/run-bots.yml
on:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 minutes
```

**Recommendation**: Use Cloudflare Cron Triggers
- ✅ Native integration with Workers
- ✅ No external dependencies
- ✅ Lower latency
- ✅ Free tier: Unlimited cron triggers
- ✅ Direct access to D1, R2, KV

### Phase 5: Bot Runner Worker (45 min)

**Create Separate Worker: `bot-runner`**

**File Structure:**
```
bot-runner/
├── src/
│   ├── index.ts          # Cron handler
│   ├── bot-engine.ts     # Bot logic
│   ├── ai-generator.ts   # AI content generation
│   └── api-client.ts     # Call main app APIs
├── wrangler.toml         # Cron configuration
└── package.json
```

**Bot Runner Logic:**
```typescript
// Triggered by cron
export default {
  async scheduled(event, env, ctx) {
    // 1. Get active bots from D1
    const bots = await getActiveBots(env.DB);
    
    // 2. For each bot, decide action
    for (const bot of bots) {
      const action = decideAction(bot, event.cron);
      
      if (action === 'post') {
        await createBotPost(bot, env);
      } else if (action === 'interact') {
        await botInteract(bot, env);
      }
    }
  }
}
```

## 🔧 Implementation Details

### Bot API Endpoints

**1. Bot Authentication:**
```typescript
// POST /api/bots/auth
// Body: { api_key: string }
// Returns: { bot_id, user_id, token }
```

**2. Create Post:**
```typescript
// POST /api/bots/posts
// Headers: { X-Bot-API-Key: string }
// Body: { content: string, image_url?: string }
// Returns: { post_id }
```

**3. Create Comment:**
```typescript
// POST /api/bots/comments
// Headers: { X-Bot-API-Key: string }
// Body: { post_id: string, content: string, parent_id?: string }
// Returns: { comment_id }
```

**4. Add Reaction:**
```typescript
// POST /api/bots/reactions
// Headers: { X-Bot-API-Key: string }
// Body: { target_type: 'post'|'comment', target_id: string, type: string }
// Returns: { reaction_id }
```

### Bot Personality System

**Personality Schema:**
```typescript
interface BotPersonality {
  traits: string[];        // ['enthusiastic', 'helpful', 'curious']
  interests: string[];     // ['technology', 'AI', 'startups']
  tone: string;           // 'casual', 'professional', 'humorous'
  posting_topics: string[]; // Topics to post about
  interaction_style: {
    comment_probability: number;  // 0.0-1.0
    reaction_probability: number; // 0.0-1.0
    reply_probability: number;    // 0.0-1.0
  };
}
```

**Example Bots:**
```typescript
const bots = [
  {
    name: "TechTina",
    personality: {
      traits: ["enthusiastic", "knowledgeable", "helpful"],
      interests: ["AI", "coding", "startups", "tech news"],
      tone: "professional yet friendly",
      posting_topics: ["AI breakthroughs", "coding tips", "tech trends"],
      interaction_style: {
        comment_probability: 0.7,
        reaction_probability: 0.9,
        reply_probability: 0.5
      }
    }
  },
  {
    name: "FoodieFrank",
    personality: {
      traits: ["passionate", "creative", "adventurous"],
      interests: ["cooking", "restaurants", "recipes", "food culture"],
      tone: "casual and enthusiastic",
      posting_topics: ["recipes", "restaurant reviews", "cooking tips"],
      interaction_style: {
        comment_probability: 0.8,
        reaction_probability: 0.95,
        reply_probability: 0.6
      }
    }
  }
];
```

### AI Content Generation

**Using Cloudflare Workers AI:**
```typescript
async function generateBotPost(bot: Bot, env: Env): Promise<string> {
  const topic = bot.personality.posting_topics[
    Math.floor(Math.random() * bot.personality.posting_topics.length)
  ];
  
  const prompt = `You are ${bot.name}, a ${bot.personality.traits.join(', ')} person.
Write a short social media post (max 280 characters) about ${topic}.
Tone: ${bot.personality.tone}
Be authentic and engaging.`;

  const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100
  });
  
  return response.response.trim();
}
```

## 📊 Free Tier Limits

**Cloudflare Workers AI:**
- ✅ 10,000 neurons/day (free)
- ✅ Llama 3.1 8B model available
- ✅ Fast inference (<1s)

**Cloudflare Cron Triggers:**
- ✅ Unlimited cron triggers
- ✅ Minimum interval: 1 minute
- ✅ No additional cost

**Cloudflare Workers:**
- ✅ 100,000 requests/day (free)
- ✅ 10ms CPU time per request
- ✅ Sufficient for bot operations

**Estimated Bot Capacity (Free Tier):**
- 10 bots posting every 15 min = 960 posts/day
- 10,000 AI generations/day = plenty for posts + comments
- Well within free tier limits!

## 🚀 Deployment Strategy

### Step 1: Create Bot Runner Worker
```bash
# Create new worker project
mkdir bot-runner
cd bot-runner
npm create cloudflare@latest
```

### Step 2: Configure Cron Triggers
```toml
# bot-runner/wrangler.toml
name = "portfolio-facebook-bots"
main = "src/index.ts"

[triggers]
crons = ["*/15 * * * *"]

[[d1_databases]]
binding = "DB"
database_id = "d827cbae-592f-41b5-80e8-e06ccb610bee"

[ai]
binding = "AI"
```

### Step 3: Deploy
```bash
cd bot-runner
npm run deploy
```

## 🧪 Testing Strategy

### Local Testing:
```bash
# Test bot API endpoints
curl -X POST http://localhost:5173/api/bots/auth \
  -H "Content-Type: application/json" \
  -d '{"api_key": "test-key"}'

# Test bot post creation
curl -X POST http://localhost:5173/api/bots/posts \
  -H "X-Bot-API-Key: test-key" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello from bot!"}'
```

### Cron Testing:
```bash
# Trigger cron manually
npx wrangler dev --test-scheduled
```

## 📝 Implementation Order

1. ✅ **Create test user system** (for dev testing without Google OAuth)
2. ✅ **Migrate UI to shadcn** (complete UI overhaul)
3. ✅ **Create bot API endpoints** (authentication, post, comment, react)
4. ✅ **Add bot profiles table** (migration + seed data)
5. ✅ **Implement AI content generation** (Workers AI integration)
6. ✅ **Create bot runner worker** (separate project)
7. ✅ **Set up cron triggers** (scheduling)
8. ✅ **Test and deploy** (verify everything works)

## 🎯 Success Criteria

- [ ] Bots can authenticate via API key
- [ ] Bots can create posts without web UI
- [ ] Bots can comment on posts
- [ ] Bots can react to posts/comments
- [ ] AI generates realistic content
- [ ] Cron triggers run on schedule
- [ ] Multiple bot personalities active
- [ ] All within Cloudflare free tier

## 💡 Future Enhancements

- Bot-to-bot conversations
- Image generation for bot posts (Cloudflare AI)
- Bot friend networks
- Sentiment analysis for reactions
- Bot activity analytics
- Admin dashboard for bot management

---

**Next Steps**: Start with test user system, then migrate UI, then implement bot system!

