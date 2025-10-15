# Testing Checklist

This document provides a comprehensive testing checklist for the Portfolio Facebook application.

## Prerequisites

Before testing, ensure you have:
- ✅ Created Cloudflare D1 database
- ✅ Run database migrations
- ✅ Created R2 bucket
- ✅ Created KV namespace
- ✅ Updated `wrangler.toml` with all IDs
- ✅ Created `.dev.vars` with Google OAuth credentials
- ✅ Installed dependencies (`npm install`)

## Starting the Application

```bash
npm run dev
```

The app should be available at `http://localhost:5173`

## Test Scenarios

### 1. Authentication

**Test: Sign In**
- [ ] Navigate to `http://localhost:5173`
- [ ] Click "Sign in with Google"
- [ ] Complete Google OAuth flow
- [ ] Verify you're redirected back to the home page
- [ ] Verify you see the navbar with your profile picture
- [ ] Verify you see the post creator

**Test: Sign Out**
- [ ] Click on your profile picture in the navbar
- [ ] Click "Log out"
- [ ] Verify you're redirected to the landing page
- [ ] Verify you see "Sign in with Google" button

### 2. Posts

**Test: Create Text Post**
- [ ] Sign in
- [ ] Type "This is my first test post!" in the post creator
- [ ] Click "Post"
- [ ] Verify the post appears in the feed immediately
- [ ] Verify your name and profile picture appear on the post
- [ ] Verify the timestamp shows "Just now"

**Test: Create Post with Image**
- [ ] Click "Photo" in the post creator
- [ ] Select an image (JPEG, PNG, GIF, or WebP, max 10MB)
- [ ] Verify image preview appears
- [ ] Type "Check out this image!"
- [ ] Click "Post"
- [ ] Verify the post appears with the image
- [ ] Verify the image loads correctly

**Test: Delete Post**
- [ ] Find a post you created
- [ ] Click the delete (trash) icon
- [ ] Confirm deletion
- [ ] Verify the post is removed from the feed

**Test: Post Validation**
- [ ] Try to post without any content
- [ ] Verify you see an error message
- [ ] Try to upload an image larger than 10MB
- [ ] Verify you see an error message
- [ ] Try to upload a non-image file
- [ ] Verify you see an error message

### 3. Reactions

**Test: Add Reaction to Post**
- [ ] Hover over the "Like" button on any post
- [ ] Verify you see all 6 reaction options (👍 ❤️ 😂 😮 😢 😠)
- [ ] Click on "Love" (❤️)
- [ ] Verify the button changes to "Love" with red/blue color
- [ ] Verify the reaction count increases

**Test: Change Reaction**
- [ ] On a post you've reacted to, hover over the reaction button
- [ ] Click a different reaction (e.g., "Haha" 😂)
- [ ] Verify the button updates to the new reaction
- [ ] Verify the count remains the same (not doubled)

**Test: Remove Reaction**
- [ ] On a post you've reacted to, click the same reaction again
- [ ] Verify the reaction is removed
- [ ] Verify the button returns to "Like"
- [ ] Verify the count decreases

**Test: React to Comment**
- [ ] Find any comment
- [ ] Hover over the "Like" button on the comment
- [ ] Click a reaction
- [ ] Verify it works the same as post reactions

### 4. Comments

**Test: Add Comment**
- [ ] Click "Comment" on any post
- [ ] Type "Great post!" in the comment field
- [ ] Press Enter or click "Post"
- [ ] Verify the comment appears immediately
- [ ] Verify your name and profile picture appear

**Test: Reply to Comment**
- [ ] Find any comment
- [ ] Click "Reply"
- [ ] Type "I agree!" in the reply field
- [ ] Press Enter or click "Send"
- [ ] Verify the reply appears indented under the comment

**Test: Nested Replies**
- [ ] Reply to a reply
- [ ] Verify it appears further indented
- [ ] Try to reply to a 3rd level comment
- [ ] Verify nesting stops at 3 levels

**Test: Delete Comment**
- [ ] Find a comment you created
- [ ] Click "Delete"
- [ ] Verify the comment is removed

**Test: Show/Hide Comments**
- [ ] Click "View X comments" on a post with comments
- [ ] Verify comments expand
- [ ] Click "Hide X comments"
- [ ] Verify comments collapse

**Test: Show/Hide Replies**
- [ ] Find a comment with replies
- [ ] Click "Show replies"
- [ ] Verify replies appear
- [ ] Click "Hide replies"
- [ ] Verify replies disappear

### 5. User Profiles

**Test: View Own Profile**
- [ ] Click on your profile picture in the navbar
- [ ] Click "View profile"
- [ ] Verify you see your profile page
- [ ] Verify you see "Edit Profile" button
- [ ] Verify you see your posts

**Test: View Other User's Profile**
- [ ] Click on another user's name or avatar in a post/comment
- [ ] Verify you see their profile page
- [ ] Verify you DON'T see "Edit Profile" button
- [ ] Verify you see their posts

