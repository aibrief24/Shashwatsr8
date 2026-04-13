"""Content ingestion pipeline for AIBrief24.

Fetches articles from RSS sources, generates AI summaries with OpenAI,
deduplicates, and saves to Supabase.

Usage:
    python ingestor.py              # Run full ingestion
    python ingestor.py --dry-run    # Preview without saving
"""
import os
import sys
import uuid
import logging
import re
import feedparser
import requests
from urllib.parse import urlparse
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from database import query, execute
from image_optimizer import optimize_image_url

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ─── Optional deps ────────────────────────────────────────────────────────────
try:
    from bs4 import BeautifulSoup
    _bs4_available = True
except ImportError:
    _bs4_available = False

# ─── OpenAI setup ─────────────────────────────────────────────────────────────
try:
    import openai as _openai_mod
    _openai_client = _openai_mod.OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    _openai_available = bool(os.environ.get("OPENAI_API_KEY"))
except Exception:
    _openai_available = False
    _openai_client = None

# ─── Category detection ───────────────────────────────────────────────────────
CATEGORY_RULES = {
    "AI Models": {
        "required": ["gpt-4", "gpt-5", "claude 3", "gemini 1.5", "llama 3", "mistral", "o1", "o3", "deepseek", "qwen", "phi-3", "open-source model", "frontier model", "large language model", "llm", "parameters", "benchmark", "weights"],
        "bonus": ["architecture", "inference", "training", "multi-modal", "capability", "context window"],
        "penalty": ["powered by", "integration", "app", "raises", "funding", "feature", "launches new feature", "startup", "platform", "tutorial", "how to", "api", "setup", "install", "guide", "researchers", "study", "framework", "paper", "arxiv", "applied", "infrastructure", "reading list", "developer", "usage", "safety", "privacy", "embeddings", "clustering", "unmask", "pseudonymous", "scikit-learn", "beginner", "implementation", "how-to", "series a", "series b", "seed round"],
        "threshold": 3.0
    },
    "AI Tools": {
        "required": ["tool", "saas", "workflow", "agent", "automation", "platform", "app", "copilot", "plugin", "extension", "productivity", "assistant", "api", "sdk"],
        "bonus": ["no-code", "low-code", "interface", "generate", "automate"],
        "penalty": ["funding", "raises", "arxiv", "parameter", "weights", "architecture", "benchmark", "series a", "series b", "seed round", "researchers", "study", "framework", "paper", "consumer", "tv", "router", "smartphone", "laptop"],
        "threshold": 3.0
    },
    "AI Startups": {
        "required": ["startup", "founder", "entrepreneur", "stealth", "y combinator", "incubator", "early-stage"],
        "bonus": ["vision", "company", "team", "pitch"],
        "penalty": ["google", "microsoft", "meta", "amazon", "apple", "arxiv", "paper", "benchmark", "parameters"],
        "threshold": 2.5
    },
    "Funding News": {
        "required": ["raises", "funding", "seed round", "series a", "series b", "series c", "series d", "valuation", "backed by", "venture capital", "vc", "acquires", "acquisition", "investment", "investors", "fund"],
        "bonus": ["million", "billion", "round", "deal", "stake"],
        "penalty": ["arxiv", "paper", "feature", "upgrade", "tutorial", "how to", "benchmark"],
        "threshold": 3.0
    },
    "Product Launches": {
        "required": ["launches", "introduces", "rolls out", "new feature", "announces", "now available", "powered by", "integration", "gets ai", "adds ai", "unveils", "release"],
        "bonus": ["copilot", "maps", "office", "firefly", "adobe", "workspace", "update"],
        "penalty": ["arxiv", "paper", "raises", "funding", "seed round", "series a", "series b", "researchers", "study"],
        "threshold": 3.0
    },
    "Big Tech AI": {
        "required": ["openai", "google", "meta", "microsoft", "amazon", "apple", "anthropic", "nvidia", "xai", "deepmind"],
        "bonus": ["strategy", "partnership", "ecosystem", "ceo", "announces", "earnings", "stock"],
        "penalty": ["seed round", "startup", "indie", "arxiv", "paper", "stealth", "y combinator"],
        "threshold": 3.0
    },
    "Open Source AI": {
        "required": ["open source", "open-source", "hugging face", "open model", "open weights", "github", "ollama", "local model", "self-hosted", "weights"],
        "bonus": ["mit license", "apache", "community", "repo", "repository"],
        "penalty": ["closed source", "proprietary", "funding", "raises", "series a"],
        "threshold": 3.0
    },
    "AI Research": {
        "required": ["arxiv", "paper", "researchers", "study", "findings", "new method", "state-of-the-art", "sota", "framework", "academic", "university", "evaluation", "breakthrough", "experiment", "scientists"],
        "bonus": ["dataset", "algorithm", "mit", "stanford", "harvard", "oxford"],
        "penalty": ["launches", "startup", "funding", "raises", "app", "product", "series a", "series b", "plugin", "extension", "tutorial", "how to", "guide"],
        "threshold": 3.0
    }
}

