# Learn Japanese

An iPhone-first installable Japanese-learning PWA. Lessons teach, exercises build understanding, reviews build memory, and the curriculum decides what comes next. The canonical curriculum lives in this repository; Supabase is reserved for user-specific synchronized state.

## Local development

```sh
npm install
npm run dev
```

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Copy `.env.example` to `.env.local` when a future feature needs Supabase. No service credentials belong in source control.
