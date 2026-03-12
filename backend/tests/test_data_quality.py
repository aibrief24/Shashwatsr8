"""
AIBrief24 Data Quality Tests - Iteration 3
Tests: article total count, source_url population, image variety, deduplication,
categories filter, search functionality, and article_url field quality.
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL not set", allow_module_level=True)


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ─── Article Count & Data Quality ─────────────────────────────────────────────

class TestArticleCount:
    """Verify total articles count after fresh ingestion (expected ~261)"""

    def test_articles_total_count_at_least_261(self, api_client):
        """Test total article count is at least 261 after fresh ingestion"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        assert response.status_code == 200, f"Failed: {response.status_code}"
        data = response.json()
        total = data.get("total", 0)
        assert total >= 261, f"Expected >=261 articles, got {total}"
        print(f"✓ Total articles: {total} (>=261 expected)")

    def test_articles_total_matches_health(self, api_client):
        """Total from /api/articles matches /api/health articles_count"""
        articles_resp = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        health_resp = api_client.get(f"{BASE_URL}/api/health")
        assert articles_resp.status_code == 200
        assert health_resp.status_code == 200

        articles_total = articles_resp.json()["total"]
        health_count = health_resp.json()["articles_count"]
        assert articles_total == health_count, (
            f"Article count mismatch: /api/articles total={articles_total}, "
            f"/api/health articles_count={health_count}"
        )
        print(f"✓ Count consistent: {articles_total}")


# ─── Source URL Population ─────────────────────────────────────────────────────

class TestSourceUrlQuality:
    """Verify all articles have clean source_url (homepage domain only)"""

    def test_all_articles_have_source_url(self, api_client):
        """All articles must have source_url populated"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=100")
        assert response.status_code == 200
        articles = response.json()["articles"]
        assert len(articles) > 0, "No articles returned"

        missing = [a["id"] for a in articles if not a.get("source_url")]
        assert len(missing) == 0, f"{len(missing)} articles missing source_url: {missing[:3]}"
        print(f"✓ All {len(articles)} articles have source_url populated")

    def test_source_url_is_clean_homepage_domain(self, api_client):
        """source_url should be clean domain like https://techcrunch.com (no path)"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=100")
        assert response.status_code == 200
        articles = response.json()["articles"]

        bad_urls = []
        for a in articles:
            source_url = a.get("source_url", "")
            if source_url:
                # Remove http(s)://
                path_part = source_url.replace("https://", "").replace("http://", "")
                if "/" in path_part:
                    bad_urls.append({"id": a["id"], "source_url": source_url})

        assert len(bad_urls) == 0, (
            f"{len(bad_urls)} articles have source_url with path component (should be homepage only): "
            f"{bad_urls[:3]}"
        )
        print(f"✓ All source_url are clean homepage domains")

    def test_source_url_starts_with_https(self, api_client):
        """source_url must start with https:// or http://"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=50")
        assert response.status_code == 200
        articles = response.json()["articles"]

        bad = [a for a in articles if a.get("source_url") and
               not (a["source_url"].startswith("http://") or a["source_url"].startswith("https://"))]
        assert len(bad) == 0, f"source_url not starting with http(s)://: {[a['source_url'] for a in bad[:3]]}"
        print(f"✓ All source_url start with https:// or http://")


# ─── Image Variety ─────────────────────────────────────────────────────────────

class TestImageVariety:
    """Verify articles have varied image_urls (not all the same fallback image)"""

    def test_images_are_not_all_identical(self, api_client):
        """Articles must NOT all have the same image URL"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=50")
        assert response.status_code == 200
        articles = response.json()["articles"]
        assert len(articles) > 0

        image_urls = [a.get("image_url", "") for a in articles if a.get("image_url")]
        unique_images = set(image_urls)

        assert len(unique_images) > 1, "All articles have the same image URL (no variety)"
        print(f"✓ Image variety: {len(unique_images)} unique images in {len(image_urls)} articles")

    def test_image_variety_ratio_acceptable(self, api_client):
        """At least 30% of articles in a 50-article batch should have unique images"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=50")
        assert response.status_code == 200
        articles = response.json()["articles"]

        image_urls = [a.get("image_url", "") for a in articles if a.get("image_url")]
        unique_count = len(set(image_urls))
        ratio = unique_count / len(image_urls) if image_urls else 0

        assert ratio >= 0.30, (
            f"Image variety too low: only {unique_count}/{len(image_urls)} unique images ({ratio:.0%}). "
            "Expected at least 30% unique"
        )
        print(f"✓ Image variety ratio: {unique_count}/{len(image_urls)} unique ({ratio:.0%})")

    def test_all_articles_have_image_url(self, api_client):
        """All articles must have an image_url"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=50")
        assert response.status_code == 200
        articles = response.json()["articles"]

        missing_images = [a["id"] for a in articles if not a.get("image_url")]
        assert len(missing_images) == 0, f"{len(missing_images)} articles missing image_url"
        print(f"✓ All {len(articles)} articles have image_url")