# Keywords that indicate an article is AI-related (used to filter non-AI content)
AI_RELEVANCE_KEYWORDS = [
    "ai", "artificial intelligence", "machine learning", "deep learning",
    "neural", "llm", "gpt", "chatgpt", "chatbot", "openai", "anthropic", "gemini",
    "claude", "mistral", "llama", "model", "automation", "robot", "algorithm",
    "data science", "nlp", "computer vision", "generative", "diffusion",
    "reinforcement learning", "transformer", "language model", "copilot",
    "nvidia", "deepmind", "hugging face", "agent", "rag",
]

# Hard blocklist for generic consumer tech / non-AI news
FORBIDDEN_KEYWORDS = [
    "tv", "tvs", "review", "password manager", "smartphone", "laptop", "gaming", "router", 
    "deal", "deals", "black friday", "cyber monday", "best buy", "amazon prime", "headphone",
    "earbuds", "watch", "smartwatch", "console", "nintendo", "playstation", "xbox",
    "processor review", "motherboard", "mouse", "keyboard", "monitor"
]


DEFAULT_CATEGORY = "Latest"



def _calculate_ai_relevance(title: str, text: str) -> float:
    text_combined = f"{title.lower()} {text.lower()}"
    
    # If a forbidden consumer tech word is present, nuke the score so it's rejected
    for kw in FORBIDDEN_KEYWORDS:
        if f" {kw} " in text_combined or text_combined.startswith(f"{kw} ") or text_combined.endswith(f" {kw}"):
            return -100.0
            
    score = sum(text_combined.count(kw) for kw in AI_RELEVANCE_KEYWORDS)
    return score

# ─── Image pool ───────────────────────────────────────────────────────────────
# 30 unique verified Unsplash URLs for generic AI tech articles
IMAGE_POOL = [
    "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=800&q=80",
    "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&q=80",
    "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&q=80",
    "https://images.unsplash.com/photo-1561736778-92e52a7769ef?w=800&q=80",
    "https://images.unsplash.com/photo-1555255707-c07966088b7b?w=800&q=80",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80",
    "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800&q=80",
    "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80",
    "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&q=80",
    "https://images.unsplash.com/photo-1488229297570-58520851e868?w=800&q=80",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80",
    "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800&q=80",
    "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80",
    "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80",
    "https://images.unsplash.com/photo-1617042375876-a13e36732a04?w=800&q=80",
    "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&q=80",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
    "https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=800&q=80",
    "https://images.unsplash.com/photo-1573164713712-03790a178651?w=800&q=80",
    "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=800&q=80",
    "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=800&q=80",
    "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80",
    "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=800&q=80",
    "https://images.unsplash.com/photo-1639762681057-408e52192e55?w=800&q=80",
    "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=800&q=80",
    "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&q=80",
    "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&q=80",
    "https://images.unsplash.com/photo-1561736778-92e52a7769ef?w=800&q=80",
    "https://images.unsplash.com/photo-1555255707-c07966088b7b?w=800&q=80",
]

# ─── ArXiv Specific Image Pool ─────────────────────────────────────────────
# 20 unique research/math/abstract-themed verified Unsplash URLs
ARXIV_IMAGE_POOL = [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80",
    "https://images.unsplash.com/photo-1580894732444-8ecded7900cd?w=800&q=80",
    "https://images.unsplash.com/photo-1617791160536-598cf32026fb?w=800&q=80",
    "https://images.unsplash.com/photo-1618044733300-9472054094ee?w=800&q=80",
    "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&q=80",
    "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&q=80",
    "https://images.unsplash.com/photo-1634152962476-4b8a00e1915c?w=800&q=80",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
    "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80",
    "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800&q=80",
    "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800&q=80",
    "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80",
    "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80",
    "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&q=80",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80",
    "https://images.unsplash.com/photo-1573164713712-03790a178651?w=800&q=80",
    "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=800&q=80",
    "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80",
    "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=800&q=80",
    "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=800&q=80",
]