**Test: Edit Profile Info**
- [ ] Go to your profile
- [ ] Click "Edit Profile"
- [ ] Change your display name
- [ ] Add a username (e.g., "johndoe")
- [ ] Add a bio
- [ ] Add a location
- [ ] Add a website URL
- [ ] Click "Save Changes"
- [ ] Verify you see success message
- [ ] Go back to your profile
- [ ] Verify all changes are visible

**Test: Upload Profile Picture**
- [ ] Go to "Edit Profile"
- [ ] Click "Choose File" under Profile Picture
- [ ] Select an image (max 5MB)
- [ ] Verify preview appears
- [ ] Click "Upload Profile Picture"
- [ ] Wait for upload to complete
- [ ] Verify success message
- [ ] Verify new profile picture appears in navbar
- [ ] Verify new profile picture appears on your posts

**Test: Upload Cover Image**
- [ ] Go to "Edit Profile"
- [ ] Click "Choose File" under Cover Image
- [ ] Select an image (max 10MB)
- [ ] Verify preview appears
- [ ] Click "Upload Cover Image"
- [ ] Wait for upload to complete
- [ ] Verify success message
- [ ] Go to your profile
- [ ] Verify new cover image appears

**Test: Username Validation**
- [ ] Go to "Edit Profile"
- [ ] Try to set username with spaces (e.g., "john doe")
- [ ] Verify you see validation error
- [ ] Try to set username with special characters (e.g., "john@doe")
- [ ] Verify you see validation error
- [ ] Set a valid username (e.g., "john_doe")
- [ ] Save successfully

### 6. Navigation

**Test: Navbar Links**
- [ ] Click "Home" icon - verify you go to home feed
- [ ] Click "Friends" icon - verify you go to friends page (will be 404 for now)
- [ ] Click "Messages" icon - verify you go to messages page (will be 404 for now)
- [ ] Click logo - verify you go to home page

**Test: User Menu**
- [ ] Click on your profile picture
- [ ] Verify dropdown menu appears
- [ ] Click outside the menu
- [ ] Verify menu closes
- [ ] Open menu again
- [ ] Click "View profile" - verify you go to your profile
- [ ] Open menu again
- [ ] Click "Edit Profile" - verify you go to edit page

### 7. Responsive Design

**Test: Mobile View**
- [ ] Resize browser to mobile width (< 768px)
- [ ] Verify navbar adapts (logo text may hide)
- [ ] Verify posts display correctly
- [ ] Verify comment section works
- [ ] Verify profile page is readable

**Test: Tablet View**
- [ ] Resize browser to tablet width (768px - 1024px)
- [ ] Verify layout adapts appropriately
- [ ] Verify all features work

## Common Issues and Solutions

### Issue: "Database not available"
**Solution:** 
- Check `wrangler.toml` has correct database ID
- Ensure migrations have been run
- Restart dev server

### Issue: "Unauthorized" errors
**Solution:**
- Clear cookies and sign in again
- Check `.dev.vars` has correct OAuth credentials
- Verify session cookie is being set

### Issue: Images not uploading
**Solution:**
- Check R2 bucket exists
- Verify `wrangler.toml` has correct bucket name
- Check file size and type
- Check browser console for errors

### Issue: OAuth redirect fails
**Solution:**
- Verify redirect URI in Google Console matches exactly
- Check `.dev.vars` has correct client ID and secret
- Ensure Google+ API is enabled

### Issue: TypeScript errors in IDE
**Solution:**
- These are expected for library types
- Run `npm run check` to see actual errors
- Ignore errors in `node_modules`

## Performance Testing

**Test: Feed Loading**
- [ ] Create 20+ posts
- [ ] Reload the page
- [ ] Verify feed loads quickly (< 2 seconds)

**Test: Image Loading**
- [ ] Upload several large images (close to 10MB)
- [ ] Verify they load from R2
- [ ] Check browser Network tab for caching headers

**Test: Comment Loading**
- [ ] Create a post with 50+ comments
- [ ] Verify comments load when expanded
- [ ] Verify performance is acceptable

## Security Testing

**Test: Authorization**
- [ ] Try to delete another user's post (should fail)
- [ ] Try to delete another user's comment (should fail)
- [ ] Try to access `/profile/edit` while logged out (should redirect)

**Test: Input Validation**
- [ ] Try to post content > 5000 characters (should fail)
- [ ] Try to comment > 2000 characters (should fail)
- [ ] Try SQL injection in post content (should be escaped)

## Browser Compatibility

Test in multiple browsers:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if on Mac)

## Next Steps After Testing

Once all tests pass:
1. Note any bugs or issues
2. Fix critical issues
3. Proceed with implementing Friend System
4. Continue with Direct Messaging
5. Final polish and deployment

## Reporting Issues

If you find issues during testing:
1. Note the exact steps to reproduce
2. Check browser console for errors
3. Check terminal for server errors
4. Document expected vs actual behavior

