# Sehyo — Specifications

This directory holds product and technical specifications for Sehyo. Specs describe **intended behavior** — what the system should do, the rules it must obey, and the contracts between its parts. They are the source of truth that the implementation answers to, not a description of what currently exists.

## Index

_(specs are added here as they are written)_

- [overview.md](overview.md) — product overview: what Sehyo is, who it's for, principles, surface area, non-goals

## Conventions

- One spec per file, kebab-case filename (e.g. `posts.md`, `e2e-messaging.md`).
- Flat layout — no subfolders. The index above is the table of contents.
- Each spec opens with: **Status** (draft / accepted / superseded), **Owner**, **Last updated**.
- Use MUST / SHOULD / MAY (RFC 2119) for normative statements.
- When a spec changes meaning (not just wording), bump a short changelog at the bottom.
- Specs describe behavior, not implementation. If a section reads like code, it probably belongs in the codebase.