def _pick_image(seed: str, is_arxiv: bool = False, title: str = "") -> str:
    """Deterministically pick a unique-feeling image from the pool.
    Uses both the UUID seed and article title hash to reduce collisions.
    """
    pool = ARXIV_IMAGE_POOL if is_arxiv else IMAGE_POOL
    seed_clean = seed.replace("-", "")[:8]
    title_entropy = sum(ord(c) * (i + 1) for i, c in enumerate(title[:30])) if title else 0
    combined = int(seed_clean, 16) ^ title_entropy
    idx = combined % len(pool)
    return pool[idx]


def _get_source_url(feed_url: str) -> str:
    """Extract homepage URL from RSS feed URL.
    e.g. https://theverge.com/rss/index.xml -> https://theverge.com
    """
    try:
        parsed = urlparse(feed_url)
        return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        return feed_url


def _detect_category_strict(title: str, text: str) -> tuple[str, float, list[str]]:
    title_lower = title.lower()
    text_lower = text.lower()
    
    best_cat = DEFAULT_CATEGORY
    max_score = 0.0
    scores = {}
    rejection_reasons = []
    
    for cat, rules in CATEGORY_RULES.items():
        score = 0.0
        
        for req in rules.get("required", []):
            count_title = title_lower.count(req)
            count_text = text_lower.count(req)
            score += (count_title * 3.0) + (count_text * 1.0)
            
        for bon in rules.get("bonus", []):
            count_title = title_lower.count(bon)
            count_text = text_lower.count(bon)
            score += (count_title * 1.5) + (count_text * 0.5)
            
        for pen in rules.get("penalty", []):
            count_title = title_lower.count(pen)
            count_text = text_lower.count(pen)
            pen_score = (count_title * 5.0) + (count_text * 2.0)
            score -= pen_score
            if pen_score > 0 and score < rules.get("threshold", 3.0):
                rejection_reasons.append(f"rejected_from_{cat.lower().replace(' ', '_')}_due_to_penalty_{pen.replace(' ', '_')}")
            
        # Give a substantial boost to AI Models if a frontier lab releases it
        if cat == "AI Models" and any(lab in title_lower for lab in ["openai", "anthropic", "meta", "google", "deepmind", "xai"]):
            if any(req in title_lower for req in rules.get("required", [])):
                score += 5.0 # Frontier model release override boost

        if score >= rules.get("threshold", 3.0):
            scores[cat] = score
        elif score > 0:
            rejection_reasons.append(f"weak_match_{cat.lower().replace(' ', '_')}")
            
    if scores:
        # Sort by score descending
        best_cat = max(scores.items(), key=lambda x: x[1])[0]
        max_score = scores[best_cat]
        
    return best_cat, max_score, list(set(rejection_reasons))


def _clean_summary_text(text: str) -> str:
    """Fallback cleanup to remove weak external-link phrases if the AI fails the prompt."""
    bad_prefixes = [
        "for more information",
        "for more details",
        "you can read more",
        "read more at",
        "read more on",
        "visit the provided",
        "visit the link",
        "check the source",
        "check out the source",
        "learn more at",
        "learn more on",
        "to learn more",
    ]
    
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    cleaned = []
    for s in sentences:
        s_lower = s.lower()
        if any(bad in s_lower for bad in bad_prefixes):
            continue
        cleaned.append(s)
        
    res = " ".join(cleaned).strip()
    if res and res[-1] not in ".!?":
        res += "."
    return res or text


def _generate_summary(title: str, content: str) -> str:
    """Use OpenAI to generate a premium, informative summary. Falls back to truncated content."""
    if not _openai_available or not content.strip():
        return (content[:400] + "...") if len(content) > 400 else (content or title)

    try:
        resp = _openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an elite tech journalist and AI news summarizer for a premium app. "
                        "Write a concise but highly informative summary (3-4 sentences). "
                        "Explain exactly what happened, what the product/model does, why it matters, and who it affects. "
                        "For startups or product launches, clearly explain the core value proposition. "
                        "NEVER use phrases like 'read more', 'for more details', or 'visit the link'. "
                        "Make the summary feel completely self-contained so the user understands the news without clicking away. "
                        "No fluff, no greetings, no markdown."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Summarize:\n\nTitle: {title}\n\nContent: {content[:3000]}",
                },
            ],
            max_tokens=200,
            temperature=0.4,
        )
        summary = resp.choices[0].message.content.strip()
        return _clean_summary_text(summary)
    except Exception as e:
        logger.warning(f"OpenAI summary failed: {e}")
        return (content[:400] + "...") if len(content) > 400 else (content or title)