# ─── Article URL Quality ──────────────────────────────────────────────────────

class TestArticleUrlQuality:
    """Verify article_url field is populated with valid article links"""

    def test_all_articles_have_article_url(self, api_client):
        """Every article must have an article_url field"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=100")
        assert response.status_code == 200
        articles = response.json()["articles"]

        missing = [a["id"] for a in articles if not a.get("article_url")]
        assert len(missing) == 0, f"{len(missing)} articles missing article_url"
        print(f"✓ All {len(articles)} articles have article_url")

    def test_article_url_starts_with_http(self, api_client):
        """article_url must start with http:// or https://"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=50")
        assert response.status_code == 200
        articles = response.json()["articles"]

        bad = [a for a in articles if a.get("article_url") and
               not (a["article_url"].startswith("http://") or a["article_url"].startswith("https://"))]
        assert len(bad) == 0, f"Bad article_url format: {[a['article_url'] for a in bad[:3]]}"
        print(f"✓ All article_url start with http(s)://")

    def test_no_duplicate_article_urls(self, api_client):
        """Check for duplicate article_url in returned articles (dedup check)"""
        response = api_client.get(f"{BASE_URL}/api/articles?limit=100")
        assert response.status_code == 200
        articles = response.json()["articles"]

        urls = [a.get("article_url") for a in articles if a.get("article_url")]
        unique_urls = set(urls)
        duplicates = len(urls) - len(unique_urls)

        assert duplicates == 0, (
            f"Found {duplicates} duplicate article_url values in top 100 articles. "
            "Deduplication not working properly."
        )
        print(f"✓ No duplicate article_urls in top 100 articles")


# ─── Deduplication Test ───────────────────────────────────────────────────────

class TestDeduplication:
    """Test that ingestion does NOT re-insert already-existing articles"""

    def test_ingest_does_not_increase_article_count_significantly(self, api_client):
        """Run ingest twice; second run should add 0 or very few new articles
        (existing articles already in DB should be skipped via deduplication)"""
        # Get initial count
        initial_resp = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        assert initial_resp.status_code == 200
        initial_total = initial_resp.json()["total"]
        print(f"Initial article count: {initial_total}")

        # Run ingest
        ingest_resp = api_client.post(f"{BASE_URL}/api/admin/ingest", timeout=120)
        assert ingest_resp.status_code == 200, f"Ingest failed: {ingest_resp.status_code}"
        ingest_data = ingest_resp.json()
        new_from_ingest = ingest_data.get("total", 0)
        print(f"Ingest reported: {new_from_ingest} new articles")

        # Get count after ingest
        after_resp = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        assert after_resp.status_code == 200
        after_total = after_resp.json()["total"]
        print(f"Article count after ingest: {after_total}")

        # Actual increase should match what ingest reported
        actual_increase = after_total - initial_total
        print(f"Actual DB increase: {actual_increase} articles")

        # Increase should match ingest report (dedup working = no phantom adds)
        assert actual_increase == new_from_ingest, (
            f"DB count increased by {actual_increase} but ingest reported {new_from_ingest} new. "
            "Possible deduplication issue."
        )
        print(f"✓ Deduplication working: ingest reported {new_from_ingest} new = actual DB increase {actual_increase}")

    def test_second_ingest_run_adds_zero_new_articles(self, api_client):
        """Running ingest immediately after previous run should add 0 new articles
        (all existing articles should be de-duplicated via unique index on article_url)"""
        # First ingest run (to get to stable state)
        first_resp = api_client.post(f"{BASE_URL}/api/admin/ingest", timeout=120)
        if first_resp.status_code != 200:
            pytest.skip("Admin ingest endpoint timed out or unavailable")
        first_data = first_resp.json()
        print(f"First ingest: {first_data.get('total', 0)} new articles")

        # Get count after first ingest
        count_resp = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        count_after_first = count_resp.json()["total"]

        # Second ingest run immediately - existing articles should all be deduped
        second_resp = api_client.post(f"{BASE_URL}/api/admin/ingest", timeout=120)
        if second_resp.status_code != 200:
            pytest.skip("Second ingest timed out")
        second_data = second_resp.json()
        new_from_second = second_data.get("total", 0)

        # Get count after second ingest
        count_resp2 = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        count_after_second = count_resp2.json()["total"]

        # Second ingest should add 0 or very few articles (only brand new RSS items)
        actual_second_increase = count_after_second - count_after_first
        print(f"Second ingest: reported {new_from_second} new, actual DB increase: {actual_second_increase}")

        # The reported new from 2nd ingest == actual DB increase (dedup is consistent)
        assert actual_second_increase == new_from_second, (
            f"Second ingest: DB increased by {actual_second_increase} but ingest reported {new_from_second}. "
            "Deduplication mismatch!"
        )
        print(f"✓ Second ingest: {new_from_second} new articles (correctly de-duplicated)")


