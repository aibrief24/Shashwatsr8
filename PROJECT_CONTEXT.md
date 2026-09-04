# PROJECT_CONTEXT.md — AIBrief24

> Single-file onboarding document for an AI assistant or developer with **zero prior context**.
> Everything below was derived by reading the actual source files in this repo (not from README/PRD claims —
> where the PRD disagrees with the code, the code is documented and the discrepancy is flagged).
>
> Repo root: `/home/shashwat/Shashwatsr8` · Branch: `main` · Last verified: 2026-08-15

---

## 1. Project Overview

### What it is
**AIBrief24** is a mobile app (Android + iOS, with an incidental web target) that aggregates AI/tech news
from RSS feeds, rewrites each item into a 3–4 sentence AI-generated summary, and presents them as a
**vertically swipeable, full-screen card feed** — the "Inshorts for AI news" pattern.

### Problem it solves
AI news moves faster than anyone can read. The app compresses each story into a ~15-second read with an
image, a headline, a self-contained summary, source attribution, and a link out to the original article.

### Target users
Busy developers, founders, investors, and AI enthusiasts who want signal without reading full articles.
The content mix (arXiv papers, funding rounds, model releases, Big Tech strategy) skews technical/professional.

### Current stage: **Production / live**
Evidence in the code, not aspiration:
- Published to Google Play (`com.aibrief24.app`, `versionCode 15`, `versionName 1.0.2`) and live on the App Store (`id6794633949`); share links resolve per-platform.
- Submitted to the App Store; **currently in an Apple review-rejection loop** (guideline 5.1.1, ATT purpose string — just fixed in `frontend/ios/AIBrief24/Info.plist`).
- Real AdMob ad unit IDs wired up and `EXPO_PUBLIC_USE_TEST_ADS=false` — real ads are serving.
- Live backend on Render (`https://aibrief24-backend.onrender.com`), live Supabase Postgres.
- A GitHub Actions cron ingests news every 2 hours in production.
- Real push notification delivery with Expo receipts, token hygiene, quiet hours, and daily caps.

It is a **solo/small-team production app carrying a lot of exploratory scaffolding** — ~20 one-off backend
repair scripts, two virtualenvs, debug `output*.txt` dumps, and a stale test suite live alongside the
production code. See §10.

---

## 2. Tech Stack (exact versions)