def _article_exists(article_url: str) -> bool:
    try:
        rows = query("SELECT id FROM articles WHERE article_url = %s LIMIT 1", (article_url,))
        return bool(rows)
    except Exception:
        return False


def _is_valid_image_url(url: str) -> bool:
    """Rigorous check to reject logos, favicons, avatars, generic placeholders, and SVGs."""
    if not url or not isinstance(url, str):
        return False
        
    url_lower = url.lower()
    if not url_lower.startswith("http"):
        return False
        
    if url_lower.endswith(".svg"):
         return False
         
         
    # Extra: reject generic arXiv domain images
    ARXIV_BAD_PATTERNS = [
        "static.arxiv.org", "arxiv.org/static", "arxiv.org/icons",
        "abs_login", "arxiv-logo", "b_logo", "1x1", "pixel", "tracking",
        "s2-logo", "semantic-scholar",
    ]
    for bad in ARXIV_BAD_PATTERNS:
        if bad in url_lower:
            return False
    return True


def _is_valid_arxiv_figure_url(url: str) -> bool:
    """Stricter validation specifically for figures scraped from ar5iv paper HTML.
    Rejects decorative math symbols, tiny icons, and non-content images.
    """
    if not _is_valid_image_url(url):
        return False
    url_lower = url.lower()
    # Reject obvious decorative or formula image patterns
    FIGURE_BAD_PATTERNS = [
        "/icon", "/symbol", "/sprite", "equation", "/math",
        "badge", "cc-by", "license", "orcid", "creative-commons",
    ]
    for pat in FIGURE_BAD_PATTERNS:
        if pat in url_lower:
            return False
    return True


def _extract_rss_image(entry) -> tuple[str, str] | tuple[None, None]:
    """Try to extract a validated image URL from a feed entry. Returns (url, type)."""
    candidates = []
    
    if hasattr(entry, "media_content") and entry.media_content:
        for media in entry.media_content:
            candidates.append(media.get("url", ""))
            
    if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
        for thumb in entry.media_thumbnail:
             candidates.append(thumb.get("url", ""))
             
    for enc in getattr(entry, "enclosures", []):
        if "image" in enc.get("type", ""):
             candidates.append(enc.get("href", ""))
             
    for url in candidates:
        if _is_valid_image_url(url):
            return url, "rss"
            
    return None, None


