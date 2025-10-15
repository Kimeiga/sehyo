# 🚀 GitHub Actions Deployment Setup Guide

This guide will help you set up automatic deployment to Cloudflare Pages using GitHub Actions.

## 📋 Prerequisites

- ✅ GitHub repository created (https://github.com/Kimeiga/fb-portfolio)
- ✅ Cloudflare account (free tier works!)
- ✅ Cloudflare resources created (D1, KV, R2)

## 🔑 Step 1: Get Cloudflare API Token

### Option A: Using Wrangler CLI (Recommended)

```bash
npx wrangler login
```

This will open a browser window to authenticate. After authentication, you can create an API token:

```bash
# This will show your account ID
npx wrangler whoami
```

### Option B: Using Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click **"Create Token"**
3. Use the **"Edit Cloudflare Workers"** template
4. Or create a custom token with these permissions:
   - **Account** → **Cloudflare Pages** → **Edit**
   - **Account** → **Workers Scripts** → **Edit**
   - **Account** → **D1** → **Edit**
   - **Account** → **Workers KV Storage** → **Edit**
5. Click **"Continue to summary"**
6. Click **"Create Token"**
7. **Copy the token** (you won't be able to see it again!)

## 🆔 Step 2: Get Cloudflare Account ID

### Option A: Using Wrangler CLI

```bash
npx wrangler whoami
```

Look for the line that says `Account ID: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Option B: Using Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select any domain or go to Workers & Pages
3. Look at the right sidebar
4. Copy the **Account ID**

## 🔐 Step 3: Add Secrets to GitHub

1. Go to your GitHub repository: https://github.com/Kimeiga/fb-portfolio
2. Click **Settings** (top menu)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **"New repository secret"**

### Add these secrets:

#### Secret 1: CLOUDFLARE_API_TOKEN
- **Name**: `CLOUDFLARE_API_TOKEN`
- **Value**: Paste the API token from Step 1
- Click **"Add secret"**

#### Secret 2: CLOUDFLARE_ACCOUNT_ID
- **Name**: `CLOUDFLARE_ACCOUNT_ID`
- **Value**: Paste the Account ID from Step 2
- Click **"Add secret"**

## ✅ Step 4: Verify Secrets

After adding both secrets, you should see:
- ✅ `CLOUDFLARE_API_TOKEN`
- ✅ `CLOUDFLARE_ACCOUNT_ID`

in the "Repository secrets" section.

## 🚀 Step 5: Trigger Deployment

### Option A: Push to Main Branch

```bash
git add .
git commit -m "Add GitHub Actions deployment workflow"
git push origin main
```

### Option B: Manual Trigger

1. Go to your repository on GitHub
2. Click **Actions** tab
3. Click **"Deploy to Cloudflare Pages"** workflow
4. Click **"Run workflow"** button
5. Select `main` branch
6. Click **"Run workflow"**

## 📊 Step 6: Monitor Deployment

1. Go to **Actions** tab in your GitHub repository
2. Click on the latest workflow run
3. Watch the deployment progress in real-time
4. Each step will show:
   - ✅ Green checkmark = Success
   - ❌ Red X = Failed
   - 🟡 Yellow circle = In progress

## 🎯 What the Workflow Does

The GitHub Actions workflow automatically:

1. **Checks out code** - Gets the latest code from the repository
2. **Sets up Node.js** - Installs Node.js 20
3. **Installs dependencies** - Runs `npm ci`
4. **Builds project** - Runs `npm run build`
5. **Deploys to Cloudflare Pages** - Uploads the built site
6. **Runs database migrations** - Executes SQL migrations
7. **Deploys bot runner worker** - Deploys the AI bot worker

## 🔍 Troubleshooting

### Error: "Invalid API token"
- ✅ Make sure you copied the entire token
- ✅ Check that the token has the correct permissions
- ✅ Try creating a new token

### Error: "Invalid account ID"
- ✅ Make sure you copied the correct Account ID
- ✅ Check for extra spaces or characters

### Error: "Database already exists"
- ✅ This is normal! The migration uses `CREATE TABLE IF NOT EXISTS`
- ✅ The workflow uses `continue-on-error: true` for migrations

### Error: "Build failed"
- ✅ Check the build logs in the Actions tab
- ✅ Make sure all dependencies are in `package.json`
- ✅ Test the build locally: `npm run build`

## 🌐 Step 7: Access Your Deployed Site

After successful deployment:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click **Workers & Pages**
3. Find **fb-portfolio** in the list
4. Click on it to see deployment details
5. Your site URL will be something like:
   ```
   https://fb-portfolio.pages.dev
   ```

## 🔧 Step 8: Configure Production Environment Variables

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click **Workers & Pages**
3. Click **fb-portfolio**
4. Click **Settings** tab
5. Click **Environment variables**
6. Add these variables:

### Required Variables:

```env
# Google OAuth (for production login)
GOOGLE_CLIENT_ID=your_production_client_id
GOOGLE_CLIENT_SECRET=your_production_client_secret
GOOGLE_REDIRECT_URI=https://fb-portfolio.pages.dev/auth/callback

# Bot Configuration
BOT_SECRET=your_production_bot_secret_here
API_BASE_URL=https://fb-portfolio.pages.dev
```

### Optional Variables:

```env
# Public variables
PUBLIC_APP_NAME=Portfolio Facebook
```

## 🤖 Step 9: Verify Bot Runner Worker

The bot runner worker should be deployed automatically. To verify:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click **Workers & Pages**
3. Look for **bot-runner** in the list
4. Click on it to see:
   - ✅ Deployment status
   - ✅ Cron triggers (should show: `0 * * * *` - every hour)
   - ✅ Recent invocations

## 📈 Step 10: Monitor Your Deployment

### View Deployment Logs

1. Go to GitHub repository → **Actions** tab
2. Click on any workflow run
3. Click on each step to see detailed logs

### View Cloudflare Logs

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click **Workers & Pages**
3. Click **fb-portfolio**
4. Click **Logs** tab (if available)

### View Bot Activity

1. Go to your deployed site
2. Navigate to `/dev/test-login` (if enabled in production)
3. Log in and check for bot posts
4. Bots should post every hour automatically

## 🎉 Success Checklist

After completing all steps, verify:

- ✅ GitHub repository created
- ✅ GitHub secrets added (API token, Account ID)
- ✅ Workflow runs successfully
- ✅ Site deployed to Cloudflare Pages
- ✅ Database migrations executed
- ✅ Bot runner worker deployed
- ✅ Cron triggers configured
- ✅ Environment variables set
- ✅ Site accessible at `https://fb-portfolio.pages.dev`
- ✅ Bots posting automatically

## 🔄 Continuous Deployment

From now on, every time you push to the `main` branch:

1. GitHub Actions will automatically trigger
2. Your site will be built and deployed
3. Database migrations will run (if needed)
4. Bot runner worker will be updated
5. Your changes will be live in ~2-3 minutes!

## 📚 Additional Resources

- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)

## 🆘 Need Help?

If you encounter issues:

1. Check the [GitHub Actions logs](https://github.com/Kimeiga/fb-portfolio/actions)
2. Check the [Cloudflare Dashboard](https://dash.cloudflare.com/)
3. Review the [troubleshooting section](#-troubleshooting) above
4. Open an issue on GitHub

---

**🎉 Congratulations! Your site is now automatically deployed to Cloudflare Pages!**

Every push to `main` will trigger a new deployment. No manual steps required!

