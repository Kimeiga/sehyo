# Development Guide

This guide covers the development workflow and testing procedures for the Portfolio Facebook application.

## Quick Start for Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Local Environment

Create a `.dev.vars` file (copy from `.dev.vars.example`):

```env
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback
```

### 3. Set Up Cloudflare Resources

You need to create the following Cloudflare resources:

#### D1 Database

```bash
npx wrangler d1 create portfolio-facebook-db
```

Update `wrangler.toml` with the database ID, then run migrations:

```bash
npx wrangler d1 execute portfolio-facebook-db --file=./migrations/0001_initial_schema.sql
```

#### R2 Bucket

```bash
npx wrangler r2 bucket create portfolio-facebook-images
```

#### KV Namespace

```bash
npx wrangler kv:namespace create SESSIONS
```

Update `wrangler.toml` with the namespace ID.

### 4. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Testing the Application

### Testing Authentication

1. Navigate to `http://localhost:5173`
2. Click "Sign in with Google"
3. Complete the Google OAuth flow
4. You should be redirected back and logged in

### Testing Post Creation

1. Log in to the application
2. On the home page, you'll see the post creator
3. Type some content in the text area
4. Optionally, click "Photo" to upload an image
5. Click "Post" to create the post
6. The post should appear in the feed immediately

### Testing Post Deletion

1. Find a post you created (you'll see a delete icon)
2. Click the delete icon
3. Confirm the deletion
4. The post should be removed from the feed

## Project Structure

```
src/
├── lib/
│   ├── components/          # Reusable Svelte components
│   │   ├── Navbar.svelte    # Navigation bar
│   │   ├── Post.svelte      # Post display component
│   │   └── PostCreator.svelte # Post creation form
│   ├── server/              # Server-only code
│   │   ├── auth.ts          # Authentication utilities
│   │   └── db.ts            # Database operations
│   ├── crypto.ts            # Client-side encryption
│   └── types.ts             # TypeScript types
├── routes/
│   ├── api/                 # API endpoints
│   │   ├── posts/           # Post CRUD operations
│   │   └── images/          # Image serving from R2
│   ├── auth/                # Authentication routes
│   ├── +layout.svelte       # Root layout with navbar
│   ├── +layout.server.ts    # Server load for user data
│   ├── +page.svelte         # Home page
│   └── +page.server.ts      # Server load for feed
└── hooks.server.ts          # Authentication middleware
```

## API Endpoints

### Posts

- `GET /api/posts` - Get feed posts (paginated)
  - Query params: `limit` (default: 20), `offset` (default: 0)
  - Returns: `{ posts: Post[] }`

- `POST /api/posts` - Create a new post
  - Body: FormData with `content` (required) and `image` (optional)
  - Returns: `{ post: Post }`

- `GET /api/posts/[id]` - Get a single post
  - Returns: `{ post: Post }`

- `DELETE /api/posts/[id]` - Delete a post (owner only)
  - Returns: `{ success: true }`

### Images

- `GET /api/images/[...path]` - Serve images from R2
  - Returns: Image file with appropriate headers

### Authentication

- `GET /auth/login` - Initiate Google OAuth flow
- `GET /auth/callback` - OAuth callback handler
- `POST /auth/logout` - Log out and destroy session

## Database Schema

See `migrations/0001_initial_schema.sql` for the complete schema.

Key tables:
- `users` - User accounts and profiles
- `posts` - User posts with content and images
- `comments` - Comments on posts (nested)
- `reactions` - Reactions to posts and comments
- `friendships` - Friend relationships
- `messages` - Encrypted direct messages
- `user_keys` - Public keys for E2E encryption
- `sessions` - User sessions

## Development Tips

### Working with D1 Database

Execute SQL queries locally:

```bash
npx wrangler d1 execute portfolio-facebook-db --command="SELECT * FROM users LIMIT 5"
```

### Working with R2 Storage

List objects in bucket:

```bash
npx wrangler r2 object list portfolio-facebook-images
```

### Debugging

1. Check browser console for client-side errors
2. Check terminal output for server-side errors
3. Use `console.log()` in server code (visible in terminal)
4. Use browser DevTools for network requests

### Type Checking

Run TypeScript type checking:

```bash
npm run check
```

### Formatting

Format code with Prettier:

```bash
npm run format
```

## Common Issues

### "Database not available" error

- Ensure `wrangler.toml` has the correct database ID
- Ensure migrations have been run
- Restart the dev server

### OAuth errors

- Check that redirect URI matches exactly in Google Console
- Ensure `.dev.vars` has correct credentials
- Check that Google+ API is enabled

### Image upload fails

- Check that R2 bucket exists
- Ensure `wrangler.toml` has correct bucket name
- Check file size (max 10MB) and type (JPEG, PNG, GIF, WebP)

### Session not persisting

- Check browser cookies are enabled
- Ensure session cookie is being set (check DevTools > Application > Cookies)
- Check that KV namespace is configured correctly

## Next Features to Implement

1. **Comments System**
   - Comment form on posts
   - Display comments
   - Nested replies
   - Comment deletion

2. **Reactions System**
   - Reaction picker (6 types)
   - Add/remove reactions
   - Display reaction counts
   - Show who reacted

3. **User Profiles**
   - Profile page route
   - Profile editing
   - Profile picture upload
   - Cover image upload

4. **Friend System**
   - Friend request button
   - Friend requests page
   - Accept/reject requests
   - Friends list

5. **Direct Messaging**
   - Messages page
   - Conversation view
   - Send encrypted messages
   - Key pair generation

6. **UI Improvements**
   - Loading states
   - Error handling
   - Infinite scroll for feed
   - Image lightbox
   - Notifications

## Performance Optimization

- Images are served from R2 with caching headers
- Database queries use indexes
- Posts are paginated
- Static assets are cached

## Security Considerations

- All API endpoints check authentication
- Users can only delete their own posts
- Image uploads are validated (type and size)
- SQL injection prevented with prepared statements
- Session cookies are httpOnly and secure
- Messages will be end-to-end encrypted

## Contributing

When adding new features:

1. Create necessary database migrations
2. Add TypeScript types to `src/lib/types.ts`
3. Create API endpoints in `src/routes/api/`
4. Create reusable components in `src/lib/components/`
5. Update this documentation
6. Test thoroughly before committing

## Resources

- [SvelteKit Documentation](https://kit.svelte.dev/docs)
- [Svelte 5 Documentation](https://svelte.dev/docs/svelte/overview)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