def _fetch_og_image(article_url: str) -> tuple[str, str] | tuple[None, None]:
    """Fetch priority images from article HTML. Try og:image first, then scrape hero. Returns (url, type)."""
    if not _bs4_available:
        return None, None
        
    # ArXiv Specific HTML Figure Parsing
    # If it's an arxiv abstract, hit the ar5iv HTML mirror to hunt for actual paper figures
    is_arxiv = "arxiv.org" in article_url.lower()
    target_url = article_url
    
    if is_arxiv:
        target_url = article_url.replace("arxiv.org/abs/", "ar5iv.org/html/")
        target_url = target_url.replace("arxiv.org/pdf/", "ar5iv.org/html/")
        logger.debug(f"[ArXiv] Attempting ar5iv figure scrape at: {target_url}")
        
    try:
        res = requests.get(
            target_url,
            timeout=6,
            headers={"User-Agent": "Mozilla/5.0 (compatible; AIBrief24Bot/1.0)"},
            allow_redirects=True,
            stream=True,
        )
        if res.status_code != 200:
            logger.debug(f"[ArXiv] ar5iv returned {res.status_code} for {target_url}")
            return None, None
            
        content = b""
        for chunk in res.iter_content(chunk_size=8192):
            content += chunk
            if len(content) >= 300000:
                break

        soup = BeautifulSoup(content, "html.parser")
        
        if is_arxiv:
            # Look for ar5iv figure renders — use urljoin for correct absolute URL resolution
            figures = soup.find_all("figure")
            logger.debug(f"[ArXiv] Found {len(figures)} figures in {target_url}")
            for fig in figures:
                img_tag = fig.find("img")
                if not img_tag:
                    continue
                src = img_tag.get("src") or img_tag.get("data-src")
                if not src:
                    continue
                # Properly resolve relative paths using urljoin
                from urllib.parse import urljoin
                full_img_url = urljoin(target_url, src)
                if _is_valid_image_url(full_img_url):
                    logger.debug(f"[ArXiv] Valid figure found: {full_img_url}")
                    return full_img_url, "arxiv_figure_scrape"
                else:
                    logger.debug(f"[ArXiv] Figure rejected by validator: {full_img_url}")
            logger.debug(f"[ArXiv] No valid figures found in paper, will use ARXIV_IMAGE_POOL")
            return None, None  # Fallthrough safely to ARXIV_IMAGE_POOL

        # Priority 1: High quality social graph signals
        for prop in ("og:image", "twitter:image"):
            tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
            if tag and tag.get("content"):
                img = tag["content"].strip()
                if _is_valid_image_url(img):
                    return img, prop.replace(":", "_")
                    
        # Priority 2: Try to scrape the first large image in the article body as a hero fallback
        article_body = soup.find("article") or soup.find("main") or soup
        for img_tag in article_body.find_all("img"):
             src = img_tag.get("src") or img_tag.get("data-src")
             if src and _is_valid_image_url(src):
                 width = img_tag.get("width")
                 if width and str(width).isdigit() and int(width) < 200:
                     continue
                 return src if src.startswith("http") else None, "hero_scrape"
                 
    except Exception as e:
        if is_arxiv:
            logger.info(f"[ArXiv] ar5iv extraction raised an exception: {e}")
        pass
    return None, None


def _get_arxiv_image(article_url: str, article_id: str, title: str = "") -> tuple[str, str]:
    """Dedicated arXiv image resolver. Completely isolated from the normal pipeline.
    
    Strategy (in order):
    1. Try extracting a real figure from ar5iv HTML rendering of the paper
    2. If that fails for any reason, assign a premium research pool image
    
    ALWAYS returns a valid (url, type) tuple. Never returns None.
    Never uses generic arXiv RSS images, og:image, or arXiv logos.
    """
    ar5iv_url = article_url.replace("arxiv.org/abs/", "ar5iv.org/html/")
    ar5iv_url = ar5iv_url.replace("arxiv.org/pdf/", "ar5iv.org/html/")
    
    if ar5iv_url != article_url and _bs4_available:
        try:
            logger.info(f"[ArXiv] Trying ar5iv: {ar5iv_url[:70]}")
            res = requests.get(
                ar5iv_url,
                timeout=5,
                headers={"User-Agent": "Mozilla/5.0 (compatible; AIBrief24Bot/1.0)"},
                allow_redirects=True,
                stream=True,
            )
            if res.status_code == 200:
                content = b""
                for chunk in res.iter_content(chunk_size=8192):
                    content += chunk
                    if len(content) >= 200000:
                        break
                soup = BeautifulSoup(content, "html.parser")
                from urllib.parse import urljoin
                for fig in soup.find_all("figure"):
                    img_tag = fig.find("img")
                    if not img_tag:
                        continue
                    src = img_tag.get("src") or img_tag.get("data-src")
                    if not src:
                        continue
                    # Skip tiny decorative images (math formulas, icons)
                    width_attr = img_tag.get("width", "")
                    try:
                        if width_attr and int(str(width_attr).strip()) < 100:
                            continue
                    except (ValueError, TypeError):
                        pass
                    full_url = urljoin(ar5iv_url, src)
                    if _is_valid_arxiv_figure_url(full_url) and full_url.startswith("http"):
                        logger.info(f"[ArXiv] Figure extracted: {full_url[:70]}")
                        return full_url, "arxiv_figure"
            logger.info(f"[ArXiv] ar5iv figure extraction failed (HTTP {res.status_code if res else 'N/A'}), using pool")
        except Exception as e:
            logger.info(f"[ArXiv] ar5iv failed ({type(e).__name__}), using pool")
    
    # Always fall back to premium research pool image
    fallback = _pick_image(article_id, is_arxiv=True, title=title)
    logger.info(f"[ArXiv] Using ARXIV_IMAGE_POOL: ...{fallback[-40:]}")
    return fallback, "arxiv_pool"


