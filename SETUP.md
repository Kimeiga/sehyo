# Portfolio Facebook - Complete Setup Guide

This guide will walk you through setting up the entire application from scratch.

## Prerequisites

- Node.js 18+ installed
- A Cloudflare account (free tier is sufficient)
- A Google Cloud project for OAuth credentials
- Git installed

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Cloudflare Resources

### 2.1 Create D1 Database

```bash
npx wrangler d1 create portfolio-facebook-db
```

You'll see output like:
```
✅ Successfully created DB 'portfolio-facebook-db'!

[[d1_databases]]
binding = "DB"
database_name = "portfolio-facebook-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` and update it in `wrangler.toml`.

### 2.2 Run Database Migrations

```bash
npx wrangler d1 execute portfolio-facebook-db --file=./migrations/0001_initial_schema.sql
```

This creates all the necessary tables (users, posts, comments, reactions, friendships, messages, etc.).

### 2.3 Create R2 Bucket for Images

```bash
npx wrangler r2 bucket create portfolio-facebook-images
```

The bucket name is already configured in `wrangler.toml`.

### 2.4 Create KV Namespace for Sessions

```bash
npx wrangler kv:namespace create SESSIONS
```

You'll see output like:
```
🌀 Creating namespace with title "fb-portfolio-SESSIONS"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "SESSIONS", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

Copy the `id` and update it in `wrangler.toml`.

## Step 3: Set Up Google OAuth

### 3.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter project name (e.g., "Portfolio Facebook")
4. Click "Create"

### 3.2 Enable Google+ API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Google+ API"
3. Click on it and click "Enable"

### 3.3 Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - User Type: External
   - App name: Portfolio Facebook
   - User support email: your email
   - Developer contact: your email
   - Click "Save and Continue" through the scopes and test users
4. Back to "Create OAuth client ID":
   - Application type: Web application
   - Name: Portfolio Facebook
   - Authorized JavaScript origins: 
     - `http://localhost:5173` (for development)
     - Your production URL (e.g., `https://your-app.pages.dev`)
   - Authorized redirect URIs:
     - `http://localhost:5173/auth/callback` (for development)
     - `https://your-app.pages.dev/auth/callback` (for production)
5. Click "Create"
6. Copy the Client ID and Client Secret

## Step 4: Configure Environment Variables

### 4.1 For Local Development

Create a `.dev.vars` file in the root directory:

```env
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback
```

### 4.2 For Production

Set these as secrets in Cloudflare:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
# Paste your client ID when prompted

npx wrangler secret put GOOGLE_CLIENT_SECRET
# Paste your client secret when prompted

npx wrangler secret put GOOGLE_REDIRECT_URI
# Enter your production callback URL (e.g., https://your-app.pages.dev/auth/callback)
```

## Step 5: Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Testing Authentication

1. Open `http://localhost:5173`
2. Click "Sign in with Google"
3. You'll be redirected to Google's OAuth consent screen
4. Sign in with your Google account
5. You'll be redirected back to the app and logged in

## Step 6: Building for Production

Build the application:

```bash
npm run build
```

This creates a production build in `.svelte-kit/cloudflare`.

## Step 7: Deployment

### Option A: Deploy with Wrangler

```bash
npx wrangler pages deploy .svelte-kit/cloudflare
```

### Option B: Deploy via Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to "Workers & Pages"
3. Click "Create application" → "Pages" → "Connect to Git"
4. Connect your GitHub repository
5. Configure build settings:
   - Build command: `npm run build`
   - Build output directory: `.svelte-kit/cloudflare`
6. Add environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
7. Click "Save and Deploy"

### Option C: Automatic Deployments

Connect your GitHub repository to Cloudflare Pages for automatic deployments on every push to main.

## Troubleshooting

### Database Connection Issues

If you see database errors, ensure:
1. The database ID in `wrangler.toml` matches your created database
2. Migrations have been run successfully
3. You're using the correct binding name ("DB")

### OAuth Errors

If authentication fails:
1. Check that redirect URIs match exactly (including http/https)
2. Verify Client ID and Client Secret are correct
3. Ensure Google+ API is enabled
4. Check that the OAuth consent screen is configured

### Build Errors

If the build fails:
1. Run `npm install` to ensure all dependencies are installed
2. Check that TypeScript types are generated: `npm run check`
3. Clear the build cache: `rm -rf .svelte-kit`

## Next Steps

Now that the infrastructure is set up, you can:

1. Implement post creation with image uploads
2. Add the comment system
3. Build the reaction system
4. Create the friend request functionality
5. Implement direct messaging
6. Design user profile pages
7. Add shadcn-svelte components
8. Create a responsive navigation bar
9. Add loading states and error handling
10. Write tests

## Cloudflare Free Tier Limits

Your application will stay within these limits:

- **D1**: 10 databases, 500MB each, 5GB total
- **R2**: 10GB storage, 1M Class A ops, 10M Class B ops per month
- **Workers**: 100,000 requests per day
- **Pages**: Unlimited requests

## Support

If you encounter issues:
1. Check the Cloudflare Workers documentation
2. Review SvelteKit documentation
3. Check the project's GitHub issues
4. Consult Cloudflare community forums

## Security Notes

- Never commit `.dev.vars` to version control (it's in `.gitignore`)
- Use Cloudflare secrets for production environment variables
- The session cookie is httpOnly and secure in production
- Messages are end-to-end encrypted using Web Crypto API
- Private keys are stored in localStorage (consider more secure storage for production)

## Performance Tips

- Images are stored in R2 and served via Cloudflare's CDN
- Database queries are optimized with indexes
- The app runs on Cloudflare's edge network for low latency
- Static assets are cached aggressively

Good luck building your social media application!

