# Google ID to Bot ID Migration

## 🎯 Overview

This document describes the complete migration from the legacy `google_id` field to a proper `bot_id` field, removing confusion and cleaning up the authentication architecture.

## 📋 Problem Statement

### Before Migration

The `google_id` field was being used for multiple purposes:
- ❌ **Google OAuth users**: Should use `account` table, but had `google_id = null`
- ❌ **Bot users**: Used `google_id` with `bot_*` prefix (e.g., `bot_creative_writer_google`)
- ❌ **Test users**: Used `google_id` with `test_*` prefix (e.g., `test_alice_1760488195556`)
- ❌ **Old anonymous users**: Used `google_id` with `anon_*` prefix (e.g., `anon_1760499050103_p7lblv`)

### Issues

1. **Confusing naming**: `google_id` implied it was for Google OAuth, but it wasn't
2. **Mixed purposes**: One field serving multiple unrelated purposes
3. **Inconsistent architecture**: Google users use `account` table, bots use `google_id`
4. **Legacy data**: Old anonymous users had `google_id` set when they should use `isAnonymous` flag

## ✅ Solution

### After Migration

Clean separation of concerns:
- ✅ **Google OAuth users**: Use `account` table (`accountId` field)
- ✅ **Bot users**: Use `bot_id` field (e.g., `bot_creative_writer_google`)
- ✅ **Anonymous users**: Use `isAnonymous` flag (boolean)
- ✅ **Test users**: No special identifier needed (just regular users)

## 🔧 Implementation

### Migration 0013: Migrate to bot_id

**File**: `migrations/0013_migrate_to_bot_id.sql`

```sql
-- Step 1: Add bot_id field (without UNIQUE constraint initially)
ALTER TABLE user ADD COLUMN bot_id TEXT;

-- Step 2: Migrate bot users (those with google_id starting with 'bot_')
UPDATE user 
SET bot_id = google_id 
WHERE google_id LIKE 'bot_%';

-- Step 3: Create unique index on bot_id (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bot_id ON user(bot_id) WHERE bot_id IS NOT NULL;

-- Step 4: Clear google_id for bot users (they now use bot_id)
UPDATE user 
SET google_id = NULL 
WHERE google_id LIKE 'bot_%';

-- Step 5: Clear google_id for test users (they don't need it)
UPDATE user 
SET google_id = NULL 
WHERE google_id LIKE 'test_%';

-- Step 6: Clear google_id for old anonymous users (they don't need it)
UPDATE user 
SET google_id = NULL 
WHERE google_id LIKE 'anon_%';
```

### Migration 0014: Drop google_id

**File**: `migrations/0014_drop_google_id.sql`

```sql
-- Drop the unique index first
DROP INDEX IF EXISTS idx_user_google_id;

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- Step 1: Create new table without google_id
CREATE TABLE user_new (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    name TEXT,
    image TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    bot_id TEXT UNIQUE,
    username TEXT UNIQUE,
    bio TEXT,
    location TEXT,
    website TEXT,
    cover_image_url TEXT,
    public_key TEXT,
    isAnonymous INTEGER DEFAULT 0
);

-- Step 2: Copy data from old table to new table
INSERT INTO user_new (
    id, email, emailVerified, name, image, createdAt, updatedAt,
    bot_id, username, bio, location, website, cover_image_url, public_key, isAnonymous
)
SELECT 
    id, email, emailVerified, name, image, createdAt, updatedAt,
    bot_id, username, bio, location, website, cover_image_url, public_key, isAnonymous
FROM user;

-- Step 3: Drop old table
DROP TABLE user;

-- Step 4: Rename new table to user
ALTER TABLE user_new RENAME TO user;

-- Step 5: Recreate the bot_id index
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bot_id ON user(bot_id) WHERE bot_id IS NOT NULL;
```

## 📝 Code Changes

### 1. Database Schema (`src/lib/server/db/schema.ts`)

**Before:**
```typescript
google_id: text('google_id').unique(), // Google OAuth ID (nullable for anonymous users)
```

**After:**
```typescript
bot_id: text('bot_id').unique(), // Bot identifier (for bot users only)
// google_id field removed entirely
```

### 2. TypeScript Types (`src/lib/types.ts`)

