# Messaging E2E — chrome-devtools MCP runbook

This is a manual-but-scriptable procedure for verifying the full
real-time messaging UX (polling, typing indicator dots in the DOM,
read receipt rendering) through two real browser tabs. Drives the
local dev server with two anonymous users via the chrome-devtools
MCP plugin.

When to run: any time you touch `/messages`, `/api/messages/*`,
the polling cadence, or the typing/read-receipt logic.

For a quick non-UI smoke that just exercises the API layer, run
`node tests/messages-e2e.mjs` instead — it's fast, has no MCP
dependency, and covers the same server-side behavior.

---

## Setup

1. `npm run dev` in another terminal. Note the port (usually 5174
   when 5173 is taken).
2. Confirm chrome-devtools MCP is installed: there should be tools
   prefixed `mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`
   available. If not, `/plugin install chrome-devtools-mcp`.

## Procedure (have Claude run this)

1. **Two isolated contexts.**
   ```
   new_page url=http://localhost:<PORT>/ isolatedContext=user-a
   new_page url=http://localhost:<PORT>/ isolatedContext=user-b
   ```

2. **Anonymous sign-in for each.** In each tab:
   ```js
   await fetch('/api/auth/sign-in/anonymous', {
     method: 'POST', credentials: 'include',
     headers: {'Content-Type':'application/json'}, body: '{}'
   }).then(r => r.json())
   ```
   Capture `user.id` for both. Call them `A_ID` and `B_ID`.

3. **Land each on the other's conversation page:**
   ```
   /messages?with=<B_ID>   in user-a's tab
   /messages?with=<A_ID>   in user-b's tab
   ```

4. **Send / receive.** In A's tab, POST `/api/messages/send` with
   `{recipient_id: B_ID, content: 'hello'}`. Wait ~3s for B's poll.
   In B's tab, scrape `document.body.innerText` and assert it
   contains "hello".

5. **Typing indicator.** In A's tab, start a `setInterval` that
   POSTs `/api/messages/typing` with `{recipient_id: B_ID}` every
   1500ms. Wait ~3s. In B's tab, assert text contains "is typing"
   AND `take_screenshot` to confirm the three animated dots render.

6. **Typing expiry.** Stop A's interval. Wait ~10s
   (TYPING_FRESH_SECONDS + a buffer). In B's tab, assert text no
   longer contains "is typing".

7. **Read receipts.** In B's tab, refresh / fetch
   `/api/messages/<A_ID>` (no peek). In A's tab, wait ~7s for the
   read-receipt poll, then assert text contains "Seen".

8. **Reverse direction.** B sends "hi back". Wait ~3s. A's tab
   should now show "hi back".

## Expected results

| Step | Pass criterion |
|---|---|
| 4 | B's DOM contains the sent message within ~3s |
| 5 | B's DOM contains "is typing"; screenshot shows three dots |
| 6 | "is typing" gone after ~10s of no pings |
| 7 | A's DOM contains "Seen" by the latest outgoing bubble |
| 8 | A's DOM contains B's reply within ~3s |

If any step fails, screenshot the page and look at:
- `/api/messages/<other_id>?peek=1` payload — does
  `other_typing` match expectations?
- `read_at` on outgoing messages — populated when the other party
  has fetched without `?peek=1`?
- The deployed bundle hash via `Link:` header on `/messages` —
  user might be on a stale precached SW (see the
  `registerType: 'autoUpdate'` config in vite.config.ts).