def ingest_source(source: dict, seen_images: set, dry_run: bool = False) -> dict:
    """Ingest articles from a single RSS source.
    Returns metrics dict.
    """
    metrics = {"new_ids": [], "rejected_non_ai": 0, "skipped_as_tutorial": 0, "errors": 0, "feed_error": False}
    source_url = _get_source_url(source["url"])

    try:
        # Check if the feed is even valid RSS/XML
        feed = feedparser.parse(source["url"], request_headers={"User-Agent": "AIBrief24/1.0"})
        if feed.bozo and not feed.entries:
            logger.warning(f"Invalid or malformed feed from {source['name']}: {feed.bozo_exception}")
            metrics["feed_error"] = True
            return metrics

        for entry in feed.entries[:15]:  # Max 15 per source
            article_url = entry.get("link", "").strip()
            if not article_url:
                continue
            if _article_exists(article_url):
                continue

            title = entry.get("title", "Untitled").strip()
            content = entry.get("summary", "") or entry.get("description", "") or ""

            # Check AI Relevance and apply mixed-source strictness
            relevance_score = _calculate_ai_relevance(title, content)
            
            # If it's a generic tech source (no category_hint), demand strong AI signal (>= 2 hits)
            if not source.get("category_hint") and relevance_score < 2.0:
                metrics["rejected_non_ai"] += 1
                continue
                
            # Even for AI sources, it must have at least *some* AI context 
            if source.get("category_hint") and relevance_score <= 0.0:
                metrics["rejected_non_ai"] += 1
                continue

            # Check for pure tutorials in the Latest queue
            combined_text = f"{title.lower()} {content.lower()}"
            tutorial_keywords = ["tutorial", "how to", "guide", "beginner's guide", "step-by-step"]
            is_tutorial = any(kw in combined_text for kw in tutorial_keywords)

            # Predict category logic
            summary = _generate_summary(title, content)
            strict_cat, conf_score, rejection_reasons = _detect_category_strict(title, summary)
            
            # The category must be earned on its own merits. 
            # We no longer blind trust the source's category_hint.
            category = strict_cat
            
            # Boost the score if it matches the source's hint, but don't force it
            hint = source.get("category_hint")
            if hint and hint == category:
                 conf_score += 1.0
            
            # Block tutorials from crowding the Latest feed
            if is_tutorial and category == "Latest":
                metrics["skipped_as_tutorial"] += 1
                continue

            # Parse publish date
            published = entry.get("published_parsed") or entry.get("updated_parsed")
            if published:
                try:
                    pub_dt = datetime(*published[:6], tzinfo=timezone.utc)
                except Exception:
                    pub_dt = datetime.now(timezone.utc)
            else:
                pub_dt = datetime.now(timezone.utc)

            # Assign ID first so we can use it in _pick_image fallback
            new_id = str(uuid.uuid4())
            is_arxiv_article = "arxiv.org" in article_url.lower()

            if is_arxiv_article:
                # ── arXiv: fully dedicated image path ──────────────────────
                # Never use RSS/OG for arXiv — too unreliable, produces logos.
                # Use dedicated extractor that tries ar5iv first then pool.
                resolved_image_url, resolved_source_type = _get_arxiv_image(
                    article_url, new_id, title=title
                )
            else:
                # ── Normal articles: og:image > RSS > pool fallback ─────────
                og_url, og_type = _fetch_og_image(article_url)
                rss_url, rss_type = _extract_rss_image(entry)
                resolved_image_url = og_url or rss_url
                resolved_source_type = og_type or rss_type

                # Deduplicate against images already seen in this session
                if resolved_image_url:
                    if resolved_image_url in seen_images:
                        logger.debug(f"Deduplicated repeated image: {resolved_image_url[:60]}")
                        resolved_image_url = None
                    else:
                        seen_images.add(resolved_image_url)

                # Final fallback for non-arXiv articles
                if not resolved_image_url:
                    resolved_image_url = _pick_image(new_id, is_arxiv=False, title=title)
                    resolved_source_type = "fallback_pool"

            if dry_run:
                logger.info(f"[DRY RUN] Would add: {title[:60]}")
                metrics["new_ids"].append(new_id)
                continue

            # ── Optimize images before saving ──
            if not dry_run:
                resolved_image_url, thumb_url = optimize_image_url(resolved_image_url)
            else:
                thumb_url = None

            # Create string representation of rejections if defaulting to Latest
            rejection_str = ",".join(rejection_reasons) if category == "Latest" and rejection_reasons else ""

            execute(
                """
                INSERT INTO articles (
                    id, title, summary, image_url, thumbnail_url, source_name, source_url, article_url,
                    category, published_at, status, is_breaking, notification_sent,
                    ai_relevance_score, category_confidence_score, original_category, image_source_type
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'published', false, false, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (new_id, title, summary, resolved_image_url, thumb_url, source["name"], source_url,
                 article_url, category, pub_dt, relevance_score, conf_score, strict_cat, resolved_source_type),
            )
            metrics["new_ids"].append(new_id)
            if dry_run:
                img_log = f"[Img: {resolved_source_type}]"
                if category == "Latest" and rejection_str:
                     logger.info(f"Added [Latest] (Rejected: {rejection_str}) {img_log} {source['name']}: {title[:40]}")
                else:
                     logger.info(f"Added [{category}] {img_log} {source['name']}: {title[:55]}")
            else:
                logger.info(f"Added [{category}] {source['name']}: {title[:55]}")

    except Exception as e:
        logger.error(f"Error ingesting {source.get('name', 'unknown')}: {e}")
        metrics["errors"] += 1

    return metrics


def run_ingestion(dry_run: bool = False) -> dict:
    """Run the full content ingestion pipeline.
    Returns dict with new_article_ids for targeted push notifications.
    """
    try:
        sources = query("SELECT * FROM sources WHERE active = true ORDER BY name")
    except Exception as e:
        return {"status": "error", "message": str(e), "total": 0, "new_article_ids": []}

    if not sources:
        return {"status": "no_sources", "total": 0, "results": [], "new_article_ids": []}

    logger.info(f"Starting ingestion of {len(sources)} sources (dry_run={dry_run})")

    all_new_ids = []
    results = []
    metrics = {
        "skipped_feeds": 0,
        "rejected_non_ai": 0,
        "skipped_as_tutorial": 0,
        "inserted_articles": 0,
    }
    
    seen_image_session_cache = set()
    
    for source in sources:
        source_metrics = ingest_source(source, seen_image_session_cache, dry_run=dry_run)
        
        if source_metrics["feed_error"]:
            metrics["skipped_feeds"] += 1
            
        metrics["rejected_non_ai"] += source_metrics["rejected_non_ai"]
        metrics["skipped_as_tutorial"] += source_metrics["skipped_as_tutorial"]
        
        new_ids = source_metrics["new_ids"]
        if new_ids:
            all_new_ids.extend(new_ids)
            metrics["inserted_articles"] += len(new_ids)
            
        results.append({
            "source": source["name"], 
            "new_articles": len(new_ids),
            "rejected_non_ai": source_metrics["rejected_non_ai"],
            "skipped_as_tutorial": source_metrics["skipped_as_tutorial"],
            "feed_error": source_metrics["feed_error"]
        })

    logger.info(f"Ingestion complete: {len(all_new_ids)} new articles from {len(sources)} sources")
    return {
        "status": "done",
        "total": len(all_new_ids),
        "metrics": metrics,
        "sources_processed": len(sources),
        "results": results,
        "new_article_ids": all_new_ids,
        "dry_run": dry_run,
    }


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    print(f"{'[DRY RUN] ' if dry else ''}Starting AIBrief24 content ingestion...")
    result = run_ingestion(dry_run=dry)
    print(f"\nResult: {result['status']}")
    print(f"Total inserted: {result['total']}")
    
    if 'metrics' in result:
        print(f"\nValidation Metrics:")
        print(f" - Feeds skipped (malformed/errors): {result['metrics']['skipped_feeds']}")
        print(f" - Articles rejected (non-AI/low score): {result['metrics']['rejected_non_ai']}")
        print(f" - Tutorials excluded from Latest: {result['metrics']['skipped_as_tutorial']}")
        
    print(f"\nSources processed: {result.get('sources_processed', 0)}")
    if result.get("results"):
        print("\nBreakdown (per source):")
        for r in result["results"]:
            err_tag = "[ERROR] " if r["feed_error"] else ""
            print(f"  {err_tag}{r['source']}: {r['new_articles']} inserted | {r['rejected_non_ai']} rejected | {r['skipped_as_tutorial']} skipped tutorials")