### Backend — Python / FastAPI
| Thing | Version | Where / Why |
|---|---|---|
| Python | `3.11.10` pinned in `backend/runtime.txt` | Render runtime pin. **CI uses 3.13** (`.github/workflows/ingest-news.yml`) — mismatch. |
| fastapi | `0.110.1` | HTTP API framework (`backend/server.py`). |
| uvicorn | `0.25.0` | ASGI server. No Procfile — start command lives in the Render dashboard. |
| starlette | `0.37.2` | CORS middleware. |
| pydantic | `2.12.5` | Request body models. |
| psycopg2-binary | `2.9.11` | Direct Postgres access + `ThreadedConnectionPool`. **The Supabase Python SDK is installed but never imported** — all DB access is raw SQL. |
| httpx | `0.28.1` | Supabase Auth REST calls (`backend/auth.py`). |
| requests | `2.32.5` | Expo Push API, RSS/HTML fetching, image downloads. |
| feedparser | `6.0.12` | RSS/Atom parsing (`backend/ingestor.py`). |
| beautifulsoup4 | `4.14.3` | `og:image` scraping + ar5iv figure extraction. Import is optional-guarded. |
| openai | `1.99.9` | Summary + category generation. Model used: **`gpt-4o-mini`** (the PRD's claim of GPT-3.5-turbo is stale). |
| pillow | `12.1.1` | Thumbnail compression to WebP (`backend/image_optimizer.py`). |
| python-dotenv | `1.2.1` | Loads `backend/.env`. |
| pytest | `9.0.2` | `backend/tests/` — integration tests hitting a live URL. |

`backend/requirements.txt` is a raw **`pip freeze` of 144 packages**. Genuinely unused heavyweights that
still get installed on every CI run and Render deploy: `motor`, `pymongo`, `boto3`/`botocore`, `stripe`,
`litellm`, `google-genai`/`google-generativeai`, `pandas`, `numpy`, `pyiceberg`, `huggingface_hub`,
`tiktoken`, `black`, `mypy`, `flake8`. See §10.

### Frontend — React Native / Expo
| Thing | Version | Where / Why |
|---|---|---|
| expo | `54.0.33` | Managed-ish workflow, but `ios/` and `android/` are **checked in** (prebuild ejected) — native dirs win over `app.json`. |
| react-native | `0.81.5` | New Architecture (Fabric) **enabled** (`newArchEnabled: true`). |
| react | `19.1.0` | |
| typescript | `~5.9.3`, `strict: true` | Path alias `@/*` → project root. |
| expo-router | `~6.0.22` | File-based routing, `typedRoutes` experiment on. Entry point: `"main": "expo-router/entry"`. |
| expo-notifications | `~0.32.16` | Permissions, Expo push token, tap handling. |
| expo-image | `~3.0.11` | Feed images with `memory-disk` cache policy. |
| expo-tracking-transparency | `~6.0.8` | iOS ATT prompt (the Apple 5.1.1 subject). |
| react-native-google-mobile-ads | `^16.3.3` | Native ads interleaved into the feed. |
| react-native-fbsdk-next | `^13.4.3` | Meta install/event attribution. |
| react-native-view-shot | `4.0.3` | Renders `ShareCard` off-screen → PNG for social sharing. |
| react-native-share | `^12.3.1` | Native share sheet for the generated image. |
| @react-native-async-storage/async-storage | `2.2.0` | Tokens, onboarding flag, deep-link stash. |
| lucide-react-native | `^0.577.0` | All iconography. |
| expo-linear-gradient, expo-blur, react-native-safe-area-context, react-native-gesture-handler, react-native-reanimated `~4.1.1` | | UI primitives. |
| eslint `^9.25.0` + eslint-config-expo `~10.0.0` | | `yarn lint`. No Prettier config. |
| Metro | via `expo/metro-config` | Custom `FileStore` cache at `.metro-cache/`, `maxWorkers: 2`. |
| Package manager | **yarn 1.22.22** (declared in `packageManager`) | Note a `package-lock.json` **also** exists — conflicting lockfiles. |

Declared-but-unused frontend deps: `react-native-dotenv` (no `babel.config.js` exists at all, so its
transform never runs), `react-native-pager-view`, `react-native-webview`, `expo-clipboard`, `expo-haptics`,
`expo-symbols`, `@expo/ngrok`.

### Build & infrastructure
- **EAS Build** (`frontend/eas.json`): `development` (dev client), `preview` (internal APK), `production` (`autoIncrement: true`, `appVersionSource: "remote"`). EAS project `e4aa3746-6261-41f1-bb3d-b0a87b6f0f6e`, owner `sr8mu`.
- **GitHub Actions** (`.github/workflows/ingest-news.yml`): cron `0 */2 * * *`.
- **Render**: backend hosting (inferred from the hardcoded fallback URL + `runtime.txt`; no config file in repo).
- **Supabase**: Postgres (port 6543 = pgBouncer transaction pooler), Auth, and Storage bucket `article-images`.

---

## 3. Folder & File Structure

```
/home/shashwat/Shashwatsr8
├── README.md                          # 1 line, placeholder. Ignore.
├── design_guidelines.json             # Original design spec. STALE — its palette (#020617/#3B82F6)
│                                      #   does NOT match the shipped theme.ts (#040710/#00D1FF).
├── test_result.md                     # Agent-era task log from Sessions 1–3. Historical only.
├── .emergent/                         # Scaffolding metadata from the "Emergent" agent that bootstrapped
│   ├── emergent.yml                   #   this project. summary.txt claims auth is broken — STALE, it works.
│   └── summary.txt
├── memory/PRD.md                      # Product requirements + changelog + roadmap. Good context,
│                                      #   but several sections are outdated (see §10).
├── tests/__init__.py                  # Empty. No root-level tests exist.
├── test_reports/                      # Archived pytest XML/JSON from iterations 1–3.
├── .github/workflows/ingest-news.yml  # Cron: runs backend/ingestor.py every 2 hours.
│
├── backend/                           # FastAPI service — ALL server code
│   ├── server.py            (842 L)   # ★ FastAPI app, every HTTP route, startup DB migrations
│   ├── ingestor.py         (1053 L)   # ★ RSS → AI summary → categorize → dedupe → insert → schedule push
│   ├── notification_worker.py (342 L) # ★ Production push worker: claim jobs, batch send, poll receipts
│   ├── database.py          (197 L)   # ★ psycopg2 pool + pre-ping + retry wrappers (query/execute/…)
│   ├── auth.py              (132 L)   # ★ Thin HTTP proxy to Supabase Auth REST + get_current_user()
│   ├── image_optimizer.py   (163 L)   # Unsplash CDN params, or Pillow→WebP→Supabase Storage upload
│   ├── notifier.py           (77 L)   # LEGACY Expo sender. Only used by POST /api/push/send.
│   ├── requirements.txt     (144 pkgs)# Raw pip freeze
│   ├── runtime.txt                    # python-3.11.10
│   ├── .env / .env.example            # .env is gitignored. .env.example is INCOMPLETE (see §6).
│   ├── tests/
│   │   ├── test_aibrief_api.py (380 L)# Integration tests vs a live EXPO_PUBLIC_BACKEND_URL
│   │   └── test_data_quality.py(433 L)# Data-quality assertions (hardcoded ">= 261 articles")
│   │
│   ├── ── one-off maintenance scripts (run manually, not imported by the app) ──
│   ├── purge_stale_tokens.py          # Poll Expo receipts → delete DeviceNotRegistered tokens
│   ├── run_recategorize.py            # Re-run category detection over all articles
│   ├── backfill_thumbnails.py         # Populate articles.thumbnail_url for existing rows
│   ├── migrate_image_source.py        # ALTER TABLE articles ADD image_source_type
│   ├── disable_broken_feeds.py        # Deactivate sources whose feeds fail. ⚠ BROKEN — see §10
│   ├── dedup_images.py                # Report/fix repeated image_url across articles
│   ├── check_broken_images.py         # Audit image_url reachability
│   ├── full_image_audit.py            # Wider image audit over all published articles
│   ├── fix_all_missing_images.py      # Assign pool images where image_url is null/empty
│   ├── reshuffle_fallback_images.py   # Re-seed fallback_pool/arxiv_pool images
│   ├── check_arxiv_images.py          # Report arXiv articles with bad images
│   ├── fix_arxiv_images.py            # Repair arXiv images
│   ├── fix_null_arxiv.py              # Repair null/broken arXiv images
│   ├── force_arxiv_pool.py            # Force ALL arXiv articles onto ARXIV_IMAGE_POOL
│   ├── harden_arxiv_images.py         # Reset legacy arXiv og:image/rss types → arxiv_pool
│   │
│   ├── ── manual push-debug scripts ──
│   ├── test_push.py                   # List tokens in DB, send a test push
│   ├── test_fcm_direct.py             # Bare Expo send, bypasses database.py import
│   ├── test_receipt.py                # Fetch a receipt for a hardcoded ticket ID
│   ├── test_push_injection.py         # Insert a synthetic article to trigger the push path
│   ├── test_production_push.py        # Full prod send + receipt check
│   ├── test_end_to_end_push.py        # Newest token → send → receipt
│   ├── test_send_push_for_article.py  # CLI: send a push for a given article_id
│   ├── test_simulate_ingest_cron.py   # Simulate the cron ingestion run
│   ├── test_recategorize.py           # 4 lines; calls recategorize_articles()
│   ├── output*.txt                    # Debug stdout dumps (gitignored)
│   └── venv/ , .venv/                 # TWO committed-adjacent virtualenvs
│
└── frontend/                          # Expo React Native app
    ├── app.json                       # Expo config. ⚠ ios.infoPlist is SHADOWED by ios/ dir (see §10)
    ├── eas.json                       # EAS build profiles
    ├── package.json / yarn.lock / package-lock.json
    ├── tsconfig.json                  # strict, @/* alias
    ├── metro.config.js                # FileStore cache, maxWorkers 2
    ├── eslint.config.js               # expo flat config
    ├── .env                           # EXPO_PUBLIC_BACKEND_URL, EXPO_PUBLIC_USE_TEST_ADS (gitignored)
    ├── google-services.json           # ⚠ Firebase config, TRACKED IN GIT (see §10)
    ├── build-1776605268060.aab        # Stale build artifact (gitignored)
    │
    ├── app/                           # expo-router file-based routes
    │   ├── _layout.tsx      (365 L)   # ★ Root: AdsContext, AuthProvider, gated ATT→AdMob boot,
    │   │                              #   GlobalAuthObserver (routing guard), deep-link capture, splash
    │   ├── index.tsx         (20 L)   # "/" — renders only a spinner; routing is done by the observer
    │   ├── onboarding.tsx   (225 L)   # 5-page horizontal pager: 4 slides + CategoryPicker
    │   ├── login.tsx        (115 L)   # Email/password sign-in
    │   ├── signup.tsx       (126 L)   # Registration (handles email-confirmation-required state)
    │   ├── forgot-password.tsx(159 L) # Sends Supabase recovery email, 60s resend lockout
    │   ├── reset-password.tsx(242 L)  # Deep-link target; parses access_token OR PKCE code
    │   ├── search.tsx       (195 L)   # Debounced search + trending chips
    │   ├── privacy.tsx      (115 L)   # Static privacy policy (public route)
    │   ├── delete-account.tsx(320 L) # Permanent account deletion (5.1.1(v)); public route,
    │                                  #   signed-out variant + two-step destructive confirm
    │   ├── +html.tsx         (44 L)   # Web-only HTML shell
    │   ├── .privacy.tsx.swp           # ⚠ Stale 0-byte vim swap file inside the routes dir
    │   ├── (tabs)/
    │   │   ├── _layout.tsx   (89 L)   # Floating pill tab bar: Feed / Explore / Saved / Settings
    │   │   ├── index.tsx   (1353 L)   # ★ HOME FEED — the largest file in the app
    │   │   ├── categories.tsx(206 L)  # Category grid → per-category article list
    │   │   ├── bookmarks.tsx (110 L)  # Saved articles from context cache
    │   │   └── settings.tsx  (322 L)  # Push toggle (real opt-out), interests, links, share, account
    │   └── article/[id].tsx (195 L)   # Article detail (hero image, summary, actions, CTA)
    │
    ├── contexts/
    │   ├── AuthContext.tsx  (361 L)   # ★ THE app store: session, user, bookmarks, caches
    │   └── AdsContext.tsx    (20 L)   # Boolean gate: are native ad components safe to mount?
    ├── components/
    │   ├── NativeAdCard.tsx (300 L)   # Crash-safe AdMob native ad slot with a stable placeholder
    │   ├── ShareCard.tsx    (164 L)   # 1080×1080 off-screen card → PNG; CTA uses STORE_NAME
    │   ├── CategoryPicker.tsx(333 L)  # ★ Shared interest picker (onboarding step 5 + Settings modal);
    │                                  #   owns PREFERRED_CATEGORIES_KEY, MIN_CATEGORY_SELECTION=3,
    │                                  #   load/savePreferredCategories()
    │   └── NotificationPromptModal.tsx (200 L)  # ⚠ Fully built, imported NOWHERE — dead component
    ├── services/api.ts      (206 L)   # ★ fetch wrapper: timeout, 401→refresh→retry, all endpoints
    ├── utils/notifications.ts(206 L)  # ★ Single push path: permission → token → register/unregister,
    │                                  #   plus the `push_enabled` intent flag
    ├── constants/theme.ts    (69 L)   # Colors/Spacing/Radius/FontSize, TELEGRAM_URL, WEBSITE_URL,
    │                                  #   STORE_URL, STORE_NAME, buildShareMessage()
    ├── scripts/reset-project.js       # Expo template scaffolding script; unused
    ├── assets/                        # icon.png, adaptive-icon, splash-icon, favicon, SpaceMono font
    ├── android/                       # Ejected native Android (Gradle, Manifest, Kotlin entry points)
    └── ios/                           # Ejected native iOS (Info.plist, AppDelegate.swift, xcodeproj)
```

---

## 4. Architecture

### System diagram

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                        EXPO / REACT NATIVE APP (iOS · Android)                 │
│                                                                               │
│   app/_layout.tsx ── AdsContext ─ AuthProvider ─ GlobalAuthObserver ─ Stack    │
│         │                                                                     │
│   ┌─────┴──────────────────────────────────────────────────────────────┐      │
│   │ (tabs)/index  (tabs)/categories  (tabs)/bookmarks  (tabs)/settings │      │
│   │ article/[id]  search  login  signup  forgot/reset-password  privacy│      │
│   └─────┬──────────────────────────────────────────────────────────────┘      │
│         │ all data access goes through …                                      │
│   services/api.ts  ── AsyncStorage(auth_token, auth_refresh_token)             │
└─────────┼─────────────────────────────────────────────────────────────────────┘
          │ HTTPS  {BASE_URL}/api/*     Authorization: Bearer <supabase jwt>
          ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│              FastAPI  ·  backend/server.py  ·  Render (single web service)     │
│                                                                               │
│   APIRouter(prefix="/api")   CORS: allow_origins=["*"]                        │
│   _run_migrations()  ← executes at MODULE IMPORT, before the app object exists │
│                                                                               │
│   auth.py ──httpx──►  Supabase Auth  (/auth/v1/signup|token|user|recover|…)    │
│   database.py ──psycopg2 pool──►  Supabase Postgres  (port 6543, pgBouncer)    │
│   notification_worker.py ──requests──►  Expo Push API (send + getReceipts)     │
│   image_optimizer.py ──►  Supabase Storage bucket "article-images"             │
└─────────┬──────────────────────────────────────┬──────────────────────────────┘
          │                                      │
          ▼                                      ▼
┌──────────────────────────┐        ┌────────────────────────────────────────┐
│  Supabase Postgres       │        │  External services                     │
│  articles · sources      │        │  · OpenAI  gpt-4o-mini  (summaries)    │
│  bookmarks · users       │        │  · Expo Push  (exp.host)               │
│  push_tokens             │        │  · RSS feeds (rows in `sources`)       │
│  notification_jobs       │        │  · ar5iv.org (arXiv figure scraping)   │
│  notification_logs       │        │  · Unsplash CDN (fallback imagery)     │
│  app_settings            │        │  · Google AdMob · Meta SDK             │
└──────────────────────────┘        └────────────────────────────────────────┘
          ▲
          │  every 2 hours
┌─────────┴─────────────────────────────────────────────────────────────────────┐
│  GitHub Actions "Ingest AI News"  →  `cd backend && python3 ingestor.py`       │
│  Runs the pipeline OUT-OF-PROCESS from the API, against the same database.     │
│  It calls notification_worker.run_pending_jobs() inline at the end.            │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Entry points & startup flow

**Backend** — `backend/server.py`, served as `server:app`:
1. `load_dotenv(backend/.env)`.
2. **Importing `database.py` constructs the connection pool immediately** (`minconn=2`). If the DB is
   unreachable at import, the process dies at boot — there is no lazy/deferred connection.
3. `_run_migrations()` is called at **module scope** (line 161), before `app = FastAPI(...)`. It:
   - `CREATE TABLE IF NOT EXISTS push_tokens, notification_logs, notification_jobs`
   - Adds indexes (`idx_notif_jobs_article` UNIQUE on `article_id`, `idx_notif_jobs_status_sched`, `idx_push_tokens_active`)
   - `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for push_tokens hygiene, articles notification tracking, notification_logs ticket fields
   - Creates the partial UNIQUE index on `articles(article_url)`
   - Runs **three full-table `UPDATE`s** normalizing `articles.source_url` to bare origin
   All of this re-runs on every process/worker boot. Failures are caught and logged as a warning.
4. Routes are registered on `api_router` then `app.include_router(api_router)`.
5. CORS middleware added last.

**Frontend** — `expo-router/entry` → `app/_layout.tsx` → `RootLayout`:
1. Module scope: `SplashScreen.preventAutoHideAsync()`, `Notifications.setNotificationHandler(...)` (non-web).
2. `RootLayout` mounts `AdsContext.Provider(adsEnabled=false)` → `GestureHandlerRootView` → `AuthProvider` → `Stack`.
3. `useAdsBootstrap()` runs the ATT→ads chain, but **only once four gates hold**: `AppState` is
   `active` (it subscribes and waits otherwise, and re-checks at the last moment), the root navigator
   has mounted, `InteractionManager` has settled, and `ATT_PROMPT_DELAY_MS` (splash-hide 800 ms +
   500 ms) has elapsed. Then `getTrackingPermissionsAsync()` → prompt **only if `undetermined`** →
   `mobileAds().initialize()` → on success `setAdsEnabled(true)`. The Meta SDK is initialized in the
   same step but **on Android only** (see §10 item 38).
   If AdMob init throws, `adsEnabled` stays false and only placeholders render — the app never crashes on ads.
4. `AuthProvider` runs `loadSession()`: reads `auth_token` / `auth_refresh_token` / `has_onboarded` from
   AsyncStorage with a **3-second race timeout**, optimistically trusts the stored token, sets `loading=false`.
5. `GlobalSplashHider` hides the splash on a fixed **800 ms timer** (not tied to data readiness).
6. `GlobalDeepLinkCapture` stores any URL containing `reset-password` into `@pending_reset_url`.
7. `GlobalAuthObserver` is the **sole navigation authority** — screens never redirect on login/signup:
   - `!hasOnboarded` → `/onboarding`
   - `!token` → allowed segments `[(tabs), article, search, login, signup, forgot-password, reset-password, privacy]`, else `replace('/(tabs)')`
   - `token` → allowed `[(tabs), article, search, privacy, reset-password]`, else `replace('/(tabs)')`
   - `PUBLIC_ROUTES = ['/privacy','/terms','/support','/delete-account']` bypass everything. `/privacy`
     and `/delete-account` exist; **`/terms` and `/support` still do not**. Because the observer returns
     early on these paths it will not navigate when the token clears — which is why `delete-account.tsx`
     does its own `router.replace('/(tabs)')` after a successful deletion.
   It also registers the notification-response listener and calls `requestAndRegisterPushToken`.

### API layer — every endpoint

All routes are mounted under `/api`. Auth = `Authorization: Bearer <supabase access_token>`,
validated by `get_current_user()` in `backend/auth.py`, which makes a **live HTTP call to
`GET {SUPABASE_URL}/auth/v1/user` on every request** (no local JWT verification, no caching).

| # | Method | Path | Auth | Params / Body | Returns | Handler |
|---|---|---|---|---|---|---|
| 1 | POST | `/api/auth/signup` | – | `{email, password, name?}` | `{access_token, refresh_token, user:{id,email,name}}` — tokens are `null` when Supabase requires email confirmation | `signup` |
| 2 | POST | `/api/auth/login` | – | `{email, password}` | `{access_token, refresh_token, user:{id,email,name}}` | `login` |
| 3 | GET | `/api/auth/me` | ✅ | – | `{id, email, name}` (name = email local-part) | `get_me` |
| 4 | POST | `/api/auth/refresh` | – | `{refresh_token}` | `{access_token, refresh_token, user:{id,email}}`; 401 if expired | `refresh` |
| 5 | POST | `/api/auth/reset-password` | – | `{email}` | `{success, message}`; sends recovery mail with `redirect_to=aibrief24://reset-password` | `reset_password` |
| 6 | POST | `/api/auth/update-password` | – (token in body) | `{access_token, new_password}` | `{success, message}` | `update_password` |
| 7 | POST | `/api/auth/exchange-code` | – | `{code}` | Raw Supabase PKCE token payload | `exchange_code` |
| 8 | POST | `/api/auth/logout` | optional | – | `{success:true}` (always 200) | `logout` |
| 9 | DELETE | `/api/auth/account` | ✅ | – | `{success:true, message:"Account deleted"}`. Deletes bookmarks → push_tokens → users (each best-effort, logged and continued), then the Supabase Auth user via the Admin API, which **must** succeed or it returns **500** `{success:false, message, detail}` | `delete_account` |
| 10 | GET | `/api/articles` | – | `?category=&limit=50&offset=0` | `{articles:[…], total:int}` | `get_articles` |
| 11 | GET | `/api/articles/breaking` | – | – | `{articles:[…]}` (`is_breaking=true`, max 10) | `get_breaking` |
| 12 | GET | `/api/articles/search` | – | `?q=&limit=20` | `{articles:[…], total}` (synonym-expanded, relevance-ranked) | `search_articles` |
| 13 | GET | `/api/articles/{article_id}` | – | UUID path param | Single article object; **404** if absent, **500** if not a valid UUID | `get_article` |
| 14 | GET | `/api/categories` | – | – | `{categories:[{name,count}] × 9}` | `get_categories` |
| 15 | GET | `/api/bookmarks` | ✅ | – | `{bookmarks:[full article rows]}` | `get_bookmarks` |
| 16 | POST | `/api/bookmarks` | ✅ | `{article_id}` | `{success:true,message}` or `{success:false,error:"BOOKMARK_LIMIT_REACHED",message}` | `add_bookmark` |
| 17 | DELETE | `/api/bookmarks/{article_id}` | ✅ | path param | `{success:true,message:"Removed"}` | `remove_bookmark` |
| 18 | GET | `/api/bookmarks/ids` | ✅ | – | `{ids:[uuid strings]}` | `get_bookmark_ids` |
| 19 | POST | `/api/push/register` | optional | `{token, platform}` | `{success:true}`; upserts on `token` conflict and **re-activates** (`is_active=true, updated_at=NOW()`) | `register_push_token` |
| 20 | POST | `/api/push/unregister` | optional* | `{token}` | `{success:true, message}`; sets `is_active=false`. Idempotent — unknown token still 200. *If a Bearer is present **and** the row has a `user_id`, they must match or **403** | `unregister_push_token` |
| 21 | POST | `/api/push/send` | ⚠ **NONE** | `?article_id=` (query) | `{success, sent, errors, tokens}` — blasts **all** tokens immediately | `send_notification` |
| 22 | POST | `/api/admin/ingest` | `X-Admin-Key` | – | `{status:"accepted", message}` — returns instantly, work runs in a BackgroundTask | `trigger_ingestion` |
| 23 | POST | `/api/admin/process-notifications` | `X-Admin-Key` | – | `{success, processed, sent, failed, no_tokens}` | `process_notifications` |
| 24 | GET | `/api/admin/notification-status` | `X-Admin-Key` | – | `{jobs:{status→count}, tokens:{active,inactive,total}}` | `notification_status` |
| 25 | POST | `/api/admin/recategorize` | ⚠ **NONE** | – | `{updated, total_checked}` — rewrites `category` on every article | `recategorize_articles` |
| 26 | GET | `/api/settings` | – | – | `{notifications_enabled_default, telegram_url, website_url}` (hardcoded fallback if table empty) | `get_settings` |
| 27 | GET | `/api/sources` | – | – | `{sources:[{name,url,type,active,category_hint}], total}` | `get_sources` |
| 28 | GET | `/api/health` | – | – | `{status, auth, database, articles_count, sources_count}` | `health` |
| 29 | GET | `/api/health/db` | – | – | `{status:"ok", result:1}`; **503** on failure | `health_db` |
| 30 | GET | `/api/` | – | – | `{app:"AIBrief24", version:"2.0.0", tagline, auth:"supabase"}` | `root` |

**Route-order note:** `/articles/breaking` (line 422) and `/articles/search` (line 495) are declared
*before* `/articles/{article_id}` (line 543), so they are matched correctly. Do not reorder them.

**`GET /api/articles` logic in detail** (`server.py:340-419`) — this is more intricate than it looks:
- **Category branch** (`category` set and ≠ `"Latest"`): `DISTINCT ON (LOWER(TRIM(title)))` dedupe, ordered by `COALESCE(published_at, created_at) DESC`. No freshness window, no content-quality filter.
- **Latest branch**: same dedupe **plus** a 2-day freshness window and `title`/`summary` non-empty filters.
- **7-day fallback**: if the 2-day query returns fewer than `limit` rows *and* `offset == 0`, the whole query re-runs with a 7-day window.
- **arXiv curation** (Latest only): caps arXiv items at `MAX_ARXIV = 4` (unless the feed would drop below 15 items), then interleaves one arXiv card after every 3 non-arXiv cards. **This ordering is thrown away by the client**, which re-sorts by `published_at DESC` — see §10.

---

## 5. Data Layer

### Database
**Supabase PostgreSQL**, reached directly with `psycopg2` (not the Supabase SDK) via
`SUPABASE_DB_HOST:6543` — port 6543 is Supabase's **pgBouncer transaction pooler**.
`backend/database.py` holds a `ThreadedConnectionPool(minconn=2, maxconn=10, connect_timeout=10)`.

Every helper does **pre-ping + one retry**: `_get_conn()` runs `SELECT 1`, discards the connection with
`putconn(conn, close=True)` if it fails, and `query`/`execute`/`insert_returning` retry once when the
exception message matches `_RETRIABLE_MESSAGES` (broken pipe, server closed the connection, SSL closed, …).

### Schema

> There is **no migrations directory and no ORM**. Schema lives in three places: the
> `CREATE TABLE`/`ALTER TABLE` block in `_run_migrations()` (`server.py:33-159`), the Supabase dashboard
> (for tables created there originally), and implicit column usage across the code. Columns below are
> reconstructed from actual SQL in the repo; types marked *(inferred)* are not declared anywhere in-repo.

#### `articles` — core content table
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Generated in Python (`uuid.uuid4()`), not by the DB |
| `title` | TEXT | |
| `summary` | TEXT | OpenAI-generated, or truncated feed content on fallback |
| `image_url` | TEXT | 800px main image |
| `thumbnail_url` | TEXT | 400px WebP; may be NULL |
| `source_name` | TEXT | Matches `sources.name` |
| `source_url` | TEXT | Bare origin (`https://host`), normalized by startup migration |
| `article_url` | TEXT | **Partial UNIQUE index** `idx_articles_article_url` where not null/empty — the primary dedupe key |
| `category` | TEXT | One of the 9 canonical values |
| `published_at` | TIMESTAMPTZ | From feed, falls back to now() |
| `created_at` | TIMESTAMPTZ | *(inferred)* Ingest time |
| `status` | TEXT | Always `'published'` on insert; all reads filter on it |
| `is_breaking` | BOOLEAN | Always inserted `false`. **Nothing in the repo ever sets it true** |
| `notification_sent` | BOOLEAN | Set true by `_mark_article(..., 'sent')` |
| `ai_relevance_score` | NUMERIC *(inferred)* | From `_calculate_ai_relevance()` |
| `category_confidence_score` | NUMERIC *(inferred)* | From `_detect_category_strict()` |
| `original_category` | TEXT | The keyword-scorer's verdict, kept for auditing vs. the LLM's |
| `image_source_type` | VARCHAR(50) | `og_image` \| `twitter_image` \| `rss` \| `hero_scrape` \| `arxiv_figure` \| `arxiv_pool` \| `fallback_pool` |
| `notification_status` | TEXT | Added by migration: `sent` \| `failed` \| `skipped` \| `no_tokens` |
| `notification_sent_at` | TIMESTAMPTZ | Added by migration |
| `notification_error` | TEXT | Added by migration |

#### `sources` — RSS feed registry
`id`, `name` (TEXT, joined to `articles.source_name`), `url` (feed URL), `type`, `active` (BOOLEAN — only
`true` rows are ingested), `category_hint` (TEXT, fallback category when the LLM and keyword scorer both abstain).
**Rows are managed in the Supabase dashboard — there is no seed file in this repo.**

#### `bookmarks`
`id`, `user_id` (Supabase auth user id), `article_id` (UUID → `articles.id`), `created_at`.
Two DB-side objects referenced by error handling in `add_bookmark` but **not defined anywhere in this repo**:
- `unique_user_article_bookmark` — unique constraint on `(user_id, article_id)`
- `trg_enforce_bookmark_limit` — trigger raising `BOOKMARK_LIMIT_REACHED` at **100 bookmarks/user**

#### `users`
`id` (Supabase auth uid), `email`. Used purely as a profile mirror by `_upsert_profile()`.
A `profiles` table is queried in `login()` but per the PRD **does not exist** — the query is inside a
bare `try/except` and its result is discarded anyway (see §10).

#### `push_tokens` *(created by `_run_migrations`)*
`id` UUID PK default `gen_random_uuid()`, `token` TEXT UNIQUE NOT NULL, `platform` TEXT default `'unknown'`,
`user_id` TEXT (nullable — anonymous devices register too), `created_at` TIMESTAMPTZ,
plus migration-added `is_active` BOOLEAN default true, `last_success_at` TIMESTAMPTZ, `last_error` TEXT,
`updated_at` TIMESTAMPTZ. Index `idx_push_tokens_active` on `is_active`.
`is_active` is the single delivery kill-switch: the worker filters on it, `DeviceNotRegistered`
clears it, `/push/unregister` clears it, and `/push/register` restores it.

#### `notification_jobs` *(created by `_run_migrations`)*
`id` UUID PK, `article_id` UUID NOT NULL, `status` TEXT default `'pending'`
(`pending`→`processing`→`sent`/`failed`/`no_tokens`), `attempt_count` INT default 0, `max_attempts` INT
default 3, `scheduled_at` TIMESTAMPTZ default now(), `processed_at`, `created_at`, `updated_at`, `error` TEXT.
Indexes: `idx_notif_jobs_article` **UNIQUE** on `article_id` (one job per article, ever),
`idx_notif_jobs_status_sched` on `(status, scheduled_at)`.

#### `notification_logs` *(created by `_run_migrations`)*
`id` UUID PK, `article_id` TEXT, `status` TEXT, `provider_response` TEXT, `created_at`,
plus migration-added `job_id` TEXT, `token` TEXT, `ticket_id` TEXT, `receipt_status` TEXT, `error` TEXT.
One row **per token per send**.

#### `app_settings`
`notifications_enabled_default` BOOLEAN, `telegram_url` TEXT, `website_url` TEXT. Read with `LIMIT 1`.

### Relationships
```
sources.name ──(string join, no FK)──► articles.source_name
articles.id  ──► bookmarks.article_id          (cast ::text on both sides in queries)
articles.id  ──► notification_jobs.article_id  (UNIQUE)
articles.id  ──► notification_logs.article_id
auth.users   ──► bookmarks.user_id, push_tokens.user_id, users.id
notification_jobs.id ──► notification_logs.job_id
push_tokens.token    ──► notification_logs.token
```

### Migrations & seed data
- **Migrations:** only `_run_migrations()` at backend import. Idempotent, additive-only, never drops.
  `backend/migrate_image_source.py` is a standalone one-off for the `image_source_type` column.
- **Seed data:** none in the repo. The `sources` list (≈50–60 feeds per the PRD) and `app_settings` were
  seeded manually in Supabase. **A fresh Supabase project will produce an app with an empty feed** until
  `sources` rows are inserted by hand.

### External APIs & services
| Service | Purpose | Where in code |
|---|---|---|
| **Supabase Auth** (`/auth/v1/*`) | signup, token, user, refresh, recover, PKCE exchange, logout | `backend/auth.py` (all functions) |
| **Supabase Postgres** | all persistence | `backend/database.py` |
| **Supabase Storage** (`article-images` bucket) | compressed WebP thumbnails | `image_optimizer._download_compress_upload()` |
| **OpenAI** `gpt-4o-mini` | summary + category in one JSON call (`max_tokens=300`, `temperature=0.3`, `response_format=json_object`) | `ingestor._generate_summary_and_category()` |
| **Expo Push** `exp.host/--/api/v2/push/send` | notification delivery, 100/batch | `notification_worker._batch_send()`, `notifier.send_expo_notifications()` |
| **Expo Receipts** `…/push/getReceipts` | delivery confirmation, `DeviceNotRegistered` detection | `notification_worker.poll_receipts()`, `purge_stale_tokens.py` |
| **RSS/Atom feeds** | content source | `ingestor.ingest_source()` via `feedparser` |
| **ar5iv.org** | arXiv HTML mirror, scraped for real paper figures | `ingestor._get_arxiv_image()` |
| **Unsplash CDN** | 30-URL + 20-URL fallback image pools; also native `?w&q&fm=webp` transforms | `ingestor.IMAGE_POOL`, `image_optimizer._optimize_unsplash_url()` |
| **Google favicon** `s2/favicons` | source logo in the no-image placeholder | `(tabs)/index.tsx` `ImageBlock` |
| **Google AdMob** | native ads in-feed | `components/NativeAdCard.tsx`, `app/_layout.tsx` |
| **Meta (Facebook) SDK** | install/event attribution — **Android only**; the iOS project has no Meta config at all (§10 item 38) | `app/_layout.tsx` `initAdSdks()` |

---

## 6. Auth & Security

### Model
Supabase Auth (email + password) with the **FastAPI backend acting as a pure proxy**. The mobile app never
talks to Supabase directly — it has no Supabase client, and the anon key is not used on the device.

### Step-by-step flows

**Signup**
1. `signup.tsx` validates (all fields present, password ≥ 6) → `AuthContext.signup()`.
2. `AuthContext` races `api.signup()` against a **10-second timeout**.
3. `POST /api/auth/signup` → `auth.supabase_signup()` → `POST {SUPABASE_URL}/auth/v1/signup`.
4. Backend calls `_upsert_profile(user_id, email)` → `INSERT INTO users … ON CONFLICT (id) DO UPDATE` (failures are logged, never block).
5. If Supabase returns tokens → context sets `token`/`user`, fire-and-forget-writes AsyncStorage, `GlobalAuthObserver` routes to `/(tabs)`.
   If **email confirmation is enabled**, no token comes back → `{needsConfirmation:true}` → the screen shows "check your email".

**Login**
1. `login.tsx` → `AuthContext.login()` → `POST /api/auth/login` → Supabase `/token?grant_type=password`.
2. Backend upserts the profile row, then returns `access_token`, `refresh_token`, `user`.
3. Context sets state **synchronously first**, and writes AsyncStorage **fire-and-forget** (a deliberate
   choice to avoid UI freezes on low-end devices — the comment says so explicitly).
4. Two delayed background effects then run: `syncUser()` after 500 ms (`GET /api/auth/me`) and
   `syncBookmarks()` after 1500 ms (`GET /api/bookmarks/ids`), both behind `InteractionManager.runAfterInteractions`.

**Authenticated request**
`services/api.ts` attaches `Authorization: Bearer <token>` → backend `get_current_user()` calls
`GET {SUPABASE_URL}/auth/v1/user` with that token → returns `{sub, email, user}`. Any failure = HTTP 401.

**Token refresh** — three independent mechanisms:
1. **Reactive** (`api.ts`): a 401 on a non-auth path triggers `_doRefresh()`. A module-level
   `_refreshPromise` lock ensures concurrent 401s share one refresh call. On success the original request
   is retried exactly once (`_isRetry` guard). On failure it throws `{"code":"SESSION_EXPIRED"}`.
2. **Proactive** (`AuthContext`): `setInterval` every **50 minutes** + on `AppState` → `active`.
3. **Cross-layer sync**: `setTokenUpdateHandler()` lets `api.ts` push a refreshed token back into React state.

**Session expiry** → `AuthContext.forceLogout()`: clears state + AsyncStorage, `router.replace('/login')`,
shows a one-shot "Session Expired" alert (guarded by a module-level `sessionAlertShown` flag).

**Password reset** (the most intricate flow — see §7.5).

**Storage:** `auth_token`, `auth_refresh_token`, `has_onboarded`, `push_prompt_dismissed_v2`,
`push_enabled`, `preferred_categories`, `@pending_reset_url` — all in **plaintext AsyncStorage**
(no Keychain/Keystore, no expo-secure-store).

**Authorization:** there is effectively one role — an authenticated user. Ownership is enforced by
always scoping bookmark queries with `WHERE user_id = %s` from the verified token. Admin endpoints use a
static shared secret: `X-Admin-Key` compared against `ADMIN_KEY`. **`_require_admin()` returns
immediately — allowing anyone — when `ADMIN_KEY` is unset.** No RLS policies exist in this repo
(the PRD lists RLS as an unfinished P3 item).

### Environment variables (names only)

**`backend/.env`** — required:
| Name | Used by |
|---|---|
| `SUPABASE_URL` | `auth.py` (all auth calls), `image_optimizer.py` (storage upload) |
| `SUPABASE_ANON_KEY` | `auth.py` `apikey` header; storage fallback key |
| `SUPABASE_DB_HOST` | `database.py` pool |
| `SUPABASE_DB_PORT` | `database.py` pool (default `6543`) |
| `SUPABASE_DB_USER` | `database.py` pool |
| `SUPABASE_DB_PASSWORD` | `database.py` pool |
| `SUPABASE_DB_NAME` | `database.py` pool (default `postgres`) |
| `OPENAI_API_KEY` | `ingestor.py` — if absent, summaries silently degrade to truncated feed text |
| `ADMIN_KEY` | `server.py` `_require_admin()` — **admin routes are open if this is empty** |
| `SUPABASE_SERVICE_ROLE_KEY` | `image_optimizer.py` (preferred over anon for uploads). In `.env.example` and CI, **absent from the local `.env`** |
| `DATABASE_URL` | In `.env.example` and CI secrets, but **never read by any code** |

⚠ **`backend/.env.example` is incomplete** — it lists only 5 vars and omits all five `SUPABASE_DB_*`
entries plus `ADMIN_KEY`. Following it verbatim produces a backend that cannot connect to Postgres.

**`frontend/.env`**:
| Name | Value in repo | Used by |
|---|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | `https://aibrief24-backend.onrender.com` | `services/api.ts` (falls back to the same URL hardcoded) |
| `EXPO_PUBLIC_USE_TEST_ADS` | `false` → **real ads live** | `components/NativeAdCard.tsx` |
| `SUPABASE_URL` | present | **unused** — no `EXPO_PUBLIC_` prefix and no babel dotenv transform |
| `SUPABASE_ANON_KEY` | present | **unused**, same reason |

**GitHub Actions secrets** (`.github/workflows/ingest-news.yml`): `OPENAI_API_KEY`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SUPABASE_DB_HOST`, `SUPABASE_DB_NAME`,
`SUPABASE_DB_PASSWORD`, `SUPABASE_DB_PORT`, `SUPABASE_DB_USER`.

**Non-secret identifiers hardcoded in the repo** (fine to know, do not treat as secrets):
AdMob app IDs `ca-app-pub-6497331440034971~8131854655` (Android) / `~1117847954` (iOS);
native ad units `…/1975616205` (Android), `…/2944834861` (iOS); Facebook app ID `1308022248155682`
with its client token in `app.json`; EAS project id `e4aa3746-…`; support email `aibrief2526@gmail.com`.

---

## 7. Core Feature Flows (most important section)

### 7.1 — Home feed: load, paginate, refresh

```
app/(tabs)/index.tsx :: HomeFeed
  └ useEffect(mount) → refreshArticles(false, false)                    [index.tsx:632]
      └ api.getArticles(undefined, 20, 0)                               [services/api.ts:156]
          └ GET /api/articles?limit=20&offset=0
              └ server.py :: get_articles(category=None, limit=20, offset=0)   [server.py:340]
                  ├ database.query(...)  DISTINCT ON (LOWER(TRIM(title)))
                  │    WHERE status='published'
                  │      AND COALESCE(published_at,created_at) >= NOW() - INTERVAL '2 days'
                  │      AND title <> '' AND summary <> ''
                  ├ if rows < limit and offset==0 → re-query with INTERVAL '7 days'
                  ├ arXiv curation: cap at MAX_ARXIV=4, interleave 1 arXiv per 3 non-arXiv
                  └ _serialize_list() → {articles:[…], total:int}
      └ setArticles(prev => …)
           · first load  → dedupe by id, sort published_at DESC, setOffset(n), setHasMore(n===20)
           · later loads → prepend only ids not already present, Image.prefetch() them,
                           shift `offset` by the number injected at the top
  └ ORDERING: rankArticles(rows, preferredRef.current)               [index.tsx:107]
       · no interests saved → published_at DESC (unchanged legacy behaviour)
       · interests saved    → day bucket DESC, then preferred-category first, then
                              published_at DESC — so personalization never lifts stale
                              news above fresh news. Purely client-side; the API call,
                              pagination and dedupe-by-id are untouched.
       · preferred list is read from AsyncStorage on mount and re-read in useFocusEffect,
         mirrored into a ref so AppState-captured closures see the current value
  └ HEADER: a "For you" pill renders beside the search button whenever
       preferredCategories.length > 0 — the only visible signal that the feed is re-ranked
  └ useMemo feedItems  → inserts {type:'ad', id:`ad-after-${i}`} after every 5 articles [index.tsx:524]
  └ <FlatList pagingEnabled snapToInterval={CARD_HEIGHT} getItemLayout=…>
       renderItem = renderCard  → NativeAdCard | ArticleCard                [index.tsx:749]

Pagination:  loadMore()  → api.getArticles(undefined, 15, offset)        [index.tsx:598]
             Triggered by BOTH onEndReached (threshold 3) AND a manual onScroll
             distance check — two independent triggers on the same list.

Auto-refresh: AppState 'active'  and  useFocusEffect, each gated on a
              3-minute `lastRefreshTime` cache window.                   [index.tsx:640, 653]
Pull-to-refresh: onPullRefresh → refreshArticles(false, true).
```

### 7.2 — Bookmark toggle (optimistic, with rollback)

```
Any of:  BookmarkButton (feed)        → toggleBookmark(article, bookmarked)    [index.tsx:219]
         article/[id].tsx top bar     → toggleBookmark(article, bookmarked)    [[id].tsx:84]
         article/[id].tsx action row  → toggleBookmark(article.id, bookmarked) [[id].tsx:131]  ⚠ passes a string
         bookmarks.tsx trash icon     → handleRemove(id) → toggleBookmark(id, true)

AuthContext.toggleBookmark(article, isCurrentlyBookmarked)             [AuthContext.tsx:285]
  ├ if (!token) → router.push('/login'); return
  ├ accepts either a full article object or a bare id string
  ├ OPTIMISTIC: mutate bookmarkIds + bookmarkedArticlesCache immediately
  ├ add:    api.addBookmark(token, id) → POST /api/bookmarks {article_id}
  │           └ server.py:571  INSERT INTO bookmarks … ON CONFLICT (user_id, article_id) DO NOTHING
  │              · DB trigger trg_enforce_bookmark_limit fires at 100 → caught, returns
  │                {success:false, error:"BOOKMARK_LIMIT_REACHED"}  → client ROLLS BACK + Alert
  └ remove: api.removeBookmark(token, id) → DELETE /api/bookmarks/{id}
              └ server.py:595  DELETE FROM bookmarks WHERE user_id=%s AND article_id::text=%s
  └ on SESSION_EXPIRED → forceLogout(); on any other network error → roll back both lists

Read path: bookmarks.tsx → loadBookmarks()                              [bookmarks.tsx:24]
  └ skips the network entirely when bookmarkedArticlesCache.length >= bookmarkIds.length
  └ else api.getBookmarks(token) → GET /api/bookmarks
        └ server.py:560  SELECT a.* FROM articles a
                         INNER JOIN bookmarks b ON a.id::text = b.article_id::text
                         WHERE b.user_id=%s ORDER BY b.created_at DESC
```

### 7.3 — Content ingestion (RSS → summary → category → row → push job)

Runs **out-of-process** in GitHub Actions every 2 h (`python3 ingestor.py`), and can also be triggered via
`POST /api/admin/ingest`, which returns `{"status":"accepted"}` immediately and does the work in a
FastAPI `BackgroundTask` (`_run_ingestion_background`, `server.py:674`).

```
ingestor.run_ingestion(dry_run=False)                                   [ingestor.py:890]
 ├ query("SELECT * FROM sources WHERE active = true ORDER BY name")
 ├ seen_image_session_cache = set()      # cross-source image dedupe for this run
 └ FOR EACH source → ingest_source(source, seen_images, dry_run)        [ingestor.py:679]
      ├ feedparser.parse(source.url);  bail if feed.bozo and no entries
      ├ entry limit: 2 if "arxiv" in source name else 15
      └ FOR EACH entry:
          1. skip if !link  ·  skip if _article_exists(article_url)      [SELECT … WHERE article_url=]
          2. _is_clustered_duplicate(title) — Jaccard ≥ 0.40 with ≥3 shared tokens against the
             last 50 articles from the past 6 h → skip cross-source pileups   [ingestor.py:407]
          3. _calculate_ai_relevance(title, content)                     [ingestor.py:136]
               · any FORBIDDEN_KEYWORDS hit ("tv","review","laptop",…) → score −100 → reject
               · else = count of AI_RELEVANCE_KEYWORDS occurrences
               · no category_hint → require ≥ 2.0 ; with hint → require > 0.0
          4. tutorial detection ("tutorial","how to","guide",…)
          5. _generate_summary_and_category(title, content)              [ingestor.py:310]
               → OpenAI gpt-4o-mini, JSON {summary, category}; category validated against 9 values
               → summary passed through _clean_summary_text() to strip "read more at …" sentences
               → on ANY failure: {summary: content[:400], category: None}
          6. _detect_category_strict(title, summary)                     [ingestor.py:231]
               weighted keyword scorer: required ×3 (title) / ×1 (body),
               bonus ×1.5/×0.5, penalty ×5/×2, per-category threshold, frontier-lab boost
          7. CATEGORY PRECEDENCE:  LLM category  →  strict_cat if in CONTENT_PRIORITY_CATS and
             conf ≥ 4.0  →  source.category_hint  →  strict_cat
          8. tutorials landing in "Latest" are dropped
          9. IMAGE RESOLUTION
             · arXiv  → _get_arxiv_image(): ar5iv figure scrape (skip <100px), else ARXIV_IMAGE_POOL
             · other  → _fetch_og_image() (og:image → twitter:image → first large <img>)
                        → _extract_rss_image() (media_content/media_thumbnail/enclosures)
                        → session dedupe → _pick_image() from IMAGE_POOL
             · then optimize_image_url() → (800px main, 400px WebP thumb)   [image_optimizer.py:143]
         10. INSERT INTO articles (… 17 columns …) ON CONFLICT DO NOTHING RETURNING id
         11. PUSH QUALIFICATION  [ingestor.py:841]
               category ∈ HIGH_SIGNAL_CATS
               AND relevance ≥ MIN_RELEVANCE_FOR_NOTIFY (4.0)
               AND confidence ≥ MIN_CONFIDENCE_FOR_NOTIFY (2.5)
               AND freshness: age ≤ 12 h  (or published_at missing → treated as fresh)
             → appended to metrics["qualified_jobs"], NOT sent yet
 ├ SCHEDULING (after all sources)                                       [ingestor.py:945]
 │    · daily cap: count notification_jobs scheduled today vs MAX_NOTIFICATIONS_PER_DAY (6)
 │    · priority sort: breaking first, then Big Tech AI > AI Models > Product Launches >
 │      Funding News > others, then relevance DESC
 │    · truncate to remaining slots
 │    · space by MIN_GAP_BETWEEN_NOTIFICATIONS_MINS (90) and shift out of IST quiet hours
 │      22:00–07:00 via _shift_past_quiet_hours()                       [ingestor.py:660]
 │    · INSERT INTO notification_jobs (article_id, scheduled_at) ON CONFLICT DO NOTHING
 └ if jobs were created → notification_worker.run_pending_jobs(limit=50) INLINE
```

### 7.4 — Push notification delivery (job → device → receipt → token hygiene)

```
notification_worker.run_pending_jobs(limit=50)                          [notification_worker.py:102]
 0. GLOBAL THROTTLE: MAX(processed_at) WHERE status='sent'; if < 1800 s ago → return
    {"throttled":"30m_spacing_required"}                                 [line 120]
 1. CLAIM atomically:
      UPDATE notification_jobs SET status='processing', attempt_count=attempt_count+1
      WHERE id IN (SELECT id … WHERE status='pending' AND attempt_count<max_attempts
                   AND scheduled_at<=NOW() ORDER BY scheduled_at LIMIT n FOR UPDATE SKIP LOCKED)
      RETURNING id, article_id, attempt_count          ← safe for concurrent workers
 2. SELECT token FROM push_tokens WHERE is_active=true ORDER BY created_at DESC LIMIT 200
      ⚠ hard cap of 200 recipients per batch
 3. FOR EACH claimed job → _process_job()                                [line 201]
      a. SELECT id,title,category,is_breaking FROM articles WHERE id=%s::uuid
      b. _should_notify() — DELIVERY_POLICY is "all", so this always passes
      c. no tokens → raise _NoTokensError → job 'no_tokens', article 'no_tokens'
      d. _batch_send(): 100 messages/request to exp.host, title "AIBrief24",
         body = article.title[:120], data = {type:'article', articleId}
      e. INSERT one notification_logs row per token (ticket_id, status, receipt_status='pending')
      f. time.sleep(8)  → poll_receipts(ticket_ids) → _apply_receipts()
           · status ok            → push_tokens.last_success_at = NOW()
           · DeviceNotRegistered  → push_tokens.is_active = false, last_error set
      g. _mark_job('sent'), _mark_article('sent')  (sets notification_sent=true)
    Failure path: attempt_count >= max_attempts → 'failed', else reset to 'pending' for retry

Device side:
  utils/notifications.ts — the ONE push path, split into composable pieces:
    · getPushPermission() / requestPushPermission()  read vs. prompt, kept separate so the OFF
                            path can fetch a token WITHOUT triggering a permission dialog
    · getExpoPushToken()    Android channel setup, Device.isDevice guard, projectId from
                            expoConfig.extra.eas (literal UUID as last-resort fallback)
    · enablePushOnServer()  → api.registerPushToken()  → POST /api/push/register
    · disablePushOnServer() → api.unregisterPush()     → POST /api/push/unregister
    · isPushEnabled() / setPushEnabled()   the `push_enabled` intent flag
    · requestAndRegisterPushToken()  full opt-in flow built on the above; signature unchanged,
                            still used by _layout.tsx (launch) and the feed "Enable" CTA

  Launch auto-register is GATED: _layout.tsx skips it when isPushEnabled() === false, so an
  opt-out is never silently undone on the next cold start.

  Settings toggle: displayed value = push_enabled AND OS permission (derived, never optimistic).
    ON  + undetermined → prompt → register    ON  + denied → Alert w/ Linking.openSettings()
    ON  + granted      → register             OFF          → unregister
    Permission re-read on mount, useFocusEffect, and AppState 'active'.

  Tap handling: app/_layout.tsx :: GlobalAuthObserver                    [_layout.tsx:34]
    · getLastNotificationResponseAsync() for cold start
    · addNotificationResponseReceivedListener() for warm
    · dedupes on notification.request.identifier via processedNotificationId ref
    · router.push(`/article/${data.articleId}`)
```

### 7.5 — Password reset (deep link, dual-mode)

```
1. forgot-password.tsx → AuthContext.forgotPassword(email) → POST /api/auth/reset-password
     └ auth.supabase_reset_password() → POST /auth/v1/recover?redirect_to=aibrief24://reset-password
     └ UI: success screen + 60-second resend lockout (`rateLimited` state)

2. User taps the email link → OS opens the custom scheme `aibrief24://…`
     (registered in AndroidManifest intent-filter and app.json `scheme`)

3. app/_layout.tsx :: GlobalDeepLinkCapture — fires BEFORE the reset screen mounts, stashes any
   URL containing "reset-password" into AsyncStorage `@pending_reset_url`.       [_layout.tsx:117]

4. app/reset-password.tsx mounts:                                        [reset-password.tsx:61]
     · reads and CLEARS `@pending_reset_url`, else falls back to Linking.getInitialURL()
     · also subscribes to live `url` events
     · parseDeepLink() regex-extracts access_token | refresh_token | code | token | type
       from BOTH the query string and the fragment (`[#?&]param=`)
     · detects `expo-development-client` in the URL → shows a "won't work in dev client" warning

5. handleUpdate():
     mode = access_token ? 'access_token' : code ? 'code' : 'missing'
     · 'code'  → api.exchangeCode(code) → POST /auth/exchange-code
                 → Supabase /token?grant_type=pkce with an EMPTY code_verifier   ⚠ see §10
     · then    → api.updatePassword(token, newPassword) → POST /auth/update-password
                 → PUT {SUPABASE_URL}/auth/v1/user  {password}
     · success screen → router.replace('/login')
     · ANY failure is collapsed into one generic "link is invalid or expired" message
```

---

## 8. State Management & Navigation

### State — there is no Redux/Zustand/Jotai. Two React Contexts plus local component state.

**`contexts/AuthContext.tsx`** — the de-facto global store. Exposes:

| Value | Meaning |
|---|---|
| `user` / `token` / `loading` | Session. `loading=false` unblocks all routing. |
| `hasOnboarded` | Mirrors AsyncStorage `has_onboarded`. |
| `bookmarkIds: string[]` | Fast `isBookmarked()` lookups on every card. |
| `bookmarkedArticlesCache: any[]` | Full article objects for the Saved tab; kept in sync optimistically so the tab renders without a fetch. |
| `feedArticlesCache: any[]` | ⚠ **Always empty** — `setFeedArticlesCache` is never called anywhere. `search.tsx` reads it for local pre-filtering, so that path is dead. |
| `login/signup/logout/forgotPassword/completeOnboarding` | Auth actions. |
| `toggleBookmark/isBookmarked/refreshBookmarks` | Bookmark actions. |

Module-level (outside React) state worth knowing:
- `AuthContext.tsx` → `sessionAlertShown` — makes the expiry alert one-shot across remounts.
- `services/api.ts` → `_refreshPromise` (concurrent-401 lock) and `_tokenUpdateHandler` (context bridge).

**`contexts/AdsContext.tsx`** — a single `{adsEnabled: boolean}`, provided by `RootLayout` and flipped
true only after `mobileAds().initialize()` resolves. `NativeAdCard` refuses to mount any native ad view
until then; this is an explicit boot-crash guard, documented in the component header.

**Local-only state of note:** `HomeFeed` owns `articles`, `offset`, `hasMore`, `loading`, `refreshing`,
`shareArticle`, `sharePreparing`, `preferredCategories` and several `useRef`s (`lastRefreshTime`,
`shareInProgressRef`, `imageReadyResolveRef`, `flatListRef`, `preferredRef`).
`CategoriesScreen` owns its own separate article list and pagination.
`SettingsScreen` owns `pushEnabled` + `permGranted` (the toggle is the AND of the two — derived, never
optimistically flipped) and `interests`, both re-read on focus and on AppState `active`.

**Personalization is deliberately NOT in context.** `preferred_categories` is read straight from
AsyncStorage by whoever needs it (`HomeFeed`, `CategoryPicker`, `SettingsScreen`) via
`loadPreferredCategories()`. There is no provider, so a change in Settings reaches the feed on its
next `useFocusEffect`, not instantly.

**Persistence (AsyncStorage keys):** `auth_token`, `auth_refresh_token`, `has_onboarded`,
`push_prompt_dismissed_v2`, `push_enabled` (unset ⇒ true), `preferred_categories`,
`@pending_reset_url`.

### Navigation — expo-router (file-based), typed routes enabled

```
app/_layout.tsx  (Stack, headerShown:false, animation:'none', bg Colors.background)
├── index                     "/"                        spinner only
├── onboarding                "/onboarding"
├── login                     "/login"
├── signup                    "/signup"
├── forgot-password           "/forgot-password"
├── reset-password            "/reset-password"          deep-link target (aibrief24://reset-password)
├── privacy                   "/privacy"                 public route
├── delete-account            "/delete-account"          public route; account deletion
├── search                    "/search"                  animation: slide_from_right
├── article/[id]              "/article/:id"             animation: slide_from_right
└── (tabs)/_layout.tsx        floating pill tab bar, absolute-positioned, 4 tabs
    ├── index                 "/(tabs)"          "Feed"      Home icon
    ├── categories            "/(tabs)/categories" "Explore"  LayoutGrid icon
    ├── bookmarks             "/(tabs)/bookmarks"  "Saved"    Bookmark icon
    └── settings              "/(tabs)/settings"   "Settings" Settings icon
```

Routing rules are **centralized in `GlobalAuthObserver`** (`app/_layout.tsx:67-96`) — individual screens
never call `router.replace` on auth success; they just update context and let the observer react.
`categories.tsx` implements its detail view as **internal state** (`selectedCat`), not a route, so the
hardware back button exits the tab rather than returning to the grid.

---

## 9. Background Work

| Kind | What | Where | Schedule / Trigger |
|---|---|---|---|
| **Cron (CI)** | Full RSS ingestion + push scheduling + inline worker run | `.github/workflows/ingest-news.yml` → `backend/ingestor.py` `__main__` | `0 */2 * * *` (every 2 h UTC) + `workflow_dispatch`. `concurrency: ingest-news`, `cancel-in-progress: false` |
| **HTTP-triggered background task** | Same ingestion, in-process | `server.py:674` `_run_ingestion_background` via `BackgroundTasks` | `POST /api/admin/ingest` (returns `202`-style body immediately) |
| **Job queue** | `notification_jobs` table, claimed with `FOR UPDATE SKIP LOCKED` | `notification_worker.run_pending_jobs()` | Called inline at the end of ingestion, or on demand via `POST /api/admin/process-notifications`. **There is no always-on worker process or scheduler** |
| **Push delivery + receipts** | Expo send, 8 s wait, receipt poll, token deactivation | `notification_worker._process_job` / `_apply_receipts` | Within each job |
| **Startup migrations** | DDL + `source_url` normalization UPDATEs | `server.py:33` `_run_migrations()` | Every backend process import |
| **Manual maintenance** | Token purge, recategorize, thumbnail backfill, image repairs | `backend/purge_stale_tokens.py`, `run_recategorize.py`, `backfill_thumbnails.py`, `fix_*.py`, `harden_arxiv_images.py`, … | Run by hand: `python <script>.py` |
| **Client-side timers** | 50-min proactive token refresh; 3-min feed cache window; 800 ms splash hide; 60 s reset-resend lockout | `AuthContext.tsx:100`, `(tabs)/index.tsx:643`, `_layout.tsx:141`, `forgot-password.tsx:43` | In-app |

**Webhooks: none.** Nothing in this repo receives inbound callbacks — not from Supabase, Expo, AdMob, or
the app stores. Push receipts are **polled**, not pushed.

**Notification rate limiting is layered (and independent):**
1. `MAX_NOTIFICATIONS_PER_DAY = 6` — counted at scheduling time in `ingestor.py`.
2. `MIN_GAP_BETWEEN_NOTIFICATIONS_MINS = 90` — spacing applied to `scheduled_at`.
3. IST quiet hours 22:00–07:00 — `_shift_past_quiet_hours()`.
4. A **30-minute global send throttle** enforced separately inside `run_pending_jobs()`.
5. Freshness gate: articles older than **12 h** never qualify (tuned from 24 h → 6 h → 12 h across the last three commits).

---

## 10. Gotchas & Tech Debt

> Ordered roughly by how likely each is to bite you. Nothing here is speculative — every item cites a real file.

### 🔴 Correctness / security

1. **`/api/push/send` has no auth guard at all** (`server.py:630`). Anyone who knows an `article_id` can
   blast a push to every registered token. It also ignores `is_active`, sending to dead tokens.
2. **`/api/admin/recategorize` has no `_require_admin(request)` call** (`server.py:727`) — it doesn't even
   take a `Request`. Anyone can rewrite `category` on every row in `articles`.
3. **`_require_admin()` is a no-op when `ADMIN_KEY` is empty** (`server.py:665-670`) — "open in dev"
   silently means "open in prod" if the env var is missing on Render.
4. **`fix_article_images()` is orphaned dead code** (`server.py:758`). It sits directly after
   `recategorize_articles` with **no `@api_router` decorator**, so `POST /admin/fix-images` — documented
   in both `memory/PRD.md` and `test_result.md` — **does not exist**. Calling it 404s.
5. **CORS is `allow_origins=["*"]` together with `allow_credentials=True`** (`server.py:836`). Browsers
   reject that combination outright; it also removes any origin restriction for the web target.
6. **Every authenticated request costs a round-trip to Supabase.** `get_current_user()` (`auth.py:126`)
   calls `GET /auth/v1/user` — no local JWT signature verification, no cache. This is latency on every
   bookmark tap and a rate-limit exposure. `PyJWT` is already installed and unused.
7. **`aps-environment` is `development`** in `frontend/ios/AIBrief24/AIBrief24.entitlements`. EAS usually
   rewrites this for release builds, but if you build locally in Xcode, production pushes will not deliver.
8. **`frontend/google-services.json` is tracked in git.** `.gitignore` only covers
   `frontend/android/app/google-services.json`, not the copy at `frontend/`. Same for the Facebook
   `clientToken` sitting in plaintext in `app.json`.
9. **Tokens live in plaintext AsyncStorage** — no `expo-secure-store` / Keychain / Keystore.
10. **PKCE exchange sends an empty `code_verifier`** (`auth.py:102-108`). The comment openly admits it's a
    guess ("it usually accepts empty parameters dynamically"). If Supabase tightens PKCE, every
    code-mode password reset breaks — and the UI collapses the failure into a generic "link expired" message,
    making it very hard to diagnose from user reports.

### 🟠 Broken / stale code you will trip over

11. **`backend/disable_broken_feeds.py` raises `TypeError` immediately.** It calls
    `ingest_source(s, dry_run=True)`, but the signature became `ingest_source(source, seen_images, dry_run=False)`.
    It will pass `True` as `seen_images`.
12. **`backend/tests/test_aibrief_api.py::TestAdminIngest` is guaranteed to fail.** It asserts the response
    `status` is in `["done","no_sources","error"]` and that `total`/`results` exist — but `/admin/ingest`
    now returns `{"status":"accepted", "message": …}`. The tests were written against the old synchronous version.
13. **`test_data_quality.py` hardcodes `total >= 261` articles** and a "≥30% unique images" ratio. These are
    snapshots of a March 2026 database, not invariants.
14. **The whole backend test suite requires a live deployment** (`EXPO_PUBLIC_BACKEND_URL`) and skips
    entirely without it. There are **zero unit tests** — no mocking, no fixtures, no local DB.
15. **`components/NotificationPromptModal.tsx` (200 lines) is still imported nowhere.** The comment
    `// removed auto-prompting NotificationObserver` in `_layout.tsx` explains why. `login.tsx` and
    `signup.tsx` still declare an unused `showNotificationModal` state from that era. It now calls the
    refactored `requestAndRegisterPushToken()` (signature unchanged), so it still compiles — but it
    does **not** write the `push_enabled` intent flag, so if it were ever wired up it would grant
    permission without recording consent. Delete it, or finish it properly.
16. **`feedArticlesCache` is permanently empty**, so `search.tsx`'s local instant-filter branch
    (`search.tsx:43-50`) never produces results. Every keystroke goes to the network after a 400 ms debounce.
17. **`app/.privacy.tsx.swp`** — a 0-byte vim swap file inside the expo-router routes directory. Harmless
    today, but delete it; anything the router might scan there is a hazard.
18. **`login()` computes a display name and throws it away** (`server.py:258-274`): it queries `profiles`
    (a table the PRD says doesn't exist), assigns `name`, then the response literally uses
    `email.split("@")[0]` instead. The `profiles` query is pure dead weight inside a bare `except`.
19. **Two Expo push senders coexist.** `notifier.py` (legacy, used only by `/api/push/send`) and
    `notification_worker._batch_send` (production). They drift — only the worker records tickets.
20. **`DELIVERY_POLICY = "all"`** in `notification_worker.py:26` makes `_should_notify()` and
    `HIGH_SIGNAL_CATEGORIES` inert. The real filtering happens in `ingestor.py` with a *different*
    `HIGH_SIGNAL_CATS` list (the ingestor's includes `AI Research` and `AI Tools`; the worker's does not).
21. **`summary["sent"]` is incremented even when a job was skipped by policy** (`notification_worker.py:169-170`)
    — `_process_job` returns early for skips but the caller counts it as sent. Monitoring numbers are optimistic.

### 🟡 Design contradictions & hidden coupling

22. **The server's arXiv interleaving is discarded by the client.** `get_articles` carefully spaces arXiv
    cards (`server.py:389-417`), then `HomeFeed.refreshArticles`/`loadMore` re-sort everything by
    `published_at DESC` (`index.tsx:549`, `615`). The curation has no visible effect. Fix one side or the other.
23. **Feed pagination has two independent triggers** — `onEndReached` (`onEndReachedThreshold={3}`) *and*
    a manual distance check inside `onScroll` (`index.tsx:927-936`). Duplicate `loadMore()` calls are only
    prevented by the `loadingMore` flag.
24. **`refreshArticles` mutates `offset` from inside a `setArticles` updater** (`index.tsx:562`, `580`) —
    a side effect inside a state reducer. It works, but it will misbehave under React 19 strict/concurrent re-invocation.
25. **`renderCard` passes the *feed* index (which counts ad slots) into `ArticleCard`** (`index.tsx:762`),
    so `testID="article-title-N"` drifts by the number of ads above it. Breaks index-based E2E selectors.
26. **`non_arxiv = [r for r in rows if r not in arxiv_items]`** (`server.py:395`) is an O(n²) comparison of
    whole dicts. Fine at 50 rows; not fine if `limit` grows.
27. **`_is_clustered_duplicate` interpolates a parameter into a SQL string literal** —
    `INTERVAL '%s hours'` with `(hours,)` (`ingestor.py:418-422`). psycopg2 does substitute it, so it works,
    but it is a well-known footgun. Also, the function is called with only the title (`ingestor.py:707`),
    never the summary its signature supports.
28. **`_run_migrations()` runs at import, on every worker boot**, and includes three full-table `UPDATE`s
    on `articles`. As the table grows this becomes a real cold-start cost — and it also means the process
    dies at import if the DB is down (the pool in `database.py:19` is built eagerly too).
29. **The worker caps recipients at 200 tokens** (`notification_worker.py:158`,
    `ORDER BY created_at DESC LIMIT 200`). Beyond 200 active devices, the oldest ones silently stop
    receiving notifications. Nothing logs this truncation.
30. **`time.sleep(8)` per job inside the request path** (`notification_worker.py:247`). 50 claimed jobs =
    over 6 minutes of blocking. Called synchronously at the end of ingestion.
31. **Image pools contain duplicates.** `IMAGE_POOL` has 30 entries but only 25 unique URLs (the last 5
    repeat the first 5, `ingestor.py:175-179`); `ARXIV_IMAGE_POOL`'s last entry duplicates `IMAGE_POOL[0]`.
    The "30 unique verified" comment above it is wrong.
32. **`image_optimizer` derives thumbnail filenames from Python's `hash()`** (`image_optimizer.py:115`).
    `hash()` of a `str` is salted per process, so the same image gets a different filename on every run —
    unbounded duplicate uploads into the `article-images` bucket.
33. **`_fetch_og_image` can return `(None, "hero_scrape")`** (`ingestor.py:592`) — the ternary applies only
    to the URL, so a relative `src` yields a null URL paired with a non-null source type.
34. **`is_breaking` is never set true anywhere in the codebase** (always inserted `false`,
    `ingestor.py:845`). `/api/articles/breaking`, the BREAKING badge in the feed and detail screens, and the
    breaking-first push priority are all permanently dormant.
35. ~~The Settings notification toggle is cosmetic when turned off.~~ **FIXED.** The switch is now
    derived from `push_enabled` AND the OS permission; OFF calls `/push/unregister` to clear
    `is_active`, ON re-registers, and the launch auto-register respects the opt-out.
    **Remaining gap:** `/push/register` still swallows DB errors and returns `{"success": true}`
    regardless, so a failed ON is invisible to the client. Deferred to v1.2 on purpose — fixing
    it would start returning new 500s to already-shipped builds.
36. **Version numbers disagree in four places:** `app.json` `version: 1.0.2` / `versionCode 15`;
    `android/app/build.gradle` `versionCode 15` / `versionName "1.0.2"`; `ios/…/Info.plist`
    `CFBundleShortVersionString 1.0.1` / `CFBundleVersion 1`; and `settings.tsx:113` hardcodes
    `App Version 1.0.0` in the UI. `eas.json` also sets `appVersionSource: "remote"` + `autoIncrement`,
    so EAS overrides some of these at build time anyway.
37. ~~`app.json`'s `ios.infoPlist` would regress the Apple fixes on a prebuild.~~ **RESOLVED.**
    `app.json`'s `ios.infoPlist` is still dead config at runtime — `frontend/ios/` exists, so the native
    `Info.plist` wins — but it now mirrors the native values, so `expo prebuild --clean` reproduces them
    instead of reverting them. All three Apple-facing fixes are synced:
    `NSUserTrackingUsageDescription` (byte-identical to the native string), `ITSAppUsesNonExemptEncryption:
    false`, and `supportsTablet: false` matching `TARGETED_DEVICE_FAMILY = "1"` in both Debug and Release
    of the sole `AIBrief24` target. Note App Store Connect keeps its own device-family record; stale iPad
    screenshots on the listing must still be removed separately.
    **One prebuild hazard remains, tracked in item 38:** the `react-native-fbsdk-next` plugin block is
    cross-platform and still declares `isAutoInitEnabled: true` / `autoLogAppEventsEnabled: true`, so a
    prebuild would newly write Meta config into the iOS plist and activate it there for the first time.
    Those flags were left alone on purpose — flipping them would disable Meta attribution on Android too.
38. ~~ATT is requested at cold start, before the user sees any content.~~ **FIXED** — this had caused a
    Guideline 2.1 rejection: iOS silently no-ops `requestTrackingPermissionsAsync()` unless the app is
    `active`, so the dialog never appeared for the reviewer. `useAdsBootstrap()` (`_layout.tsx:205`) now
    gates the prompt on AppState `active` + root navigator mounted + interactions settled +
    `ATT_PROMPT_DELAY_MS` (1300 ms, deliberately past the 800 ms splash hide — both read the shared
    `SPLASH_HIDE_DELAY_MS` constant so they cannot drift). It prompts **only** when the status is
    `undetermined`, and ad SDK init is gated on the resolved status so no tracking-enabled request
    precedes consent.
    Related: the **Meta SDK is now Android-only** (`initAdSdks()`). The iOS project has no Facebook
    configuration whatsoever — no `FacebookAppID`, `FacebookClientToken`, or `fb<appid>` URL scheme in
    `ios/AIBrief24/Info.plist`, because the `react-native-fbsdk-next` config plugin was never applied to
    this ejected `ios/` directory. Meta attribution on iOS is therefore **broken, not disabled**: the pod
    ships but is inert. `app.json` still declares `isAutoInitEnabled: true` / `autoLogAppEventsEnabled:
    true`, which would take effect — and newly enable Meta on iOS — on any future prebuild.
39. **`design_guidelines.json` does not match the shipped design.** It specifies `#020617`/`#3B82F6`;
    `constants/theme.ts` ships `#040710`/`#00D1FF`. Trust `theme.ts`.
40. **No `babel.config.js` exists at all**, so `react-native-dotenv` never runs. Only `EXPO_PUBLIC_*`
    variables reach the bundle (via Expo's own inlining) — which is why `SUPABASE_URL` in `frontend/.env` is inert.
41. **Both `yarn.lock` and `package-lock.json` are present.** `packageManager` declares yarn 1.22.22 — use yarn.
42. **`requirements.txt` is a 144-package `pip freeze`** including `motor`/`pymongo` (a MongoDB leftover —
    see also `_serialize()` stripping `_id` at `server.py:195`), `boto3`, `stripe`, `litellm`, `pandas`,
    `numpy`, `google-generativeai`, `black`/`mypy`/`flake8`. Every CI run and Render deploy installs all of it.
43. **`runtime.txt` pins Python 3.11.10, CI uses 3.13.** The ingestion job runs on a different interpreter
    than production.
44. **Two virtualenvs in `backend/`** (`venv/` and `.venv/`), neither gitignored by name.
45. **`GET /api/articles/{id}` returns 500, not 404, for a non-UUID id** — a raw Postgres cast error.
    This is documented as a known bug in `test_aibrief_api.py:210-219` and was never fixed.
46. **`GlobalAuthObserver` whitelists `/terms`, `/support`, `/delete-account`** as public routes —
    `/delete-account` now exists (App Store 5.1.1(v)), but **`/terms` and `/support` still do not**.
    Both stores commonly expect a reachable Terms and a support contact; today the only support
    surface is the `aibrief2526@gmail.com` mailto in `privacy.tsx`.
47. **`memory/PRD.md` and `test_result.md` are historically valuable but stale** — they describe
    GPT-3.5-turbo (now gpt-4o-mini), a 25-image pool, an `/admin/fix-images` endpoint that doesn't exist,
    and one-aggregated-notification-per-run behaviour that the job queue replaced. `.emergent/summary.txt`
    claims auth is broken; it isn't.

---

## 11. Setup & Deployment

### Run the backend locally (from a fresh clone)

```bash
cd backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # ~144 packages, slow

# .env.example is INCOMPLETE. Create backend/.env with ALL of these:
cat > .env <<'EOF'
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>     # needed for thumbnail uploads
SUPABASE_DB_HOST=<project>.pooler.supabase.com
SUPABASE_DB_PORT=6543
SUPABASE_DB_USER=<db user>
SUPABASE_DB_PASSWORD=<db password>
SUPABASE_DB_NAME=postgres
OPENAI_API_KEY=<openai key>
ADMIN_KEY=<any strong random string>             # WITHOUT this, admin routes are open
EOF

uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

The database must already exist. `_run_migrations()` creates `push_tokens`, `notification_logs`, and
`notification_jobs`, but **`articles`, `sources`, `bookmarks`, `users`, and `app_settings` must be created
manually in the Supabase dashboard** — there is no DDL for them in this repo. Then insert `sources` rows
(name, url, type, active=true, category_hint) or the feed will be empty forever.

Verify: `curl localhost:8001/api/health` → `{"status":"ok","articles_count":…}`.
`curl localhost:8001/api/health/db` → `{"status":"ok","result":1}`.

### Run the ingestion pipeline

```bash
cd backend
python ingestor.py --dry-run     # preview: no inserts, no pushes
python ingestor.py               # full run: inserts + schedules + sends
```

### Run the frontend locally

```bash
cd frontend
yarn install                     # yarn, NOT npm (yarn.lock is authoritative)

cat > .env <<'EOF'
EXPO_PUBLIC_BACKEND_URL=http://<your-lan-ip>:8001
EXPO_PUBLIC_USE_TEST_ADS=true
EOF

npx expo start                   # dev server
yarn android                     # expo run:android — native build
yarn ios                         # expo run:ios — requires macOS + CocoaPods
yarn lint
```

Important local caveats:
- `localhost` will not work from a physical device — use your LAN IP.
- **Expo Go cannot get push tokens on Android** (`utils/notifications.ts:48` bails out) — use a dev build.
- **Push tokens require a physical device** (`Device.isDevice` guard).
- **Password-reset deep links do not work in the Expo dev client** — `reset-password.tsx` detects this and
  shows a warning banner. Test with a preview/standalone build.
- Ads render only as placeholders until `mobileAds().initialize()` resolves; keep `USE_TEST_ADS=true` locally.

### Running the backend tests

```bash
cd backend
EXPO_PUBLIC_BACKEND_URL=https://aibrief24-backend.onrender.com pytest tests/ -v
```
They hit a **live** deployment and mutate it (the dedup tests trigger real ingestion). Expect the
`TestAdminIngest` class and the hardcoded-count assertions to fail — see §10 items 12–13.

### Deployment

**Backend → Render** (`https://aibrief24-backend.onrender.com`).
No `render.yaml`, `Procfile`, or `Dockerfile` in the repo — build/start commands are configured in the
Render dashboard. `runtime.txt` pins Python 3.11.10. Expected start command:
`cd backend && uvicorn server:app --host 0.0.0.0 --port $PORT`. All env vars from §6 must be set there.
Deploys presumably auto-trigger on push to `main`. Note free-tier cold starts — `services/api.ts` uses a
30-second client timeout with a message that explicitly mentions "server cold start".

**Ingestion → GitHub Actions**, no deploy step; it just needs the 10 repo secrets listed in §6.

**Mobile → EAS Build**:
```bash
cd frontend
eas build --platform android --profile production   # AAB for Play Store
eas build --platform ios     --profile production   # IPA for App Store
eas submit --platform android
eas submit --platform ios
```
`appVersionSource: "remote"` + `autoIncrement: true` means EAS owns the build number.
For internal testing use `--profile preview` (Android APK).

**Database/Storage → Supabase**: managed. Bucket `article-images` must exist and be publicly readable for
thumbnails to load.

---

## 12. Current Status

### ✅ Complete and working in production
- Full auth: signup (with email confirmation), login, logout, session restore, dual-path token refresh, forced logout on expiry.
- Password reset end-to-end, including PKCE-code and access-token deep-link modes.
- Home feed: paginated, deduped, pull-to-refresh, focus/foreground auto-refresh, ad interleaving, skeleton and placeholder states.
- Article detail, category browse, saved articles, search (with synonym expansion + relevance ranking).
- Bookmarks with optimistic UI, rollback, and a DB-enforced 100-item cap.
- Ingestion pipeline: 2-hour cron, AI summaries, hybrid LLM+keyword categorization, AI-relevance filtering, cross-source story clustering, URL dedupe, multi-strategy image resolution with arXiv-specific handling, thumbnail optimization.
- Push notifications: durable job queue, `SKIP LOCKED` claiming, batching, receipt polling, automatic dead-token deactivation, daily caps, min-gap spacing, IST quiet hours, freshness gating.
- Monetization: AdMob native ads live (`USE_TEST_ADS=false`); Meta SDK attribution on **Android only**.
- Account deletion end-to-end (`DELETE /api/auth/account` + `app/delete-account.tsx`), satisfying
  App Store guideline 5.1.1(v).
- Category personalization: 3-of-9 interest picker shared by onboarding step 5 and Settings, with a
  client-side day-bucketed feed re-rank and a "For you" pill in the feed header when active.
- Notification opt-out that actually stops delivery (`/push/unregister` clears `is_active`, which the
  worker filters on), with the launch auto-register gated on the stored intent.
- Share-to-social: off-screen 1080×1080 `ShareCard` captured to PNG with a text fallback chain;
  the store link and card CTA are platform-correct via `STORE_URL` / `STORE_NAME` in `theme.ts`,
  and all share copy comes from the single `buildShareMessage()` builder.
- Android: shipped to Google Play at versionCode 15.

### 🟡 In progress
- **iOS App Store submission.** Rejected under guideline 5.1.1 for a vague ATT purpose string; the native
  `Info.plist` has just been fixed and `ITSAppUsesNonExemptEncryption=false` added. `app.json` still holds
  the old string (§10 item 37). Not yet resubmitted.
- **Push notification tuning.** The last three commits walked the freshness gate 24 h → 6 h → 12 h — this
  is being actively adjusted against real Product Hunt / stale-feed behaviour.

### ❌ Missing / not built
- **Terms of Service and Support screens** — whitelisted in `PUBLIC_ROUTES` but never built.
- Breaking-news detection — the entire `is_breaking` feature path is dead (§10 item 34).
- Any unit tests; any test that runs without a live deployment.
- Row Level Security policies in Supabase (open P3 item in the PRD).
- Google/social login, premium subscriptions, offline reading, analytics, admin dashboard (all P3).
- A proper migrations tool — schema is split between `_run_migrations()` and the Supabase dashboard.
- An always-on notification worker; delivery currently depends on ingestion running.

### First things to fix if you pick this up
1. Add `_require_admin` to `/api/push/send` and `/api/admin/recategorize`; verify `ADMIN_KEY` is set on Render (§10 items 1–3).
2. Decide the Meta-on-iOS posture before any `expo prebuild`: the plugin's cross-platform `isAutoInitEnabled` / `autoLogAppEventsEnabled` would activate Meta on iOS for the first time, pre-consent (§10 items 37–38).
3. Build the Terms and Support screens; they are whitelisted as public routes but do not exist (§10 item 46).
4. Delete or repair the stale artifacts: `disable_broken_feeds.py`, `NotificationPromptModal.tsx`, `.privacy.tsx.swp`, `fix_article_images()`, the dead `profiles` query, one of the two lockfiles, one of the two virtualenvs.
5. Decide whether arXiv interleaving matters — then either stop re-sorting on the client or stop curating on the server (§10 item 22).
