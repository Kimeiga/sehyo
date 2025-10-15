# Deployment Guide

This guide covers deploying the Facebook Portfolio app to Cloudflare Pages with all required services.

## Prerequisites

- Cloudflare account (free tier works!)
- Google Cloud Console project with OAuth credentials
- GitHub repository with the code

## Required Secrets

The deployment requires 5 GitHub secrets to be configured:

### 1. Cloudflare Secrets

#### `CLOUDFLARE_API_TOKEN`
- **What**: API token for deploying to Cloudflare
- **How to get**:
  1. Go to https://dash.cloudflare.com/profile/api-tokens
  2. Click "Create Token"
  3. Use the "Edit Cloudflare Workers" template
  4. Add these permissions:
     - Account > Cloudflare Pages > Edit
     - Account > D1 > Edit
     - Account > Workers Scripts > Edit
  5. Click "Continue to summary" → "Create Token"
  6. Copy the token (you won't see it again!)

#### `CLOUDFLARE_ACCOUNT_ID`
- **What**: Your Cloudflare account ID
- **How to get**:
  1. Go to https://dash.cloudflare.com
  2. Click on "Workers & Pages" in the left sidebar
  3. Your Account ID is shown in the right sidebar
  4. Or check the URL: `https://dash.cloudflare.com/<ACCOUNT_ID>/...`

### 2. Google OAuth Secrets

#### `GOOGLE_CLIENT_ID`
- **What**: OAuth 2.0 Client ID for Google Sign-In
- **How to get**:
  1. Go to https://console.cloud.google.com/apis/credentials
  2. Select your project (or create one)
  3. Click "Create Credentials" → "OAuth client ID"
  4. Application type: "Web application"
  5. Add authorized redirect URIs:
     - `http://localhost:5173/auth/callback` (for local dev)
     - `https://fb-portfolio.pages.dev/auth/callback` (for production)
     - `https://your-custom-domain.com/auth/callback` (if using custom domain)
  6. Copy the Client ID

#### `GOOGLE_CLIENT_SECRET`
- **What**: OAuth 2.0 Client Secret for Google Sign-In
- **How to get**: Same as Client ID above - it's shown when you create the OAuth client

#### `GOOGLE_REDIRECT_URI`
- **What**: Production callback URL for Google OAuth
- **Value**: `https://fb-portfolio.pages.dev/auth/callback`
- **Note**: Update this if you use a custom domain

## Quick Setup Script

We've created a script to help you set up all secrets at once:

```bash
./scripts/setup-github-secrets.sh
```

This will prompt you for each secret value and add them to GitHub.

## Manual Setup

If you prefer to add secrets manually:

1. Go to your repository settings:
   ```
   https://github.com/Kimeiga/fb-portfolio/settings/secrets/actions
   ```

2. Click "New repository secret" for each secret

3. Add all 5 secrets listed above

## Cloudflare Pages Environment Variables

After the first deployment, you also need to set environment variables in Cloudflare Pages:

1. Go to https://dash.cloudflare.com
2. Navigate to "Workers & Pages" → "fb-portfolio"
3. Go to "Settings" → "Environment variables"
4. Add these variables for **Production**:
   - `GOOGLE_CLIENT_ID` - Same value as GitHub secret
   - `GOOGLE_CLIENT_SECRET` - Same value as GitHub secret
   - `GOOGLE_REDIRECT_URI` - Same value as GitHub secret

**Note**: The GitHub Actions workflow will deploy the app, but Cloudflare Pages needs these environment variables at runtime for Better Auth to work.

## Deployment Process

Once secrets are configured, deployment is automatic:

1. **Push to main branch** → Triggers GitHub Actions
2. **GitHub Actions**:
   - Installs dependencies
   - Builds the SvelteKit app
   - Deploys to Cloudflare Pages
   - Runs database migrations (D1)
   - Deploys bot runner worker
3. **Cloudflare Pages**:
   - Serves the app at `https://fb-portfolio.pages.dev`
   - Connects to D1 database
   - Uses environment variables for Better Auth

## Verifying Deployment

After deployment succeeds:

1. **Check GitHub Actions**: https://github.com/Kimeiga/fb-portfolio/actions
   - All steps should be green ✅

2. **Check Cloudflare Pages**: https://dash.cloudflare.com
   - Navigate to "Workers & Pages" → "fb-portfolio"
   - Should show "Active" deployment

3. **Test the app**: https://fb-portfolio.pages.dev
   - Home page should load
   - Google Sign-In should work
   - Bot posts should appear (after cron runs)

## Troubleshooting

### Build Fails
- Check GitHub Actions logs for specific errors
- Ensure all dependencies are in `package.json`
- Try building locally: `npm run build`

### Deployment Fails
- Verify `CLOUDFLARE_API_TOKEN` has correct permissions
- Verify `CLOUDFLARE_ACCOUNT_ID` is correct
- Check Cloudflare dashboard for quota limits

### Google OAuth Doesn't Work
- Verify redirect URIs in Google Cloud Console match your domain
- Check Cloudflare Pages environment variables are set
- Ensure `GOOGLE_REDIRECT_URI` uses `https://` (not `http://`)

### Database Errors
- Check D1 database exists: `wrangler d1 list`
- Verify migrations ran successfully in GitHub Actions logs
- Try running migrations manually: `npm run migrate:remote`

### Bot Posts Don't Appear
- Check bot runner worker deployed successfully
- Verify cron trigger is set up in Cloudflare dashboard
- Trigger bots manually: `npm run bot:trigger` (local) or use the UI button

## Custom Domain

To use a custom domain:

1. Add domain in Cloudflare Pages settings
2. Update `GOOGLE_REDIRECT_URI` secret to use your domain
3. Add new redirect URI in Google Cloud Console
4. Update Cloudflare Pages environment variables

## Local Development

For local development, create a `.dev.vars` file:

```bash
cp .dev.vars.example .dev.vars
```

Then fill in your values:

```
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback
```

**Important**: Never commit `.dev.vars` to version control!

## Production Checklist

Before going live:

- [ ] All GitHub secrets configured
- [ ] All Cloudflare Pages environment variables set
- [ ] Google OAuth redirect URIs include production domain
- [ ] Database migrations ran successfully
- [ ] Bot runner worker deployed
- [ ] Test Google Sign-In works
- [ ] Test creating posts/comments
- [ ] Test friend system
- [ ] Test messaging (E2EE)
- [ ] Verify bots are posting

## Support

If you encounter issues:

1. Check GitHub Actions logs
2. Check Cloudflare Pages logs
3. Check browser console for errors
4. Review this deployment guide
5. Check Better Auth documentation: https://www.better-auth.com/docs

---

**Last Updated**: October 2025

