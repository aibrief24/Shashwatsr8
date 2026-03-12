# AIBrief24 - Product Requirements Document

## Overview
**App Name:** AIBrief24  
**Tagline:** AI News in 60 Seconds  
**Package Name:** com.aibrief24.app  
**Platform:** Android & iOS (React Native Expo)

## Architecture

### Backend (FastAPI)
- **Runtime:** Python 3.11 + FastAPI + Uvicorn (port 8001)
- **Database:** In-memory data store (Supabase-ready architecture)
  - Supabase REST API client configured
  - SQL migration script available at `/api/setup-sql`
  - Tables: articles, sources, users, bookmarks, app_settings, notification_logs, push_tokens
- **Auth:** JWT-based (bcrypt + python-jose), 72-hour token expiry
- **Content:** 20 seeded realistic AI news articles, 60 source configurations
- **Push:** Full notification pipeline (registration + sending + logging)

### Frontend (Expo Router)
- **Navigation:** File-based routing with expo-router
  - Stack: splash → onboarding → auth → tabs
  - Tabs: Feed | Explore | Saved | Settings
  - Modals: article/[id], search
- **State:** React Context (AuthContext with bookmark management)
- **API:** Service layer at `/services/api.ts`
- **Theme:** Dark mode, electric blue (#3B82F6) primary, purple (#8B5CF6) secondary

## Screens
1. **Splash** - Logo, tagline, auto-redirect (1.5s)
2. **Onboarding** - 4 slides (Lightning Fast, Image+Summary, Bookmark+Share, Notifications)
3. **Login/Signup** - Email/password JWT auth
4. **Home Feed** - Vertical swipeable news cards (FlatList with pagingEnabled)
5. **Article Detail** - Full hero image, summary, source, actions, CTAs
6. **Categories** - 9 categories (AI Tools, Startups, Models, Research, Funding, etc.)
7. **Bookmarks** - Saved articles list with remove option
8. **Search** - Full-text search with trending suggestions
9. **Settings** - User info, notifications toggle, Telegram/Website CTAs, logout

## Key Features
- Vertical swipe news feed (Inshorts-style)
- 20+ realistic AI news articles across 9 categories
- JWT authentication with session persistence
- Bookmark with instant toggle (synced to auth context)
- Full-text article search
- Article sharing via native share sheet
- Telegram & Website CTA promotion
- Push notification architecture (token registration, send pipeline, logs)
- Deep linking support (article IDs)
- 60+ configurable news sources

## Environment Variables

### Backend (.env)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_DB_HOST/PORT/USER/PASSWORD/NAME` - Direct PostgreSQL connection
- `OPENAI_API_KEY` - OpenAI API key for summary generation
- `JWT_SECRET` - JWT signing secret

### Frontend (.env)
- `EXPO_PUBLIC_BACKEND_URL` - Backend API base URL
- `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase public key

## Supabase Migration
Run the SQL at `/api/setup-sql` in Supabase Dashboard → SQL Editor to create all tables with indexes and RLS policies disabled.

## Future-Ready
- Premium subscription architecture
- Ad placement slots
- Topic following
- Breaking news badges (already supported)
- Daily digest notifications
- Multilingual summaries
- Trending AI tools section
- News ingestion pipeline (modular: fetch → normalize → dedupe → categorize → summarize → store → notify)
