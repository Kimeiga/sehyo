# Sehyo: personality first

Status: proposed direction, not a launched assessment. September 18, 2026.

## Decision

Make Sehyo a private personality-understanding product first. The entry experience
should be a test, followed by a useful result, with optional selective sharing and
conversations afterward. Do not make a public feed the prerequisite for value.

This is a product hypothesis, not a measured market winner. A person can benefit
from understanding a result without first finding an active community. That is
why this is a more coherent starting point than giving posts, plans, asks,
offers, circles, personas and an assessment equal prominence. Time already spent
on the test is not evidence that people will want the product.

## What was actually found

The reviewed baseline is `Kimeiga/sehyo` at
`df32d5d4fd3156dba480d8526a854485c6a05c1e`.

- The live homepage and `src/routes/+page.svelte` lead with a masked social feed.
- The menu exposes only Home, About and authentication. The header's unread
  indicator has no corresponding Messages destination in that menu.
- The menu is a visual overlay without modal focus containment or Escape handling.
- The referenced improved personality test was not located in the default branch,
  inspected alternate branches, or surfaced live navigation. This does not prove
  it does not exist. Its source, current scoring, and validation are unresolved.
- No current product analytics, user interviews, or validation dataset were
  available to establish demand or assessment accuracy.

The repository README still describes an AI-powered social platform; onboarding
notes describe a daily-question app. These should be reconciled after choosing the
source of truth, not turned into claims that an assessment is already shipped.

## This PR

The current homepage and all social data remain in place. Message APIs and
authentication configuration are preserved. The auth cache now retains the
configured anonymous-plugin type, and the anonymous sign-in wrapper requests an
actual Response so status and session cookies are returned correctly. Navigation
gets ordinary links, current-page states, a native modal menu and recoverable
inline authentication errors. Signed-in users can reach the Messages destination
associated with the unread indicator.

`/prototype/personality` is a noindex concept preview in the existing application,
not a replacement test. It demonstrates the proposed hierarchy and contextual
result writing. Every result is explicitly an example. It collects no answers,
calculates no scores, persists no profile and does not pretend to offer a working
assessment or sharing flow. The page is not linked from production navigation.

## Intended product contract

1. **Test:** one question at a time, readable on a phone, explicit response labels,
   back/edit support, and progress that reflects the actual instrument. Resume
   behavior and storage must be disclosed accurately. Do not advertise a duration
   until measured, or silently alter items, order, weights or thresholds.
2. **Result:** an understandable summary, underlying measured tendencies, balanced
   tradeoffs and practical contexts. A type name can be a secondary mnemonic, not
   the entire explanation. Contextual writing must not infer traits the test does
   not measure. Uncertainty and model limitations belong beside the result.
3. **Sharing:** private by default is a launch requirement, not a claim about the
   present code. Let people inspect the exact content and audience before any
   publication. Account saving, public sharing and selective identity reveal are
   separate choices. Raw answers must not become social posts implicitly.

Proposed eventual navigation: Test, My result (when one exists), How it works.
Move the existing feed to a clearly secondary Community destination only when the
real assessment is integrated. Preserve existing URLs or provide explicit redirects
for any moved social routes. Keep people able to reach existing conversations.

Do not add matching, a generic AI therapist, streaks, bot-driven engagement, a new
quiz catalogue, or a paywall to the first release. None is needed to test the
proposed benefit.

## Merge and launch gates

Keep this PR a draft until the owner can identify the actual test repository,
branch, commit or working URL and its relationship to this app is resolved.

Before promoting the preview to the homepage:

- Integrate that implementation rather than rewriting it. Add fixtures preserving
  its current item bank, score outputs and result mapping. Explicitly review any
  proposed instrument change separately from the UI redesign.
- Verify saved-progress behavior, editing answers, finishing and revisiting a
  result. Cover mobile and keyboard operation, failed requests, missing data and
  interrupted sessions. Do not force users to repeat a completed test after login.
- Document instrument provenance, score meaning and available validation. A result
  feeling accurate is useful feedback, but does not establish reliability or
  validity. Do not invent population percentiles, calibrated confidence or diagnostic
  claims. Using public-domain items alone does not validate a custom implementation.
- Verify answer and result access controls, deletion, data retention, and each
  explicit sharing/revocation boundary. Do not market privacy before testing it.
- Replace preview labels and CTA only when the real test is reachable. Align title,
  description, social cards, app manifest, About and README with the shipped flow.

## Evaluate the direction

Start with people who want to understand themselves, not people looking for a new
social network. Observe whether they can explain the product and begin without
help. After completion, ask which result details were specific and useful, which
were wrong, and what they would do differently. Include disconfirming feedback.

With an appropriate privacy notice and opt-in where required, measure the path
from landing to start, completion and result viewed. Separate voluntary feedback
about usefulness from accuracy research. Do not log answer text or personality
scores to general analytics. Compare observed behavior before adding retention
mechanics. Optional repeat visits and sharing are signals, not objectives to
maximize at the expense of trust.

## Verification

The PR-only `Product direction review` workflow installs using the existing deploy's
fresh-resolution policy without deleting or rewriting the checked-in lockfile.
It runs component compilation/contract checks, the production build, and local
Chromium checks at 320, 375, 768 and 1440 CSS pixels. Screenshots and logs are
uploaded as a review artifact. After the production build, the UI job temporarily
uses a binding-free Wrangler configuration so it cannot access production D1 or
Workers AI. This is a UI test, not a Cloudflare backend integration test. Five auth
contract tests execute the real factory/wrapper with mocked library and database
boundaries; they cover cache behavior, preserved options, response/cookie forwarding,
and failure paths. A separate job exposes the full repository typecheck
without suppressing its failures. No deployment secrets, production writes or
migrations are used.

These checks validate the changes in this PR, not assessment accuracy, authenticated
production behavior, or a completed personality-test flow. The unmodified production
deploy remains restricted to `main` and manual dispatch.

## References checked

- [Reviewed source](https://github.com/Kimeiga/sehyo/tree/df32d5d4fd3156dba480d8526a854485c6a05c1e)
- [Current product](https://sehyo.com) and [About](https://sehyo.com/about)
- [IPIP's warnings about online implementations](https://ipip.ori.org/IPIPImplementationsAroundTheWeb.htm)
- [Personality Project: measurement](https://www.personality-project.org/readings-measurement.html)
- [HTML dialog behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)
- [Better Auth client usage](https://better-auth.com/docs/basic-usage)
- [Better Auth server API responses](https://better-auth.com/docs/concepts/api)
