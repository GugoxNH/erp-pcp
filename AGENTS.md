<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## CRUD Modal Standard

- Use `app/crud-modal.tsx` for all modal forms; never mount a form in SweetAlert2.
- Use `app/crud-modal.css`: fixed `.crud-modal-heading`, scrollable `.crud-modal-body`, fixed `.crud-modal-footer`. Place these inside the form for submit workflows.
- Reuse the two-column `.product-form-grid` (one column on mobile), `.product-wide` for full-width fields, and existing primary/secondary buttons. Labels sit above inputs; checkbox labels stay inline.
- Keep errors in the form, preserve input when a confirmation is cancelled, and block dismissal while saving. Pass close logic through `onRequestClose` for Escape and Cancel.
- SweetAlert2 is for alerts, confirmations and success notifications only. Use `confirmAction` from `lib/alerts.ts` for confirmations inside a native modal.
