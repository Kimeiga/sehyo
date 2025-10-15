#!/bin/bash

echo "🔐 Setting up GitHub Secrets for fb-portfolio"
echo ""
echo "This script will help you add all required secrets to GitHub."
echo "You'll need to provide the following values:"
echo ""
echo "1. CLOUDFLARE_API_TOKEN - Get from: https://dash.cloudflare.com/profile/api-tokens"
echo "2. CLOUDFLARE_ACCOUNT_ID - Found in Cloudflare dashboard URL or Workers & Pages overview"
echo "3. GOOGLE_CLIENT_ID - From Google Cloud Console OAuth credentials"
echo "4. GOOGLE_CLIENT_SECRET - From Google Cloud Console OAuth credentials"
echo "5. GOOGLE_REDIRECT_URI - Production callback URL (e.g., https://fb-portfolio.pages.dev/auth/callback)"
echo ""
echo "Press Enter to continue or Ctrl+C to cancel..."
read

# Set each secret
echo ""
echo "📝 Setting CLOUDFLARE_API_TOKEN..."
gh secret set CLOUDFLARE_API_TOKEN

echo ""
echo "📝 Setting CLOUDFLARE_ACCOUNT_ID..."
gh secret set CLOUDFLARE_ACCOUNT_ID

echo ""
echo "📝 Setting GOOGLE_CLIENT_ID..."
gh secret set GOOGLE_CLIENT_ID

echo ""
echo "📝 Setting GOOGLE_CLIENT_SECRET..."
gh secret set GOOGLE_CLIENT_SECRET

echo ""
echo "📝 Setting GOOGLE_REDIRECT_URI..."
gh secret set GOOGLE_REDIRECT_URI

echo ""
echo "✅ All secrets have been set!"
echo ""
echo "🚀 Next steps:"
echo "1. Go to https://github.com/Kimeiga/fb-portfolio/actions"
echo "2. Click on the latest failed workflow run"
echo "3. Click 'Re-run all jobs'"
echo ""
echo "The deployment should now succeed! 🎉"

