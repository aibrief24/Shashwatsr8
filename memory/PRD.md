# AIBrief24 — Product Requirements Document

## Overview
AIBrief24 is a premium, production-ready mobile application for Android and iOS. It is an AI-focused news aggregator with a swipe-based, summary-first reading experience similar to Inshorts.

## Problem Statement
Busy professionals and AI enthusiasts want to stay updated on the rapidly evolving AI landscape without spending hours reading full articles. AIBrief24 delivers concise, AI-generated summaries in a beautiful, swipeable card interface.

## Tech Stack
- **Frontend:** React Native (Expo) with expo-router for file-based routing
- **Backend:** FastAPI (Python)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (email/password)
- **Notifications:** Expo Push Notifications
- **Content:** RSS feed ingestion + OpenAI GPT-3.5-turbo for summaries

## Core Features
1. Vertical swipeable news feed (Inshorts-style)
2. Article summaries (AI-generated via OpenAI)
3. Categories: AI Tools, AI Startups, AI Models, AI Research, Funding News, Product Launches, Big Tech AI, Open Source AI
4. Bookmark articles (requires auth)
5. Share articles
6. Read full source article
7. Search articles
8. Push notifications for new articles
9. Forgot Password flow

## Screens
- Splash → Onboarding → Login/Signup → Home Feed → Article Detail → Bookmarks → Categories → Search → Settings

## Database Schema
- `articles`: {id, title, summary, image_url, source_name, article_url, category, published_at, status, is_breaking}
- `sources`: {id, name, url, type, active, category_hint}
- `bookmarks`: {id, user_id (fk to auth.users), article_id, created_at}
- `app_settings`: {id, ...}
- `notification_logs`: {id, article_id, status, ...}
- `push_tokens`: {id, token, platform, user_id, created_at} — auto-created on startup

## Auth Architecture
- Supabase Auth (email/password) — backend proxies auth to Supabase REST API
- JWT tokens stored in AsyncStorage (access_token + refresh_token)
- Auto-refresh on session restore
- No custom password storage — all handled by Supabase
- Email confirmation enabled in Supabase (users must confirm before login)

## Backend Files
- `server.py` — FastAPI app, all API endpoints
- `auth.py` — Supabase Auth proxy functions
- `database.py` — Supabase PostgreSQL connection pool
- `notifier.py` — Expo Push API sender
- `ingestor.py` — Content ingestion pipeline (RSS + OpenAI)

## Frontend Structure
```
frontend/
  app/
    _layout.tsx         — Root layout, push notification setup, auth state
    index.tsx           — Splash screen
    onboarding.tsx      — Onboarding slides
    login.tsx           — Login screen (with Forgot Password link)
    signup.tsx          — Signup screen
    forgot-password.tsx — Forgot password screen
    (tabs)/
      _layout.tsx       — Tab navigation
      index.tsx         — Home feed (swipeable FlatList)
      bookmarks.tsx     — Saved articles
      categories.tsx    — Category grid
      settings.tsx      — User settings + logout
    article/
      [id].tsx          — Article detail
    search.tsx          — Search screen
  contexts/
    AuthContext.tsx     — Auth state (login, signup, logout, forgotPassword, bookmarks)
  services/
    api.ts              — Fetch-based API client
  constants/
    theme.ts            — Colors, typography, spacing
  components/           — Reusable UI components
```

---

# CHANGELOG

## Session 1 (Initial Build)
- Built full project scaffold (Expo + FastAPI + Supabase)
- Implemented all screens and navigation
- Core swipeable news feed with FlatList + pagingEnabled
- Supabase PostgreSQL integration for articles, sources, bookmarks
- Connection pooling with psycopg2
- Initial seed data: 20 articles, 60 sources

## Session 2 (Auth Migration + Full Feature Completion) — March 2026

### Phase 1: Fixed Auth (Critical Bug Fix)
- **Root cause:** `AuthContext.tsx` used `res.token` but backend returns `res.access_token`
- Fixed: `res.token → res.access_token` in `login()` and `signup()`
- Added refresh token storage (`auth_refresh_token` in AsyncStorage)
- Added auto-refresh on session restore when access token expires
- Fixed `_upsert_profile` to use `users` table (profiles table doesn't exist)
- Auth now fully working: signup (with email confirmation message), login, logout, session persistence

### Phase 2: Forgot Password
- Created `/app/frontend/app/forgot-password.tsx`
- Added "Forgot Password?" link to login screen
- Uses `/api/auth/reset-password` → Supabase `resetPasswordForEmail`
- Success state shows "Check Your Email" confirmation

### Phase 3: Push Notifications
- Created `backend/notifier.py` — Expo Push API sender (batched, 100/request)
- `push_tokens` table auto-created on backend startup
- `/api/push/register` endpoint stores Expo push tokens
- `/api/push/send` endpoint now actually sends via Expo Push API
- Frontend (`_layout.tsx`): requests permissions after login, registers token, handles notification taps → navigates to article

### Phase 4: Content Ingestion Pipeline
- Created `backend/ingestor.py` — Full RSS pipeline
  - Fetches from all active sources in DB
  - OpenAI GPT-3.5-turbo for 2-3 sentence summaries
  - Category auto-detection from keywords
  - Deduplication via URL check before insert
  - Image extraction from feed entries (media:content, media:thumbnail, enclosures)
  - Fallback to varied images from 25-image pool
- `/api/admin/ingest` endpoint triggers ingestion + sends push notifications
- `/api/admin/fix-images` endpoint bulk-updates all articles with varied images

### Image Fix
- Root cause: All 514 articles had the same default Unsplash image
- Fix: 25-image pool, each article gets image based on `HASHTEXT(id) % 25`
- Bulk SQL update applied to all 247 remaining unique articles
- Removed 267 duplicate articles from DB

---

# ROADMAP

## P0 (Blocking) — DONE ✅
- [x] Fix auth token bug (res.token → res.access_token)
- [x] Supabase Auth migration complete

## P1 (High Priority) — DONE ✅
- [x] Forgot Password screen
- [x] Session persistence with token refresh

## P2 (Medium Priority) — DONE ✅
- [x] Push notification pipeline (request permissions, register token, send)
- [x] Content ingestion pipeline (RSS + OpenAI)
- [x] Varied article images
- [x] Duplicate article cleanup

## P3 (Future)
- [ ] Google Social Login
- [ ] Premium subscriptions
- [ ] Breaking news badge UI
- [ ] Swipeable onboarding slides
- [ ] Article image extraction from HTML (for RSS feeds without media tags)
- [ ] Scheduled ingestion (cron job or Supabase Edge Functions)
- [ ] Admin dashboard for content management
- [ ] Row Level Security policies in Supabase (public read articles, user-only bookmarks)
- [ ] Analytics (article views, popular categories)
- [ ] Offline reading (cached articles)
