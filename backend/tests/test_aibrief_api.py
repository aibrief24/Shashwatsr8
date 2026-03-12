"""
AIBrief24 API Backend Tests
Tests all API endpoints including auth, articles, bookmarks, categories, search, and settings
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
        "email": f"test_{unique_id}@aibrief24.com",
        "password": "testpass123",
        "name": f"Test User {unique_id}"
    }


@pytest.fixture
def authenticated_token(api_client, test_user_credentials):
    """Create a test user and return auth token"""
    try:
        response = api_client.post(
            f"{BASE_URL}/api/auth/signup",
            json=test_user_credentials
        )
        if response.status_code == 200:
            return response.json()["token"]
        else:
            pytest.skip("Authentication failed - cannot test protected endpoints")
    except Exception as e:
        pytest.skip(f"Authentication setup failed: {e}")


class TestHealth:
    """Health check endpoint tests"""

    def test_health_check(self, api_client):
        """Test GET /api/health returns 200"""
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed with status {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response missing 'status' field"
        assert data["status"] == "ok", "Health status is not 'ok'"
        assert "articles_count" in data, "Response missing 'articles_count'"
        assert data["articles_count"] == 20, f"Expected 20 articles, got {data.get('articles_count')}"
        print(f"✓ Health check passed: {data}")


class TestAuth:
    """Authentication endpoint tests"""

    def test_signup_success(self, api_client, test_user_credentials):
        """Test POST /api/auth/signup creates new user"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/signup",
            json=test_user_credentials
        )
        assert response.status_code == 200, f"Signup failed with status {response.status_code}"
        
        data = response.json()
        assert "token" in data, "Response missing 'token' field"
        assert "user" in data, "Response missing 'user' field"
        assert data["user"]["email"] == test_user_credentials["email"], "Email mismatch"
        assert "id" in data["user"], "User ID missing"
        print(f"✓ Signup successful for {data['user']['email']}")

    def test_signup_duplicate_email(self, api_client, test_user_credentials):
        """Test POST /api/auth/signup with existing email returns 400"""
        # First signup
        api_client.post(f"{BASE_URL}/api/auth/signup", json=test_user_credentials)
        
        # Duplicate signup
        response = api_client.post(f"{BASE_URL}/api/auth/signup", json=test_user_credentials)
        assert response.status_code == 400, "Duplicate signup should return 400"
        print("✓ Duplicate signup correctly rejected")

    def test_login_success(self, api_client, test_user_credentials):
        """Test POST /api/auth/login with valid credentials"""
        # First create user
        api_client.post(f"{BASE_URL}/api/auth/signup", json=test_user_credentials)
        
        # Then login
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": test_user_credentials["email"],
                "password": test_user_credentials["password"]
            }
        )
        assert response.status_code == 200, f"Login failed with status {response.status_code}"
        
        data = response.json()
        assert "token" in data, "Response missing 'token' field"
        assert "user" in data, "Response missing 'user' field"
        print(f"✓ Login successful for {data['user']['email']}")

    def test_login_invalid_credentials(self, api_client):
        """Test POST /api/auth/login with wrong password returns 401"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "nonexistent@test.com", "password": "wrongpass"}
        )
        assert response.status_code == 401, "Invalid login should return 401"
        print("✓ Invalid login correctly rejected")

    def test_get_me_authenticated(self, api_client, authenticated_token):
        """Test GET /api/auth/me with valid token"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {authenticated_token}"}
        )
        assert response.status_code == 200, f"Get me failed with status {response.status_code}"
        
        data = response.json()
        assert "id" in data, "Response missing 'id' field"
        assert "email" in data, "Response missing 'email' field"
        assert "name" in data, "Response missing 'name' field"
        print(f"✓ Get me successful: {data['email']}")

    def test_get_me_no_token(self, api_client):
        """Test GET /api/auth/me without token returns 401"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401, "Request without token should return 401"
        print("✓ Unauthorized request correctly rejected")


class TestArticles:
    """Articles endpoint tests"""

    def test_get_articles_default(self, api_client):
        """Test GET /api/articles returns article list"""
        response = api_client.get(f"{BASE_URL}/api/articles")
        assert response.status_code == 200, f"Get articles failed with status {response.status_code}"
        
        data = response.json()
        assert "articles" in data, "Response missing 'articles' field"
        assert "total" in data, "Response missing 'total' field"
        assert len(data["articles"]) == 20, f"Expected 20 articles, got {len(data['articles'])}"
        
        # Validate article structure
        article = data["articles"][0]
        required_fields = ["id", "title", "summary", "image_url", "source_name", "category", "published_at"]
        for field in required_fields:
            assert field in article, f"Article missing required field: {field}"
        
        print(f"✓ Get articles successful: {len(data['articles'])} articles returned")

    def test_get_articles_with_category(self, api_client):
        """Test GET /api/articles?category=AI Models filters correctly"""
        response = api_client.get(f"{BASE_URL}/api/articles?category=AI Models")
        assert response.status_code == 200, f"Get articles by category failed with status {response.status_code}"
        
        data = response.json()
        articles = data["articles"]
        
        # Verify all returned articles match the category
        for article in articles:
            assert article["category"] == "AI Models", f"Article has wrong category: {article['category']}"
        
        print(f"✓ Category filter working: {len(articles)} 'AI Models' articles")

    def test_get_articles_with_limit(self, api_client):
        """Test GET /api/articles?limit=5 respects limit parameter"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=5")
        assert response.status_code == 200, f"Get articles with limit failed with status {response.status_code}"
        
        data = response.json()
        assert len(data["articles"]) <= 5, f"Expected max 5 articles, got {len(data['articles'])}"
        print(f"✓ Limit parameter working: {len(data['articles'])} articles")

    def test_get_article_by_id(self, api_client):
        """Test GET /api/articles/{id} returns specific article"""
        # First get list to get a valid ID
        articles_response = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        article_id = articles_response.json()["articles"][0]["id"]
        
        # Then get specific article
        response = api_client.get(f"{BASE_URL}/api/articles/{article_id}")
        assert response.status_code == 200, f"Get article by ID failed with status {response.status_code}"
        
        data = response.json()
        assert data["id"] == article_id, "Article ID mismatch"
        assert "title" in data, "Article missing title"
        print(f"✓ Get article by ID successful: {data['title'][:50]}")

    def test_get_article_by_id_not_found(self, api_client):
        """Test GET /api/articles/{invalid_id} returns 404"""
        response = api_client.get(f"{BASE_URL}/api/articles/invalid-id-12345")
        assert response.status_code == 404, "Non-existent article should return 404"
        print("✓ Non-existent article correctly returns 404")

    def test_search_articles(self, api_client):
        """Test GET /api/articles/search?q=OpenAI returns matching results"""
        response = api_client.get(f"{BASE_URL}/api/articles/search?q=OpenAI")
        assert response.status_code == 200, f"Article search failed with status {response.status_code}"
        
        data = response.json()
        assert "articles" in data, "Response missing 'articles' field"
        assert "total" in data, "Response missing 'total' field"
        
        # Verify results contain search term
        for article in data["articles"]:
            text = f"{article['title']} {article['summary']} {article['source_name']}".lower()
            assert "openai" in text, f"Article doesn't contain 'openai': {article['title']}"
        
        print(f"✓ Search working: {len(data['articles'])} results for 'OpenAI'")

    def test_search_articles_empty_query(self, api_client):
        """Test GET /api/articles/search with empty query returns no results"""
        response = api_client.get(f"{BASE_URL}/api/articles/search?q=")
        assert response.status_code == 200, f"Search failed with status {response.status_code}"
        
        data = response.json()
        assert len(data["articles"]) == 0, "Empty query should return no results"
        print("✓ Empty search query returns no results")

    def test_get_breaking_articles(self, api_client):
        """Test GET /api/articles/breaking returns breaking news"""
        response = api_client.get(f"{BASE_URL}/api/articles/breaking")
        assert response.status_code == 200, f"Get breaking articles failed with status {response.status_code}"
        
        data = response.json()
        assert "articles" in data, "Response missing 'articles' field"
        
        # Verify all returned articles are marked as breaking
        for article in data["articles"]:
            assert article.get("is_breaking") == True, "Non-breaking article in breaking feed"
        
        print(f"✓ Breaking articles endpoint working: {len(data['articles'])} breaking stories")