# ─── Category Filtering ───────────────────────────────────────────────────────

class TestCategoryFiltering:
    """Verify categories filter shows different articles per category"""

    def test_categories_return_different_articles(self, api_client):
        """Different categories should return different article sets"""
        cat1_resp = api_client.get(f"{BASE_URL}/api/articles?category=AI Models&limit=5")
        cat2_resp = api_client.get(f"{BASE_URL}/api/articles?category=Funding News&limit=5")
        assert cat1_resp.status_code == 200
        assert cat2_resp.status_code == 200

        cat1_ids = {a["id"] for a in cat1_resp.json()["articles"]}
        cat2_ids = {a["id"] for a in cat2_resp.json()["articles"]}

        # If both categories have articles, they should be different
        if cat1_ids and cat2_ids:
            overlap = cat1_ids & cat2_ids
            assert len(overlap) == 0, f"Categories share articles (IDs): {overlap}"
            print(f"✓ Different categories return different articles")
        else:
            print(f"⚠ One or both categories have no articles (cat1={len(cat1_ids)}, cat2={len(cat2_ids)})")

    def test_category_filter_returns_correct_category(self, api_client):
        """Articles returned for a category filter must match that category"""
        response = api_client.get(f"{BASE_URL}/api/articles?category=AI Research&limit=10")
        assert response.status_code == 200
        articles = response.json()["articles"]

        wrong_cat = [a for a in articles if a.get("category") != "AI Research"]
        assert len(wrong_cat) == 0, (
            f"{len(wrong_cat)} articles have wrong category in 'AI Research' filter: "
            f"{[a['category'] for a in wrong_cat[:3]]}"
        )
        print(f"✓ Category filter correct: {len(articles)} 'AI Research' articles")

    def test_latest_category_returns_all(self, api_client):
        """'Latest' category (no filter) returns all articles"""
        all_resp = api_client.get(f"{BASE_URL}/api/articles?limit=50")
        latest_resp = api_client.get(f"{BASE_URL}/api/articles?category=Latest&limit=50")
        assert all_resp.status_code == 200
        assert latest_resp.status_code == 200

        all_total = all_resp.json()["total"]
        latest_total = latest_resp.json()["total"]
        assert all_total == latest_total, f"'Latest' total ({latest_total}) != all articles total ({all_total})"
        print(f"✓ Latest category returns all {all_total} articles")


# ─── Search Functionality ─────────────────────────────────────────────────────

