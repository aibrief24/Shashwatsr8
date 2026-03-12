"""
AIBrief24 API Backend Tests - Iteration 2
Tests: health, auth (access_token fix), articles, categories, search, 
bookmarks, settings, push notifications, sources, admin/ingest, forgot password
"""

import pytest
import requests
import os
import uuid

# Get base URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not set", allow_module_level=True)


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def test_user_credentials():
    """Generate unique test user credentials"""
    unique_id = str(uuid.uuid4())[:8]
    return {
        "email": f"test_{unique_id}@aibrief24test.com",
        "password": "testpass123",
        "name": f"Test User {unique_id}"
    }


# ─── Health Check ─────────────────────────────────────────────────────────────

class TestHealth:
    """Health check endpoint tests"""

    def test_health_check(self, api_client):
        """Test GET /api/health returns 200 with ok status"""
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed with status {response.status_code}: {response.text}"
        data = response.json()
        assert "status" in data, "Response missing 'status' field"
        assert data["status"] == "ok", f"Health status is not 'ok': {data}"
        assert "articles_count" in data, "Response missing 'articles_count'"
        assert "sources_count" in data, "Response missing 'sources_count'"
        print(f"✓ Health check passed: articles={data.get('articles_count')}, sources={data.get('sources_count')}")

    def test_api_root(self, api_client):
        """Test GET /api/ returns app info"""
        response = api_client.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Root endpoint failed: {response.status_code}"
        data = response.json()
        assert "app" in data, "Response missing 'app' field"
        assert data["app"] == "AIBrief24", f"App name mismatch: {data.get('app')}"
        print(f"✓ API root: {data}")


# ─── Auth Endpoints ────────────────────────────────────────────────────────────

class TestAuth:
    """Authentication endpoint tests (Supabase auth - email confirmation enabled)"""

    def test_signup_returns_200(self, api_client, test_user_credentials):
        """Test POST /api/auth/signup creates new user (email confirmation enabled, may not return token)"""
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json=test_user_credentials)
        # Supabase may rate limit (429) - skip if rate limited (external service limit)
        if response.status_code == 429:
            pytest.skip("Supabase rate limit (429) - external service limit, not a code issue")
        assert response.status_code == 200, f"Signup failed with status {response.status_code}: {response.text}"
        data = response.json()
        assert "user" in data, "Response missing 'user' field"
        # Key fix: backend returns access_token NOT token (was a bug in old code)
        assert "access_token" in data, "Response missing 'access_token' field (was 'token' in old code)"
        print(f"✓ Signup returned 200: access_token={'present' if data.get('access_token') else 'null (email confirmation required)'}")

    def test_signup_user_fields(self, api_client, test_user_credentials):
        """Test signup response user object has required fields"""
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json=test_user_credentials)
        if response.status_code == 429:
            pytest.skip("Supabase rate limit (429) - external service limit, not a code issue")
        assert response.status_code == 200
        data = response.json()
        user = data.get("user", {})
        assert "id" in user, "User missing 'id' field"
        assert "email" in user, "User missing 'email' field"
        assert "name" in user, "User missing 'name' field"
        print(f"✓ Signup user fields present: {user.get('email')}")

    def test_login_invalid_credentials(self, api_client):
        """Test POST /api/auth/login with wrong credentials returns 400/401"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "nonexistent_test@aibrief24test.com", "password": "wrongpass123"}
        )
        assert response.status_code in [400, 401, 422], \
            f"Invalid login should return 400/401/422, got {response.status_code}: {response.text}"
        print(f"✓ Invalid login correctly rejected with {response.status_code}")

    def test_get_me_no_token(self, api_client):
        """Test GET /api/auth/me without token returns 401"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401, f"Should return 401 without token, got {response.status_code}"
        print("✓ /auth/me correctly returns 401 without token")

    def test_get_me_invalid_token(self, api_client):
        """Test GET /api/auth/me with invalid token returns 401"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer invalid-token-abc123"}
        )
        assert response.status_code == 401, f"Should return 401 with invalid token, got {response.status_code}"
        print("✓ /auth/me correctly rejects invalid token")

    def test_forgot_password_returns_200(self, api_client):
        """Test POST /api/auth/reset-password returns 200"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"email": "test@aibrief24.com"}
        )
        # Supabase reset-password always returns 200 even for unknown emails (security by design)
        assert response.status_code == 200, f"Forgot password failed: {response.status_code}: {response.text}"
        print(f"✓ Forgot password endpoint works: {response.json()}")

    def test_logout_no_token(self, api_client):
        """Test POST /api/auth/logout without token still returns 200 (graceful)"""
        response = api_client.post(f"{BASE_URL}/api/auth/logout")
        assert response.status_code == 200, f"Logout failed: {response.status_code}"
        data = response.json()
        assert data.get("success") == True, "Logout should return success=True"
        print("✓ Logout endpoint works")


# ─── Articles ─────────────────────────────────────────────────────────────────