class TestCategories:
    """Categories endpoint tests"""

    def test_get_categories(self, api_client):
        """Test GET /api/categories returns all 9 categories"""
        response = api_client.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200, f"Get categories failed with status {response.status_code}"
        
        data = response.json()
        assert "categories" in data, "Response missing 'categories' field"
        assert len(data["categories"]) == 9, f"Expected 9 categories, got {len(data['categories'])}"
        
        # Verify category structure
        category = data["categories"][0]
        assert "name" in category, "Category missing 'name' field"
        assert "count" in category, "Category missing 'count' field"
        
        expected_categories = [
            "Latest", "AI Tools", "AI Startups", "AI Models", "AI Research",
            "Funding News", "Product Launches", "Big Tech AI", "Open Source AI"
        ]
        category_names = [cat["name"] for cat in data["categories"]]
        for expected in expected_categories:
            assert expected in category_names, f"Missing expected category: {expected}"
        
        print(f"✓ Categories endpoint working: {len(data['categories'])} categories")


class TestBookmarks:
    """Bookmarks endpoint tests (requires authentication)"""

    def test_add_bookmark(self, api_client, authenticated_token):
        """Test POST /api/bookmarks adds bookmark"""
        # Get an article ID first
        articles_response = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        article_id = articles_response.json()["articles"][0]["id"]
        
        # Add bookmark
        response = api_client.post(
            f"{BASE_URL}/api/bookmarks",
            json={"article_id": article_id},
            headers={"Authorization": f"Bearer {authenticated_token}"}
        )
        assert response.status_code == 200, f"Add bookmark failed with status {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True, "Bookmark addition not successful"
        print(f"✓ Bookmark added successfully")

    def test_get_bookmarks(self, api_client, authenticated_token):
        """Test GET /api/bookmarks returns user bookmarks"""
        # First add a bookmark
        articles_response = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        article_id = articles_response.json()["articles"][0]["id"]
        api_client.post(
            f"{BASE_URL}/api/bookmarks",
            json={"article_id": article_id},
            headers={"Authorization": f"Bearer {authenticated_token}"}
        )
        
        # Get bookmarks
        response = api_client.get(
            f"{BASE_URL}/api/bookmarks",
            headers={"Authorization": f"Bearer {authenticated_token}"}
        )
        assert response.status_code == 200, f"Get bookmarks failed with status {response.status_code}"
        
        data = response.json()
        assert "bookmarks" in data, "Response missing 'bookmarks' field"
        assert len(data["bookmarks"]) > 0, "Should have at least one bookmark"
        print(f"✓ Get bookmarks successful: {len(data['bookmarks'])} bookmarks")

    def test_remove_bookmark(self, api_client, authenticated_token):
        """Test DELETE /api/bookmarks/{id} removes bookmark"""
        # First add a bookmark
        articles_response = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        article_id = articles_response.json()["articles"][0]["id"]
        api_client.post(
            f"{BASE_URL}/api/bookmarks",
            json={"article_id": article_id},
            headers={"Authorization": f"Bearer {authenticated_token}"}
        )
        
        # Remove bookmark
        response = api_client.delete(
            f"{BASE_URL}/api/bookmarks/{article_id}",
            headers={"Authorization": f"Bearer {authenticated_token}"}
        )
        assert response.status_code == 200, f"Remove bookmark failed with status {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True, "Bookmark removal not successful"
        print(f"✓ Bookmark removed successfully")

    def test_get_bookmark_ids(self, api_client, authenticated_token):
        """Test GET /api/bookmarks/ids returns list of bookmark IDs"""
        response = api_client.get(
            f"{BASE_URL}/api/bookmarks/ids",
            headers={"Authorization": f"Bearer {authenticated_token}"}
        )
        assert response.status_code == 200, f"Get bookmark IDs failed with status {response.status_code}"
        
        data = response.json()
        assert "ids" in data, "Response missing 'ids' field"
        assert isinstance(data["ids"], list), "IDs should be a list"
        print(f"✓ Get bookmark IDs successful: {len(data['ids'])} bookmarks")

    def test_bookmarks_no_auth(self, api_client):
        """Test bookmark endpoints without authentication return 401"""
        response = api_client.get(f"{BASE_URL}/api/bookmarks")
        assert response.status_code == 401, "Bookmarks without auth should return 401"
        print("✓ Bookmark endpoints correctly require authentication")