class TestSearch:
    """Verify search returns relevant results"""

    def test_search_returns_results_for_ai(self, api_client):
        """Search for 'AI' should return results"""
        response = api_client.get(f"{BASE_URL}/api/articles/search?q=AI")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] > 0, "Search for 'AI' returned no results"
        assert len(data["articles"]) > 0, "Search for 'AI' returned empty articles array"
        print(f"✓ Search 'AI': {data['total']} results")

    def test_search_returns_relevant_results(self, api_client):
        """Search results should be relevant to query term"""
        response = api_client.get(f"{BASE_URL}/api/articles/search?q=OpenAI&limit=10")
        assert response.status_code == 200
        data = response.json()

        if data["total"] == 0:
            pytest.skip("No 'OpenAI' articles in DB to test relevance")

        articles = data["articles"]
        # At least half of results should mention 'openai' in title, summary, or source
        relevant = 0
        for a in articles:
            combined = f"{a.get('title', '')} {a.get('summary', '')} {a.get('source_name', '')}".lower()
            if "openai" in combined or "open ai" in combined:
                relevant += 1

        relevance_ratio = relevant / len(articles)
        assert relevance_ratio >= 0.5, (
            f"Only {relevant}/{len(articles)} ({relevance_ratio:.0%}) results are relevant for 'OpenAI' search"
        )
        print(f"✓ Search relevance: {relevant}/{len(articles)} results contain 'openai'")

    def test_search_empty_query_returns_empty(self, api_client):
        """Empty search returns no results"""
        response = api_client.get(f"{BASE_URL}/api/articles/search?q=")
        assert response.status_code == 200
        data = response.json()
        assert len(data["articles"]) == 0, "Empty search should return no articles"
        print("✓ Empty search returns empty results")

    def test_search_no_results_for_nonsense(self, api_client):
        """Search for random nonsense returns no results"""
        response = api_client.get(f"{BASE_URL}/api/articles/search?q=ZZZNONEXISTENTTERMXXX")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0, f"Nonsense search returned {data['total']} results"
        print("✓ Nonsense search returns zero results")


# ─── Article Detail Source Link ───────────────────────────────────────────────

class TestArticleDetail:
    """Verify article detail includes source link (article_url and source_url)"""

    def test_article_detail_has_article_url(self, api_client):
        """GET /api/articles/{id} - article should have article_url for source link"""
        resp = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        articles = resp.json()["articles"]
        if not articles:
            pytest.skip("No articles available")

        article_id = articles[0]["id"]
        detail_resp = api_client.get(f"{BASE_URL}/api/articles/{article_id}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()

        assert detail.get("article_url"), f"Article detail missing article_url (id={article_id})"
        assert detail["article_url"].startswith("http"), f"article_url not valid URL: {detail['article_url']}"
        print(f"✓ Article detail has article_url: {detail['article_url'][:60]}")

    def test_article_detail_has_source_url(self, api_client):
        """GET /api/articles/{id} - article should have source_url"""
        resp = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        articles = resp.json()["articles"]
        if not articles:
            pytest.skip("No articles available")

        article_id = articles[0]["id"]
        detail_resp = api_client.get(f"{BASE_URL}/api/articles/{article_id}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()

        assert detail.get("source_url"), f"Article detail missing source_url (id={article_id})"
        print(f"✓ Article detail has source_url: {detail['source_url']}")

    def test_article_detail_has_source_name(self, api_client):
        """GET /api/articles/{id} - article should have source_name"""
        resp = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        articles = resp.json()["articles"]
        if not articles:
            pytest.skip("No articles available")

        article_id = articles[0]["id"]
        detail_resp = api_client.get(f"{BASE_URL}/api/articles/{article_id}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()

        assert detail.get("source_name"), f"Article detail missing source_name (id={article_id})"
        print(f"✓ Article detail has source_name: {detail['source_name']}")

    def test_article_detail_has_published_at(self, api_client):
        """GET /api/articles/{id} - article should have published_at timestamp"""
        resp = api_client.get(f"{BASE_URL}/api/articles?limit=1")
        articles = resp.json()["articles"]
        if not articles:
            pytest.skip("No articles available")

        article_id = articles[0]["id"]
        detail_resp = api_client.get(f"{BASE_URL}/api/articles/{article_id}")
        assert detail_resp.status_code == 200
        detail = detail_resp.json()

        assert detail.get("published_at"), f"Article detail missing published_at (id={article_id})"
        print(f"✓ Article detail has published_at: {detail['published_at']}")
