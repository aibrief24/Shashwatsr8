"""
image_optimizer.py — Fast thumbnail URL generation for AIBrief24 articles.

Strategy (in order of preference):
1. Unsplash URLs → append native transform params (?w=400&q=70&fm=webp)
   Unsplash CDN natively supports these, zero download needed.
2. Other external URLs → download, compress with Pillow, upload to Supabase Storage.
   Falls back gracefully to original URL if anything fails.

Returns (main_url, thumbnail_url) tuples.
"""
import io
import logging
import os
import re
from urllib.parse import urlparse, urlencode, parse_qs, urlunparse

import requests

logger = logging.getLogger(__name__)

# ─── Unsplash URL transformation ─────────────────────────────────────────────
def _optimize_unsplash_url(url: str, width: int, quality: int) -> str:
    """Append Unsplash-native image transform parameters."""
    # Strip any existing w/q/fm params first
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    return f"{base}?w={width}&q={quality}&fm=webp&fit=crop&auto=format"


def generate_thumbnail_url(image_url: str) -> str | None:
    """Generate a fast-loading thumbnail URL for use in feed cards.
    
    For Unsplash: uses native CDN params (no download, instant).
    For others: attempts download + Pillow compress + Supabase Storage upload.
    Falls back to original URL if anything fails.
    
    Returns thumbnail URL or None if original should be used.
    """
    if not image_url or not image_url.startswith("http"):
        return None
    
    url_lower = image_url.lower()
    
    # ── Unsplash: native transform (best path, zero cost) ────────────────────
    if "images.unsplash.com" in url_lower:
        try:
            thumb = _optimize_unsplash_url(image_url, width=400, quality=72)
            logger.debug(f"[Optimizer] Unsplash thumb: {thumb[:70]}")
            return thumb
        except Exception as e:
            logger.warning(f"[Optimizer] Unsplash URL transform failed: {e}")
            return None
    
    # ── ar5iv/arxiv figures: they're already small PNGs, keep as-is ──────────
    if "ar5iv.org" in url_lower or "arxiv.org" in url_lower:
        return None  # use original
    
    # ── Other external URLs: download + compress with Pillow ─────────────────
    return _download_compress_upload(image_url)


def _download_compress_upload(image_url: str) -> str | None:
    """Download an image, compress it to WebP thumbnail, upload to Supabase Storage.
    Returns the Supabase public URL, or None on any failure.
    """
    try:
        from PIL import Image as PILImage
    except ImportError:
        logger.warning("[Optimizer] Pillow not installed — skipping compression")
        return None
    
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        logger.warning("[Optimizer] No Supabase credentials — skipping upload")
        return None
    
    bucket = "article-images"
    
    # 1. Download the image (5MB limit, 6s timeout)
    try:
        resp = requests.get(
            image_url, timeout=6,
            headers={"User-Agent": "Mozilla/5.0"},
            stream=True
        )
        if resp.status_code != 200:
            return None
        data = b""
        for chunk in resp.iter_content(8192):
            data += chunk
            if len(data) > 5 * 1024 * 1024:  # 5MB limit
                logger.debug("[Optimizer] Image too large, skipping")
                return None
    except Exception as e:
        logger.debug(f"[Optimizer] Download failed: {e}")
        return None
    
    # 2. Compress with Pillow → WebP 400x225 thumbnail
    try:
        img = PILImage.open(io.BytesIO(data)).convert("RGB")
        img.thumbnail((400, 225), PILImage.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=72, method=4)
        buf.seek(0)
        compressed = buf.read()
    except Exception as e:
        logger.debug(f"[Optimizer] Compress failed: {e}")
        return None
    
    # 3. Upload to Supabase Storage
    # Derive a stable filename from the URL hash
    url_hash = abs(hash(image_url)) % (10 ** 12)
    filename = f"thumb_{url_hash}.webp"
    storage_path = f"thumbnails/{filename}"
    
    upload_url = f"{supabase_url}/storage/v1/object/{bucket}/{storage_path}"
    try:
        upload_resp = requests.post(
            upload_url,
            headers={
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "image/webp",
                "x-upsert": "true",
            },
            data=compressed,
            timeout=10,
        )
        if upload_resp.status_code in (200, 201):
            public_url = f"{supabase_url}/storage/v1/object/public/{bucket}/{storage_path}"
            logger.info(f"[Optimizer] Uploaded thumbnail: {public_url[:70]}")
            return public_url
        else:
            logger.debug(f"[Optimizer] Upload failed HTTP {upload_resp.status_code}: {upload_resp.text[:100]}")
            return None
    except Exception as e:
        logger.debug(f"[Optimizer] Upload exception: {e}")
        return None


def optimize_image_url(image_url: str) -> tuple[str, str | None]:
    """Return (main_url, thumbnail_url) for an article image.
    
    - main_url: 800px optimized (Unsplash native or original)
    - thumbnail_url: 400px WebP (Unsplash native or Supabase-hosted compressed)
    
    Both fall back gracefully to the original URL on any error.
    """
    if not image_url:
        return image_url, None
    
    # Main image: 800px optimized for article detail view
    if "images.unsplash.com" in image_url.lower():
        main_url = _optimize_unsplash_url(image_url, width=800, quality=82)
    else:
        main_url = image_url
    
    # Thumbnail: 400px for feed cards
    thumb_url = generate_thumbnail_url(image_url)
    
    return main_url, thumb_url
