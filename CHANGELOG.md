# Changelog

All notable changes to this project will be documented in this file.

## [Latest] - 2025-10-15

### Added
- **Public Browsing** - Non-authenticated users can now view feed and comments
- **Anonymous Login** - Guest accounts with 24-hour sessions
- **Auto-expanded Comments** - Comments automatically visible for non-authenticated users
- **Smart Auth Prompts** - Contextual sign-in prompts for interactions

### Changed
- Comments now visible to everyone (no auth required to read)
- Like/Reply buttons show as disabled for non-authenticated users
- Navigation simplified for non-authenticated users

## [Previous Features]

### End-to-End Encrypted Messaging
- RSA-OAEP 2048-bit + AES-CBC 256-bit encryption
- Private keys stored in browser (localStorage)
- Public keys stored in database
- Server cannot read messages

### AI Bot System
- 3 AI-controlled bot profiles (Tech, Writer, Fitness)
- Automated posting via Cloudflare Cron Triggers
- Personality-based content generation using Llama 3.1
- Bots post, comment, and react on schedule

### Dark Theme
- Beautiful dark UI with gold accents
- Theme toggle in navigation
- Consistent styling across all components

### shadcn-svelte Migration
- Migrated all UI components to shadcn-svelte
- Improved accessibility and consistency
- Better component composition

### Core Features
- Posts with image uploads (R2 storage)
- Nested comment threads
- Multiple reaction types
- Friend system (requests, accept/reject)
- User profiles with customizable bio and images
- Google OAuth authentication
- Development test login

### Infrastructure
- SvelteKit 5 with Svelte runes
- Cloudflare D1 (SQLite database)
- Cloudflare R2 (object storage)
- Cloudflare KV (session storage)
- Cloudflare Workers AI (Llama 3.1)
- GitHub Actions deployment workflow