**Before:**
```typescript
google_id: string | null;
```

**After:**
```typescript
bot_id: string | null; // Bot identifier (for bot users only)
// google_id field removed entirely
```

### 3. Database Class (`src/lib/server/db.ts`)

**Before:**
```typescript
async createUser(data: {
    id: string;
    google_id: string;
    email: string;
    name: string;
    image?: string;
}): Promise<User> {
    // ...
}

async getUserByGoogleId(google_id: string): Promise<User | null> {
    // ...
}
```

**After:**
```typescript
async createUser(data: {
    id: string;
    bot_id?: string; // Optional bot_id for bot users
    email: string;
    name: string;
    image?: string;
}): Promise<User> {
    // ...
}

async getUserByBotId(bot_id: string): Promise<User | null> {
    // ...
}
```

### 4. Test Login Endpoint (`src/routes/api/dev/test-login/+server.ts`)

**Before:**
```typescript
const googleId = `test_${username}_${Date.now()}`;
await db.prepare(
    `INSERT INTO user (id, google_id, email, username, name, ...)
     VALUES (?, ?, ?, ?, ?, ...)`
).bind(userId, googleId, email, username, displayName).run();
```

**After:**
```typescript
// No google_id needed for test users
await db.prepare(
    `INSERT INTO user (id, email, username, name, ...)
     VALUES (?, ?, ?, ?, ...)`
).bind(userId, email, username, displayName).run();
```

### 5. Friends Page (`src/routes/friends/+page.server.ts`)

**Before:**
```typescript
// Filter out anonymous users by google_id pattern
WHERE id != ?
AND google_id NOT LIKE 'anon_%'
```

**After:**
```typescript
// Filter out anonymous users by isAnonymous flag
WHERE id != ?
AND (isAnonymous IS NULL OR isAnonymous = 0)
```

## 🧪 Verification

### Local Database

```bash
# Check bot users have bot_id
npx wrangler d1 execute portfolio-facebook-db --local --command="SELECT id, email, name, bot_id FROM user WHERE bot_id IS NOT NULL;"

# Verify google_id is gone
npx wrangler d1 execute portfolio-facebook-db --local --command="PRAGMA table_info(user);"
```

### Production Database

```bash
# Apply migrations
npx wrangler d1 execute portfolio-facebook-db --remote --file=./migrations/0013_migrate_to_bot_id.sql
npx wrangler d1 execute portfolio-facebook-db --remote --file=./migrations/0014_drop_google_id.sql
```

## 📊 Results

### Database Schema

**Final `user` table structure:**
```
id              TEXT PRIMARY KEY
email           TEXT NOT NULL UNIQUE
emailVerified   INTEGER NOT NULL DEFAULT 0
name            TEXT
image           TEXT
createdAt       INTEGER NOT NULL
updatedAt       INTEGER NOT NULL
bot_id          TEXT UNIQUE          ← NEW!
username        TEXT UNIQUE
bio             TEXT
location        TEXT
website         TEXT
cover_image_url TEXT
public_key      TEXT
isAnonymous     INTEGER DEFAULT 0
```

### User Types

| User Type | Identifier | Example |
|-----------|------------|---------|
| Google OAuth | `account.accountId` | `"117450157241..."` |
| Anonymous | `isAnonymous = 1` | `true` |
| Bot | `bot_id` | `"bot_creative_writer_google"` |
| Test | None (regular user) | N/A |

## 🎉 Benefits

1. **Clear naming**: `bot_id` clearly indicates it's for bots
2. **Proper separation**: Each user type has its own identifier
3. **Consistent architecture**: All OAuth uses `account` table, all bots use `bot_id`
4. **No legacy data**: Old anonymous users now properly use `isAnonymous` flag
5. **Type safety**: TypeScript types match database schema exactly

## 📚 Related Documentation

- [Authentication Migration Guide](./AUTHENTICATION_MIGRATION_GUIDE.md) - Complete Better Auth migration
- [Architecture Analysis](./ARCHITECTURE_ANALYSIS.md) - Overall architecture review

## 🔗 Commits

- Migration 0013: `47bb181` - Migrate from google_id to bot_id field
- Migration 0014: `eae2197` - Complete google_id removal
- Documentation: `1090d1c` - Update architecture docs

