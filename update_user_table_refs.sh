#!/bin/bash

# Script to update all references from 'users' table to 'user' table
# and update column names to match Better Auth schema

# Files to update
FILES=(
  "src/routes/api/bots/comments/+server.ts"
  "src/routes/api/bots/posts/+server.ts"
  "src/routes/api/dev/test-login/+server.ts"
  "src/routes/api/friends/+server.ts"
  "src/routes/api/messages/[userId]/+server.ts"
  "src/routes/api/messages/conversations/+server.ts"
  "src/routes/friends/+page.server.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Updating $file..."
    
    # Update table name from 'users' to 'user'
    sed -i '' 's/FROM users/FROM user/g' "$file"
    sed -i '' 's/JOIN users/JOIN user/g' "$file"
    sed -i '' 's/INSERT INTO users/INSERT INTO user/g' "$file"
    sed -i '' 's/UPDATE users/UPDATE user/g' "$file"
    
    # Update column names
    sed -i '' 's/u\.display_name/u.name as display_name/g' "$file"
    sed -i '' 's/u\.profile_picture_url/u.image as profile_picture_url/g' "$file"
    sed -i '' 's/display_name LIKE/name LIKE/g' "$file"
    sed -i '' 's/display_name =/name =/g' "$file"
    sed -i '' 's/display_name,/name as display_name,/g' "$file"
    sed -i '' 's/profile_picture_url,/image as profile_picture_url,/g' "$file"
    sed -i '' 's/created_at/createdAt/g' "$file"
    sed -i '' 's/updated_at/updatedAt/g' "$file"
    
    echo "✓ Updated $file"
  else
    echo "✗ File not found: $file"
  fi
done

echo "Done!"

