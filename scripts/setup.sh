#!/bin/bash

# Portfolio Facebook - Setup Script
# This script helps you set up the Cloudflare resources needed for the application

set -e

echo "🚀 Portfolio Facebook - Setup Script"
echo "===================================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

echo "✅ Wrangler CLI is installed"
echo ""

# Step 1: Create D1 Database
echo "📊 Step 1: Creating D1 Database..."
echo "Running: npx wrangler d1 create portfolio-facebook-db"
echo ""
npx wrangler d1 create portfolio-facebook-db
echo ""
echo "⚠️  IMPORTANT: Copy the database_id from above and update it in wrangler.toml"
echo "Press Enter when you've updated wrangler.toml..."
read

# Step 2: Run Migrations
echo ""
echo "📝 Step 2: Running Database Migrations..."
echo "Running: npx wrangler d1 execute portfolio-facebook-db --file=./migrations/0001_initial_schema.sql"
echo ""
npx wrangler d1 execute portfolio-facebook-db --file=./migrations/0001_initial_schema.sql
echo ""
echo "✅ Database migrations completed"

# Step 3: Create R2 Bucket
echo ""
echo "🪣 Step 3: Creating R2 Bucket..."
echo "Running: npx wrangler r2 bucket create portfolio-facebook-images"
echo ""
npx wrangler r2 bucket create portfolio-facebook-images
echo ""
echo "✅ R2 bucket created"

# Step 4: Create KV Namespace
echo ""
echo "🗄️  Step 4: Creating KV Namespace..."
echo "Running: npx wrangler kv:namespace create SESSIONS"
echo ""
npx wrangler kv:namespace create SESSIONS
echo ""
echo "⚠️  IMPORTANT: Copy the namespace id from above and update it in wrangler.toml"
echo "Press Enter when you've updated wrangler.toml..."
read

# Step 5: Check .dev.vars
echo ""
echo "🔐 Step 5: Checking Environment Variables..."
if [ ! -f .dev.vars ]; then
    echo "⚠️  .dev.vars file not found!"
    echo "Creating .dev.vars from template..."
    cp .dev.vars.example .dev.vars
    echo ""
    echo "📝 Please edit .dev.vars and add your Google OAuth credentials:"
    echo "   - GOOGLE_CLIENT_ID"
    echo "   - GOOGLE_CLIENT_SECRET"
    echo "   - GOOGLE_REDIRECT_URI"
    echo ""
    echo "Press Enter when you've updated .dev.vars..."
    read
else
    echo "✅ .dev.vars file exists"
fi

# Step 6: Install Dependencies
echo ""
echo "📦 Step 6: Installing Dependencies..."
npm install
echo ""
echo "✅ Dependencies installed"

# Done
echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "Next steps:"
echo "1. Make sure you've updated wrangler.toml with:"
echo "   - D1 database_id"
echo "   - KV namespace id"
echo ""
echo "2. Make sure you've updated .dev.vars with:"
echo "   - GOOGLE_CLIENT_ID"
echo "   - GOOGLE_CLIENT_SECRET"
echo "   - GOOGLE_REDIRECT_URI"
echo ""
echo "3. Start the development server:"
echo "   npm run dev"
echo ""
echo "4. Open http://localhost:5173 in your browser"
echo ""
echo "5. Follow the testing checklist in TESTING.md"
echo ""