class TestSettings:
    """Settings endpoint tests"""

    def test_get_settings(self, api_client):
        """Test GET /api/settings returns app settings"""
        response = api_client.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200, f"Get settings failed with status {response.status_code}"
        
        data = response.json()
        assert "telegram_url" in data, "Response missing 'telegram_url' field"
        assert "website_url" in data, "Response missing 'website_url' field"
        assert "notifications_enabled_default" in data, "Response missing 'notifications_enabled_default' field"
        
        assert data["telegram_url"] == "https://t.me/aibrief24", "Telegram URL mismatch"
        assert data["website_url"] == "https://aibrief24.com/", "Website URL mismatch"
        print(f"✓ Settings endpoint working")


class TestPushNotifications:
    """Push notification endpoint tests"""

    def test_register_push_token(self, api_client):
        """Test POST /api/push/register stores push token"""
        response = api_client.post(
            f"{BASE_URL}/api/push/register",
            json={"token": "test-push-token-12345", "platform": "ios"}
        )
        assert response.status_code == 200, f"Register push token failed with status {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True, "Push token registration not successful"
        print("✓ Push token registration successful")


class TestSources:
    """Sources endpoint tests"""

    def test_get_sources(self, api_client):
        """Test GET /api/sources returns configured news sources"""
        response = api_client.get(f"{BASE_URL}/api/sources")
        assert response.status_code == 200, f"Get sources failed with status {response.status_code}"
        
        data = response.json()
        assert "sources" in data, "Response missing 'sources' field"
        assert "total" in data, "Response missing 'total' field"
        assert len(data["sources"]) > 0, "Should have at least one source"
        
        # Verify source structure
        source = data["sources"][0]
        assert "name" in source, "Source missing 'name' field"
        assert "url" in source, "Source missing 'url' field"
        assert "type" in source, "Source missing 'type' field"
        
        print(f"✓ Sources endpoint working: {len(data['sources'])} sources configured")
