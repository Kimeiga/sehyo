# Quick Start Guide

Get your Portfolio Facebook app running in minutes!

## Option 1: Automated Setup (Recommended)

Run the setup script:

```bash
./scripts/setup.sh
```

This will:
1. Create D1 database
2. Run migrations
3. Create R2 bucket
4. Create KV namespace
5. Install dependencies

Follow the prompts to update `wrangler.toml` and `.dev.vars`.

## Option 2: Manual Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Cloudflare Resources

```bash
# Create D1 database
npx wrangler d1 create portfolio-facebook-db

# Create R2 bucket
npx wrangler r2 bucket create portfolio-facebook-images

# Create KV namespace
npx wrangler kv:namespace create SESSIONS
```

### 3. Update wrangler.toml

Copy the IDs from the commands above and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "portfolio-facebook-db"
database_id = "YOUR_DATABASE_ID_HERE"  # ← Update this

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "portfolio-facebook-images"

[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_KV_NAMESPACE_ID_HERE"  # ← Update this
```

### 4. Run Database Migrations

```bash
npx wrangler d1 execute portfolio-facebook-db --file=./migrations/0001_initial_schema.sql
```

### 5. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:5173/auth/callback`
6. Copy Client ID and Client Secret

### 6. Create .dev.vars

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and add your credentials:

```env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback
```

### 7. Start Development Server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

## Testing the Application

Follow the comprehensive testing checklist in `TESTING.md`.

### Quick Smoke Test

1. **Sign In**: Click "Sign in with Google" and complete OAuth
2. **Create Post**: Type "Hello World!" and click "Post"
3. **React**: Hover over "Like" and click a reaction
4. **Comment**: Click "Comment" and add a comment
5. **Profile**: Click your name to view your profile
6. **Edit Profile**: Click "Edit Profile" and update your info

## What's Implemented

✅ **Authentication** - Google OAuth sign-in
✅ **Posts** - Create, view, delete posts with images
✅ **Reactions** - 6 reaction types for posts and comments
✅ **Comments** - Nested comments up to 3 levels
✅ **Profiles** - View and edit user profiles
✅ **Images** - Upload profile pictures, cover images, and post images

## What's Next

⏳ **Friends** - Friend requests and friend lists
⏳ **Messages** - End-to-end encrypted direct messaging
⏳ **UI Polish** - shadcn components integration
⏳ **Deployment** - Deploy to Cloudflare Pages

## Troubleshooting

### "Database not available"
- Check `wrangler.toml` has correct database ID
- Ensure migrations ran successfully
- Restart dev server

### OAuth errors
- Verify redirect URI matches exactly
- Check `.dev.vars` credentials
- Ensure Google+ API is enabled

### Images not uploading
- Check R2 bucket exists
- Verify file size (max 10MB for posts, 5MB for profile pics)
- Check file type (JPEG, PNG, GIF, WebP only)

### Port already in use
```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Or use a different port
npm run dev -- --port 3000
```

## Project Structure

```
fb-portfolio/
├── src/
│   ├── lib/
│   │   ├── components/      # Reusable components
│   │   ├── server/          # Server-only code
│   │   ├── types.ts         # TypeScript types
│   │   └── crypto.ts        # Encryption utilities
│   ├── routes/
│   │   ├── api/             # API endpoints
│   │   ├── auth/            # Authentication
│   │   ├── profile/         # User profiles
│   │   └── +page.svelte     # Home page
│   └── hooks.server.ts      # Auth middleware
├── migrations/              # Database migrations
├── scripts/                 # Setup scripts
├── wrangler.toml           # Cloudflare config
└── .dev.vars               # Local env vars (not in git)
```

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # Run TypeScript checks
npm run format       # Format code with Prettier
```

## Getting Help

- Check `TESTING.md` for detailed testing procedures
- Check `DEVELOPMENT.md` for development guidelines
- Check `SETUP.md` for detailed setup instructions
- Check browser console for client-side errors
- Check terminal for server-side errors

## Ready to Test?

Follow the testing checklist in `TESTING.md` to verify everything works!

After testing, we'll continue with:
1. Friend system
2. Direct messaging
3. Final polish
4. Deployment

Happy coding! 🚀

