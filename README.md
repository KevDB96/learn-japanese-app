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
npm run content:validate
```

## Canonical content

The versioned catalog is `src/content/catalog.json`. Content authors can run `npm run content:validate` before committing changes; validation is local and needs no network or Supabase access. See [the content contract](docs/CONTENT.md) for models, IDs, and validation rules.

Copy `.env.example` to `.env.local` when a future feature needs Supabase. No service credentials belong in source control.
