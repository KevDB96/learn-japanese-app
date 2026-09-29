# Architecture

- **Product target:** an iPhone-first installable PWA distributed outside the App Store; desktop and iPad are secondary.
- **Curriculum:** canonical lessons and learning sequence are version-controlled in this repository.
- **User state:** IndexedDB is the immediate source of truth. Supabase holds only two anonymous convenience-save slots (Kevin and Janne), addressed by fixed opaque IDs. The browser uses only the publishable/anon key. Anyone with the project URL and key can read or overwrite either slot; IDs do not provide privacy or account security. Cloud sync compares metadata and requires a choice when both copies differ.
- **Domain logic:** lesson, exercise, review, and progression rules belong outside UI components so they can be tested independently.
- **UI:** React components render application state and provide touch-friendly controls without relying on hover.
- **Offline support:** the shell includes a web app manifest. Service-worker caching and offline behavior are future work.

The source tree reserves boundaries for lessons, exercises, review, progress, auth, sync, content, storage, spaced repetition, and learning sessions. Canonical curriculum records live in `src/content/catalog.json`; typed models and deterministic validation live under `src/lib/content`. The content registry has no UI or service dependencies.