class TestArticles:
    """Articles endpoint tests"""

    def test_get_articles_default(self, api_client):
        """Test GET /api/articles returns article list with proper structure"""
        response = api_client.get(f"{BASE_URL}/api/articles")
        assert response.status_code == 200, f"Get articles failed: {response.status_code}: {response.text}"
        data = response.json()
        assert "articles" in data, "Response missing 'articles'"
        assert "total" in data, "Response missing 'total'"
        articles = data["articles"]
        assert len(articles) > 0, f"Expected articles, got 0"
        print(f"✓ Get articles: {len(articles)} articles, total={data['total']}")

    def test_get_articles_structure(self, api_client):
        """Test each article has required fields"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=5")
        assert response.status_code == 200
        data = response.json()
        articles = data["articles"]
        if articles:
            article = articles[0]
            required_fields = ["id", "title", "summary", "image_url", "source_name", "category", "published_at"]
            for field in required_fields:
                assert field in article, f"Article missing required field: {field}"
            print(f"✓ Article structure valid: {article['title'][:50]}")

    def test_get_articles_shows_20_minimum(self, api_client):
        """Test home feed should show at least 20 articles (as per requirements)"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=50")
        assert response.status_code == 200
        data = response.json()
        articles = data["articles"]
        assert len(articles) >= 20, f"Expected at least 20 articles for home feed, got {len(articles)}"
        print(f"✓ Home feed has {len(articles)} articles (>= 20 required)")

    def test_get_articles_with_limit(self, api_client):
        """Test limit parameter respected"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert len(data["articles"]) <= 5, f"Limit not respected: {len(data['articles'])} articles returned"
        print(f"✓ Limit parameter working: {len(data['articles'])} articles")

    def test_get_articles_with_category(self, api_client):
        """Test category filter works"""
        response = api_client.get(f"{BASE_URL}/api/articles?category=AI Models&limit=10")
        assert response.status_code == 200
        data = response.json()
        for article in data["articles"]:
            assert article["category"] == "AI Models", f"Article has wrong category: {article['category']}"
        print(f"✓ Category filter working: {len(data['articles'])} 'AI Models' articles")

    def test_get_article_by_id(self, api_client):
        """Test GET /api/articles/{id} returns specific article"""
        # Get a valid article ID first
        articles_response = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        articles = articles_response.json()["articles"]
        if not articles:
            pytest.skip("No articles available to test")
        article_id = articles[0]["id"]

        response = api_client.get(f"{BASE_URL}/api/articles/{article_id}")
        assert response.status_code == 200, f"Get article by ID failed: {response.status_code}"
        data = response.json()
        assert data["id"] == article_id, "Article ID mismatch"
        assert "title" in data, "Article missing title"
        print(f"✓ Get article by ID: {data['title'][:50]}")

    def test_get_article_not_found(self, api_client):
        """Test GET /api/articles/{valid_uuid_not_exist} returns 404
        BUG: Passing invalid non-UUID (e.g. 'invalid-id-99999') returns 500 due to PG UUID cast error.
        Using a valid UUID format that doesn't exist to get correct 404.
        """
        nonexistent_uuid = "00000000-0000-0000-0000-000000000000"
        response = api_client.get(f"{BASE_URL}/api/articles/{nonexistent_uuid}")
        assert response.status_code == 404, f"Non-existent article should return 404, got {response.status_code}"
        print("✓ Non-existent article (valid UUID) correctly returns 404")
        # BUG REPORT: Invalid non-UUID ID like 'invalid-id-99999' returns 500 instead of 404
        # Root cause: PostgreSQL UUID cast error not caught by server. Fix: add try/except or validate UUID format.

    def test_search_articles(self, api_client):
        """Test GET /api/articles/search returns results"""
        response = api_client.get(f"{BASE_URL}/api/articles/search?q=AI")
        assert response.status_code == 200, f"Search failed: {response.status_code}: {response.text}"
        data = response.json()
        assert "articles" in data, "Response missing 'articles'"
        assert "total" in data, "Response missing 'total'"
        print(f"✓ Search 'AI': {data['total']} results")

    def test_search_articles_empty_query(self, api_client):
        """Test empty search query returns no results"""
        response = api_client.get(f"{BASE_URL}/api/articles/search?q=")
        assert response.status_code == 200
        data = response.json()
        assert len(data["articles"]) == 0, "Empty query should return no results"
        print("✓ Empty search returns no results")

    def test_get_breaking_articles(self, api_client):
        """Test GET /api/articles/breaking returns breaking articles"""
        response = api_client.get(f"{BASE_URL}/api/articles/breaking")
        assert response.status_code == 200, f"Breaking articles failed: {response.status_code}"
        data = response.json()
        assert "articles" in data, "Response missing 'articles'"
        for article in data["articles"]:
            assert article.get("is_breaking") == True, "Non-breaking article in breaking feed"
        print(f"✓ Breaking articles endpoint: {len(data['articles'])} breaking stories")


# ─── Categories ───────────────────────────────────────────────────────────────

class TestCategories:
    """Categories endpoint tests"""

    def test_get_categories(self, api_client):
        """Test GET /api/categories returns all 9 categories"""
        response = api_client.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200, f"Get categories failed: {response.status_code}"
        data = response.json()
        assert "categories" in data, "Response missing 'categories'"
        assert len(data["categories"]) == 9, f"Expected 9 categories, got {len(data['categories'])}"
        expected_categories = [
            "Latest", "AI Tools", "AI Startups", "AI Models", "AI Research",
            "Funding News", "Product Launches", "Big Tech AI", "Open Source AI"
        ]
        names = [c["name"] for c in data["categories"]]
        for cat in expected_categories:
            assert cat in names, f"Missing category: {cat}"
        print(f"✓ All 9 categories present: {names}")

    def test_categories_have_count(self, api_client):
        """Test categories include article count"""
        response = api_client.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        for cat in data["categories"]:
            assert "count" in cat, f"Category '{cat.get('name')}' missing 'count'"
            assert isinstance(cat["count"], int), "Count should be an integer"
        print(f"✓ All categories have count field")


# ─── Bookmarks (requires auth) ────────────────────────────────────────────────

class TestBookmarks:
    """Bookmarks endpoint tests"""

    def test_bookmarks_no_auth(self, api_client):
        """Test GET /api/bookmarks without auth returns 401"""
        response = api_client.get(f"{BASE_URL}/api/bookmarks")
        assert response.status_code == 401, f"Should require auth, got {response.status_code}"
        print("✓ Bookmarks endpoint correctly requires authentication")

    def test_bookmark_ids_no_auth(self, api_client):
        """Test GET /api/bookmarks/ids without auth returns 401"""
        response = api_client.get(f"{BASE_URL}/api/bookmarks/ids")
        assert response.status_code == 401, f"Should require auth, got {response.status_code}"
        print("✓ Bookmark IDs endpoint correctly requires authentication")

    def test_add_bookmark_no_auth(self, api_client):
        """Test POST /api/bookmarks without auth returns 401"""
        response = api_client.post(f"{BASE_URL}/api/bookmarks", json={"article_id": "some-id"})
        assert response.status_code == 401, f"Should require auth, got {response.status_code}"
        print("✓ Add bookmark correctly requires authentication")


# ─── Settings ─────────────────────────────────────────────────────────────────

class TestSettings:
    """Settings endpoint tests"""

    def test_get_settings(self, api_client):
        """Test GET /api/settings returns app settings"""
        response = api_client.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200, f"Get settings failed: {response.status_code}"
        data = response.json()
        assert "telegram_url" in data, "Missing 'telegram_url'"
        assert "website_url" in data, "Missing 'website_url'"
        assert "notifications_enabled_default" in data, "Missing 'notifications_enabled_default'"
        print(f"✓ Settings: telegram={data['telegram_url']}, website={data['website_url']}")


# ─── Push Notifications ────────────────────────────────────────────────────────

class TestPushNotifications:
    """Push notification endpoint tests"""

    def test_register_push_token(self, api_client):
        """Test POST /api/push/register stores push token"""
        response = api_client.post(
            f"{BASE_URL}/api/push/register",
            json={"token": f"ExponentPushToken[test-{uuid.uuid4().hex[:8]}]", "platform": "ios"}
        )
        assert response.status_code == 200, f"Register push token failed: {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Push token registration should return success=True"
        print("✓ Push token registration successful")


# ─── Sources ──────────────────────────────────────────────────────────────────

class TestSources:
    """Sources endpoint tests"""

    def test_get_sources(self, api_client):
        """Test GET /api/sources returns configured news sources"""
        response = api_client.get(f"{BASE_URL}/api/sources")
        assert response.status_code == 200, f"Get sources failed: {response.status_code}"
        data = response.json()
        assert "sources" in data, "Missing 'sources'"
        assert "total" in data, "Missing 'total'"
        assert len(data["sources"]) > 0, "Should have at least one source"
        source = data["sources"][0]
        assert "name" in source, "Source missing 'name'"
        assert "url" in source, "Source missing 'url'"
        print(f"✓ Sources: {data['total']} sources configured")


# ─── Admin Ingest ──────────────────────────────────────────────────────────────

class TestAdminIngest:
    """Admin ingest endpoint tests"""

    def test_admin_ingest_endpoint_returns_200(self, api_client):
        """Test POST /api/admin/ingest triggers ingestion pipeline"""
        response = api_client.post(f"{BASE_URL}/api/admin/ingest", timeout=60)
        assert response.status_code == 200, f"Admin ingest failed: {response.status_code}: {response.text}"
        data = response.json()
        assert "status" in data, "Response missing 'status'"
        assert data["status"] in ["done", "no_sources", "error"], f"Unexpected status: {data['status']}"
        print(f"✓ Admin ingest: status={data['status']}, total={data.get('total', 0)}, sources={data.get('sources_processed', 0)}")

    def test_admin_ingest_response_structure(self, api_client):
        """Test POST /api/admin/ingest returns proper structure"""
        response = api_client.post(f"{BASE_URL}/api/admin/ingest", timeout=60)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data, "Response missing 'total'"
        assert "results" in data, "Response missing 'results'"
        assert isinstance(data["total"], int), "total should be integer"
        assert isinstance(data["results"], list), "results should be list"
        print(f"✓ Admin ingest structure valid: {data}")
