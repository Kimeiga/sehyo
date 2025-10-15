# Cloudflare Setup Complete! ✅

## What's Been Set Up

### ✅ D1 Database
- **Name**: `portfolio-facebook-db`
- **ID**: `d827cbae-592f-41b5-80e8-e06ccb610bee`
- **Region**: ENAM (Eastern North America)
- **Status**: ✅ Created and migrated
- **Tables**: 8 tables created (users, posts, comments, reactions, friendships, messages, user_keys, sessions)
- **Rows**: 49 rows written (schema + indexes)

### ✅ KV Namespace
- **Name**: `SESSIONS`
- **ID**: `bc491214935341a9b88984146caebddb`
- **Status**: ✅ Created
- **Purpose**: Session storage for user authentication

### ⚠️ R2 Bucket (Needs Manual Setup)
- **Name**: `portfolio-facebook-images`
- **Status**: ❌ Needs to be enabled in Cloudflare Dashboard
- **Purpose**: Image storage for posts, profiles, and cover images

## Next Steps

### 1. Enable R2 in Cloudflare Dashboard

R2 needs to be enabled manually in your Cloudflare account:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your account
3. Navigate to **R2** in the left sidebar
4. Click **"Enable R2"** or **"Get Started"**
5. Accept the terms and conditions
6. Once enabled, create the bucket:
   ```bash
   npx wrangler r2 bucket create portfolio-facebook-images
   ```

**Note**: R2 is free for the first 10GB of storage and 1 million Class A operations per month.

### 2. Set Up Google OAuth

You need to create OAuth credentials in Google Cloud Console:

#### Step 1: Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Name it something like "Portfolio Facebook"

#### Step 2: Enable Google+ API
1. In the Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Google+ API"
3. Click on it and click **"Enable"**

#### Step 3: Create OAuth 2.0 Credentials
1. Go to **APIs & Services** > **Credentials**
2. Click **"Create Credentials"** > **"OAuth client ID"**
3. If prompted, configure the OAuth consent screen:
   - User Type: **External**
   - App name: **Portfolio Facebook**
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add `email` and `profile`
   - Test users: Add your email
4. Application type: **Web application**
5. Name: **Portfolio Facebook Web Client**
6. Authorized redirect URIs:
   - For local development: `http://localhost:5173/auth/callback`
   - For production: `https://your-domain.pages.dev/auth/callback`
7. Click **"Create"**
8. Copy the **Client ID** and **Client Secret**

#### Step 4: Create .dev.vars File
Create a `.dev.vars` file in the project root:

```env
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback
```

**Important**: Never commit `.dev.vars` to git! It's already in `.gitignore`.

### 3. Test Locally

Once you've set up Google OAuth and created `.dev.vars`:

```bash
# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`

### 4. Test the Application

Follow the testing checklist in `TESTING.md`:

1. **Authentication**:
   - Sign in with Google
   - Verify session persistence
   - Sign out

2. **Posts**:
   - Create text posts
   - Upload images (will fail until R2 is enabled)
   - Delete posts
   - React to posts

3. **Comments**:
   - Add comments
   - Reply to comments
   - React to comments
   - Delete comments

4. **Profiles**:
   - View your profile
   - Edit profile info
   - Upload profile picture (will fail until R2 is enabled)
   - Upload cover image (will fail until R2 is enabled)

5. **Friends**:
   - Search for users
   - Send friend requests
   - Accept/reject requests
   - View friends list
   - Unfriend users

### 5. Deploy to Cloudflare Pages

Once everything is tested locally:

```bash
# Build the project
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy .svelte-kit/cloudflare
```

Or set up automatic deployments:
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Pages**
3. Click **"Create a project"**
4. Connect your GitHub repository
5. Configure build settings:
   - Build command: `npm run build`
   - Build output directory: `.svelte-kit/cloudflare`
6. Add environment variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (use your Pages URL)
7. Deploy!

## Current Configuration

### wrangler.toml
```toml
name = "portfolio-facebook"
compatibility_date = "2024-01-01"
pages_build_output_dir = ".svelte-kit/cloudflare"

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "portfolio-facebook-db"
database_id = "d827cbae-592f-41b5-80e8-e06ccb610bee"

# R2 Bucket binding for image uploads
[[r2_buckets]]
binding = "IMAGES"
bucket_name = "portfolio-facebook-images"

# KV namespace for sessions
[[kv_namespaces]]
binding = "SESSIONS"
id = "bc491214935341a9b88984146caebddb"

[vars]
# Public environment variables
PUBLIC_APP_NAME = "Portfolio Facebook"
```

## Troubleshooting

### R2 Bucket Creation Fails
**Error**: "Please enable R2 through the Cloudflare Dashboard"
**Solution**: Follow Step 1 above to enable R2 in the dashboard

### OAuth Redirect Fails
**Error**: "redirect_uri_mismatch"
**Solution**: Make sure the redirect URI in Google Console exactly matches the one in `.dev.vars`

### Database Not Available
**Error**: "Database not available"
**Solution**: 
- Check that `wrangler.toml` has the correct database ID
- Restart the dev server
- Verify migrations ran successfully

### Session Errors
**Error**: "Unauthorized" or session issues
**Solution**:
- Clear browser cookies
- Check that KV namespace ID is correct in `wrangler.toml`
- Verify `.dev.vars` has correct OAuth credentials

## Resources

- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Cloudflare KV Docs](https://developers.cloudflare.com/kv/)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Google OAuth Setup](https://developers.google.com/identity/protocols/oauth2)

## Summary

✅ **Completed**:
- D1 database created and migrated
- KV namespace created
- wrangler.toml configured

⚠️ **Manual Steps Required**:
1. Enable R2 in Cloudflare Dashboard
2. Create R2 bucket
3. Set up Google OAuth credentials
4. Create `.dev.vars` file

🚀 **Ready to Test**:
Once you complete the manual steps, you can start the dev server and test all features!

