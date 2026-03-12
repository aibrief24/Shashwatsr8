from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import uuid
import hashlib
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from auth import hash_password, verify_password, create_access_token, get_current_user
from database import supabase_client, supabase_ready

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI(title="AIBrief24 API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── Pydantic Models ─────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str
    password: str
    name: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class BookmarkRequest(BaseModel):
    article_id: str

class PushTokenRequest(BaseModel):
    token: str
    platform: str = "unknown"

class ArticleResponse(BaseModel):
    id: str
    title: str
    summary: str
    image_url: str
    source_name: str
    source_url: str
    article_url: str
    category: str
    published_at: str
    created_at: str
    slug: str
    is_breaking: bool = False
    telegram_cta_enabled: bool = True
    website_cta_enabled: bool = True
    content_excerpt: str = ""

# ─── In-Memory Stores ────────────────────────────────────────────────────────

users_db = {}
bookmarks_db = {}
push_tokens_db = {}
notification_logs = []

CATEGORIES = [
    "Latest", "AI Tools", "AI Startups", "AI Models", "AI Research",
    "Funding News", "Product Launches", "Big Tech AI", "Open Source AI"
]

APP_SETTINGS = {
    "notifications_enabled_default": True,
    "telegram_url": "https://t.me/aibrief24",
    "website_url": "https://aibrief24.com/",
}

# ─── Seed Data: 20 Realistic AI News Articles ────────────────────────────────

def _ts(days_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()

SEED_ARTICLES: List[dict] = [
    {
        "id": str(uuid.uuid4()),
        "title": "OpenAI Launches GPT-5: The Most Powerful AI Model Yet",
        "summary": "OpenAI has officially released GPT-5, its most advanced language model to date. The new model demonstrates significant improvements in reasoning, coding, and multimodal understanding. GPT-5 reportedly scores 92% on graduate-level reasoning benchmarks, a 15-point jump from GPT-4. Enterprise customers are already gaining access through the API, with consumer rollout expected within weeks. The model introduces native audio and video understanding capabilities. OpenAI CEO Sam Altman called it a major step toward artificial general intelligence. Competitors are expected to respond with their own next-gen models in the coming months.",
        "image_url": "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800",
        "source_name": "TechCrunch",
        "source_url": "https://techcrunch.com",
        "article_url": "https://techcrunch.com/openai-gpt5-launch",
        "category": "AI Models",
        "published_at": _ts(0),
        "created_at": _ts(0),
        "slug": "openai-launches-gpt5",
        "is_breaking": True,
        "telegram_cta_enabled": True,
        "website_cta_enabled": True,
        "content_excerpt": "OpenAI has officially released GPT-5..."
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Google DeepMind Achieves New Breakthrough in Drug Discovery",
        "summary": "Google DeepMind has announced a major advancement in AI-powered drug discovery using its AlphaFold 3 successor. The new system can predict protein-drug interactions with 95% accuracy, potentially cutting drug development timelines by years. Pharmaceutical partners including Eli Lilly and Novartis are already testing the technology. The breakthrough could significantly reduce the $2.6 billion average cost of bringing a new drug to market. DeepMind's research team published findings in Nature, demonstrating efficacy across 200 disease targets. This positions Google as a leader in the rapidly growing AI-for-science vertical worth an estimated $50 billion by 2030.",
        "image_url": "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=800",
        "source_name": "MIT Technology Review",
        "source_url": "https://technologyreview.com",
        "article_url": "https://technologyreview.com/deepmind-drug-discovery",
        "category": "AI Research",
        "published_at": _ts(0),
        "created_at": _ts(0),
        "slug": "deepmind-drug-discovery-breakthrough",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Anthropic Raises $3.5B in Massive Series D Round",
        "summary": "Anthropic, the AI safety company behind Claude, has closed a $3.5 billion Series D funding round led by Lightspeed Venture Partners with participation from Google, Salesforce, and T. Rowe Price. The round values the company at approximately $60 billion, making it one of the most valuable AI startups globally. CEO Dario Amodei stated the funds will accelerate research into safe and reliable AI systems. Anthropic plans to double its engineering team and expand its enterprise product offerings. The company's Claude model has been gaining significant market share in the enterprise AI assistant space, competing directly with OpenAI's ChatGPT.",
        "image_url": "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800",
        "source_name": "VentureBeat",
        "source_url": "https://venturebeat.com",
        "article_url": "https://venturebeat.com/anthropic-series-d",
        "category": "Funding News",
        "published_at": _ts(1),
        "created_at": _ts(1),
        "slug": "anthropic-raises-3-5b-series-d",
        "is_breaking": True,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Meta Releases Llama 4 with 400B Parameters as Open Source",
        "summary": "Meta has released Llama 4, its latest open-source large language model, featuring 400 billion parameters and multimodal capabilities. The model outperforms GPT-4 on several academic benchmarks while being freely available under a permissive license. Llama 4 includes a new mixture-of-experts architecture that reduces inference costs by 60% compared to dense models of similar size. The open-source community has already begun building applications on top of it. Meta AI chief Yann LeCun emphasized that open models drive faster innovation and safety research. The release puts significant pressure on closed-source competitors to justify premium pricing.",
        "image_url": "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800",
        "source_name": "The Verge",
        "source_url": "https://theverge.com",
        "article_url": "https://theverge.com/meta-llama-4-open-source",
        "category": "Open Source AI",
        "published_at": _ts(1),
        "created_at": _ts(1),
        "slug": "meta-releases-llama-4-open-source",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Cursor AI Valued at $10B After Explosive Growth",
        "summary": "AI coding assistant Cursor has reached a $10 billion valuation after its latest funding round, reflecting the explosive demand for AI-powered development tools. The company reports over 2 million daily active developers using its IDE, with revenue growing 400% year-over-year. Cursor's AI-first code editor has become the tool of choice for many professional developers, offering real-time code completion, refactoring, and debugging powered by advanced language models. The startup, founded by MIT graduates, has rapidly expanded from a small team to over 200 employees. Major tech companies including Google and Amazon are now piloting Cursor for their engineering teams.",
        "image_url": "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800",
        "source_name": "TechCrunch",
        "source_url": "https://techcrunch.com",
        "article_url": "https://techcrunch.com/cursor-ai-10b-valuation",
        "category": "AI Startups",
        "published_at": _ts(1),
        "created_at": _ts(1),
        "slug": "cursor-ai-valued-10b",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "NVIDIA Unveils Blackwell Ultra GPU for AI Training",
        "summary": "NVIDIA has announced the Blackwell Ultra GPU, its next-generation chip designed specifically for training the largest AI models. The new GPU offers 3x the performance of the H100 while consuming only 20% more power, addressing growing concerns about AI's energy footprint. Major cloud providers including AWS, Azure, and Google Cloud have already committed to deploying Blackwell Ultra clusters. CEO Jensen Huang revealed that pre-orders exceed $30 billion, signaling unprecedented demand for AI compute. The chip features a new interconnect technology enabling efficient scaling to 100,000-GPU clusters. NVIDIA's stock reached new all-time highs on the announcement.",
        "image_url": "https://images.unsplash.com/photo-1591405351990-4726e331f141?w=800",
        "source_name": "Ars Technica",
        "source_url": "https://arstechnica.com",
        "article_url": "https://arstechnica.com/nvidia-blackwell-ultra",
        "category": "Big Tech AI",
        "published_at": _ts(2),
        "created_at": _ts(2),
        "slug": "nvidia-blackwell-ultra-gpu",
        "is_breaking": True,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Perplexity AI Launches Enterprise Knowledge Search",
        "summary": "Perplexity AI has unveiled its enterprise search product, designed to help companies search across internal documents, emails, and databases using natural language. The product integrates with Slack, Google Workspace, Notion, and 50 other enterprise tools. Early adopters report 70% reduction in time spent searching for information. Perplexity Enterprise uses a proprietary retrieval system that combines vector search with real-time web indexing. The product is priced competitively against traditional enterprise search solutions from companies like Elastic and Coveo. CEO Aravind Srinivas stated the company aims to replace the corporate intranet search experience entirely.",
        "image_url": "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800",
        "source_name": "Wired",
        "source_url": "https://wired.com",
        "article_url": "https://wired.com/perplexity-enterprise-search",
        "category": "Product Launches",
        "published_at": _ts(2),
        "created_at": _ts(2),
        "slug": "perplexity-enterprise-search",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Midjourney V7 Redefines AI Image Generation Quality",
        "summary": "Midjourney has released Version 7 of its AI image generator, featuring photorealistic output that experts say is nearly indistinguishable from professional photography. The new model introduces precise text rendering, consistent character generation, and real-time editing capabilities. V7 processes images 5x faster than V6 while maintaining higher quality. The company also launched a standalone mobile app, moving beyond its Discord-only roots. Professional photographers and designers have praised the tool for its ability to understand complex creative briefs. Midjourney reports over 20 million active subscribers, generating an estimated $500 million in annual revenue.",
        "image_url": "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=800",
        "source_name": "The Verge",
        "source_url": "https://theverge.com",
        "article_url": "https://theverge.com/midjourney-v7",
        "category": "AI Tools",
        "published_at": _ts(2),
        "created_at": _ts(2),
        "slug": "midjourney-v7-image-generation",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Apple Announces Apple Intelligence 2.0 for All Devices",
        "summary": "Apple has revealed Apple Intelligence 2.0, a major upgrade to its on-device AI system that will power features across iPhone, iPad, Mac, and Vision Pro. The update brings a significantly more capable Siri with full conversational memory and app integration. New features include real-time language translation in FaceTime, AI-powered photo and video editing, and smart email summarization. Unlike cloud-based competitors, Apple processes most AI tasks directly on device for privacy. The update will roll out as part of iOS 19 this fall. Apple highlighted that its custom silicon gives it a unique advantage in running powerful AI models efficiently on consumer hardware.",
        "image_url": "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800",
        "source_name": "MacRumors",
        "source_url": "https://macrumors.com",
        "article_url": "https://macrumors.com/apple-intelligence-2",
        "category": "Big Tech AI",
        "published_at": _ts(3),
        "created_at": _ts(3),
        "slug": "apple-intelligence-2-all-devices",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Hugging Face Surpasses 2 Million Open Source Models",
        "summary": "Hugging Face has reached a historic milestone with over 2 million models hosted on its platform, cementing its position as the GitHub of machine learning. The platform now hosts models from every major AI lab and thousands of independent researchers. Popular categories include text generation, image classification, and audio processing. The company also launched Hugging Face Spaces Pro, allowing developers to deploy AI apps with GPU support in seconds. CEO Clem Delangue announced a partnership with the European Union to build a sovereign AI infrastructure. Hugging Face's community-driven approach continues to democratize access to cutting-edge AI technology.",
        "image_url": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800",
        "source_name": "VentureBeat",
        "source_url": "https://venturebeat.com",
        "article_url": "https://venturebeat.com/hugging-face-2m-models",
        "category": "Open Source AI",
        "published_at": _ts(3),
        "created_at": _ts(3),
        "slug": "hugging-face-2-million-models",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Runway Launches Gen-4: Real-Time AI Video Generation",
        "summary": "AI video startup Runway has released Gen-4, capable of generating photorealistic videos in real-time from text and image prompts. The new model produces 1080p video at 30fps with consistent character and scene continuity across shots. Gen-4 introduces a director mode that allows frame-by-frame control over camera angles, lighting, and character actions. Hollywood studios including Lionsgate and A24 have signed multi-year deals to integrate the technology. The product directly competes with OpenAI's Sora and Google's Veo. Industry analysts predict AI video generation will become a $15 billion market by 2028, transforming content creation across advertising, film, and social media.",
        "image_url": "https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800",
        "source_name": "The Decoder",
        "source_url": "https://the-decoder.com",
        "article_url": "https://the-decoder.com/runway-gen-4",
        "category": "AI Tools",
        "published_at": _ts(3),
        "created_at": _ts(3),
        "slug": "runway-gen4-real-time-video",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "DeepSeek V4 Challenges Western AI Labs on Key Benchmarks",
        "summary": "Chinese AI lab DeepSeek has released V4, a model that matches or exceeds GPT-5 on several key benchmarks at a fraction of the compute cost. The model was trained on a custom cluster using domestically manufactured chips, circumventing US export restrictions. DeepSeek V4 excels particularly in mathematical reasoning and code generation. The release has sparked intense debate about whether chip export controls are effectively slowing Chinese AI progress. Industry researchers noted the model's innovative training efficiency techniques. Western AI companies are studying DeepSeek's architecture for potential cost optimization insights. The development underscores the increasingly competitive global AI landscape.",
        "image_url": "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800",
        "source_name": "Ars Technica",
        "source_url": "https://arstechnica.com",
        "article_url": "https://arstechnica.com/deepseek-v4-benchmarks",
        "category": "AI Models",
        "published_at": _ts(4),
        "created_at": _ts(4),
        "slug": "deepseek-v4-challenges-western-labs",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Figma Launches AI Design Agent That Builds Full UI Layouts",
        "summary": "Figma has introduced an AI design agent that can generate complete UI layouts from text descriptions, fundamentally changing the design workflow. The agent understands design systems, accessibility guidelines, and responsive layout principles. Designers can describe a screen in natural language and receive a production-ready Figma file with proper components, spacing, and typography. The feature integrates with Figma's existing collaboration tools, allowing teams to iterate on AI-generated designs. Early beta users report 3x faster design iteration cycles. Figma CEO Dylan Field stated the tool is meant to augment designers rather than replace them, handling repetitive layout tasks while humans focus on creative direction.",
        "image_url": "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800",
        "source_name": "Product Hunt",
        "source_url": "https://producthunt.com",
        "article_url": "https://producthunt.com/figma-ai-agent",
        "category": "AI Tools",
        "published_at": _ts(4),
        "created_at": _ts(4),
        "slug": "figma-ai-design-agent",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Y Combinator Winter 2026: 70% of Startups Are AI-Native",
        "summary": "Y Combinator's Winter 2026 batch showcases a dramatic shift toward AI-native startups, with 70% of the cohort building products powered by large language models or generative AI. Notable companies include an AI-powered legal research platform, an autonomous customer support agent, and an AI video editing suite. YC partner Garry Tan noted that AI is no longer a differentiator but a baseline expectation. Total funding for the batch's demo day exceeded $1 billion in commitments. The accelerator has also launched a dedicated AI track with specialized mentorship. This batch represents the largest concentration of AI startups in YC's 20-year history.",
        "image_url": "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800",
        "source_name": "Crunchbase News",
        "source_url": "https://news.crunchbase.com",
        "article_url": "https://news.crunchbase.com/yc-winter-2026-ai",
        "category": "AI Startups",
        "published_at": _ts(4),
        "created_at": _ts(4),
        "slug": "yc-winter-2026-70-percent-ai",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Amazon Bedrock Now Supports 150+ Foundation Models",
        "summary": "AWS has expanded Amazon Bedrock to support over 150 foundation models from leading AI providers including Anthropic, Meta, Cohere, and Stability AI. The update adds new capabilities for fine-tuning, evaluation, and guardrails. Enterprise customers can now compare model performance across tasks using built-in benchmarking tools. Bedrock's new Agents feature allows companies to build autonomous AI workflows that integrate with existing AWS services. Pricing has been reduced by 40% on popular models, making enterprise AI more accessible. AWS CEO Matt Garman emphasized that the model marketplace approach gives customers flexibility without vendor lock-in.",
        "image_url": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800",
        "source_name": "ZDNet",
        "source_url": "https://zdnet.com",
        "article_url": "https://zdnet.com/amazon-bedrock-150-models",
        "category": "Product Launches",
        "published_at": _ts(5),
        "created_at": _ts(5),
        "slug": "amazon-bedrock-150-models",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "AI-Generated Code Now Represents 40% of New GitHub Commits",
        "summary": "A new study from Stanford University and GitHub reveals that approximately 40% of new code committed to GitHub repositories is now generated or significantly assisted by AI tools. The research analyzed over 500 million commits across public and private repositories. GitHub Copilot remains the leading tool, but alternatives like Cursor, Codeium, and Amazon CodeWhisperer are gaining market share rapidly. The study found that AI-assisted code has comparable bug rates to human-written code when proper review processes are in place. However, researchers noted potential risks including code homogenization and reduced understanding of underlying systems. The findings have sparked debate about the future of software engineering education.",
        "image_url": "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=800",
        "source_name": "MIT Technology Review",
        "source_url": "https://technologyreview.com",
        "article_url": "https://technologyreview.com/ai-code-40-percent-github",
        "category": "AI Research",
        "published_at": _ts(5),
        "created_at": _ts(5),
        "slug": "ai-code-40-percent-github",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Cohere Raises $1.5B to Scale Enterprise AI Platform",
        "summary": "Canadian AI company Cohere has raised $1.5 billion in its latest funding round, bringing its valuation to $22 billion. The round was led by PSP Investments with participation from NVIDIA, Salesforce Ventures, and Cisco Investments. Cohere specializes in enterprise AI solutions, offering customizable language models that can be deployed on-premises for data-sensitive industries. The company has seen particularly strong adoption in financial services, healthcare, and government sectors. CEO Aidan Gomez highlighted that enterprise customers prefer Cohere's deployment flexibility over cloud-only alternatives. The funds will be used to expand the company's model training infrastructure and open new offices in Tokyo and London.",
        "image_url": "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800",
        "source_name": "Financial Times",
        "source_url": "https://ft.com",
        "article_url": "https://ft.com/cohere-1-5b-funding",
        "category": "Funding News",
        "published_at": _ts(5),
        "created_at": _ts(5),
        "slug": "cohere-raises-1-5b-enterprise",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "xAI Releases Grok 3 with Advanced Reasoning and Real-Time Data",
        "summary": "Elon Musk's xAI has released Grok 3, featuring a new reasoning engine that shows step-by-step thinking processes similar to OpenAI's o3. The model has real-time access to X (formerly Twitter) data, giving it a unique advantage in current events understanding. Grok 3 also introduces multimodal capabilities including image understanding and generation. The model is available through xAI's API and as an upgrade for X Premium subscribers. Early benchmarks show competitive performance with GPT-5 on reasoning tasks, though it trails on coding-specific evaluations. xAI has also open-sourced the model weights for the smaller Grok 3 Mini variant, following the growing trend of open-weight releases.",
        "image_url": "https://images.unsplash.com/photo-1676299081847-824916de030a?w=800",
        "source_name": "Wired",
        "source_url": "https://wired.com",
        "article_url": "https://wired.com/xai-grok-3-reasoning",
        "category": "AI Models",
        "published_at": _ts(6),
        "created_at": _ts(6),
        "slug": "xai-grok-3-reasoning-real-time",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Microsoft Copilot Now Built Into Every Windows Application",
        "summary": "Microsoft has completed its integration of Copilot AI assistant across the entire Windows ecosystem, making it available in every built-in application from File Explorer to Paint. The update, rolling out with Windows 12, introduces contextual AI actions that understand what users are doing and offer relevant suggestions. Copilot can now automate multi-step workflows across applications, such as summarizing a document, creating a presentation from it, and emailing it to specified recipients. Enterprise customers get additional features including custom Copilot agents for internal workflows. Microsoft reports that Copilot usage has exceeded 100 million monthly active users. The integration represents the most comprehensive AI deployment in desktop computing history.",
        "image_url": "https://images.unsplash.com/photo-1633419461186-7d40a38105ec?w=800",
        "source_name": "The Verge",
        "source_url": "https://theverge.com",
        "article_url": "https://theverge.com/microsoft-copilot-windows-12",
        "category": "Big Tech AI",
        "published_at": _ts(6),
        "created_at": _ts(6),
        "slug": "microsoft-copilot-every-windows-app",
        "is_breaking": False,
        "content_excerpt": ""
    },
    {
        "id": str(uuid.uuid4()),
        "title": "ElevenLabs Launches Voice Cloning in 50 Languages",
        "summary": "AI voice startup ElevenLabs has launched a major update enabling voice cloning in 50 languages with near-perfect accent reproduction. Users can create a digital voice clone from just 30 seconds of audio that can then speak any of the supported languages naturally. The technology is being adopted by content creators, audiobook publishers, and global enterprises for localization. ElevenLabs has implemented strict consent verification to prevent misuse, requiring voice owners to explicitly approve cloning. The company reports processing over 1 billion characters of speech per day across its platform. This release positions ElevenLabs as the clear leader in AI voice technology, ahead of competitors like PlayHT and Resemble AI.",
        "image_url": "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800",
        "source_name": "Product Hunt",
        "source_url": "https://producthunt.com",
        "article_url": "https://producthunt.com/elevenlabs-50-languages",
        "category": "Product Launches",
        "published_at": _ts(6),
        "created_at": _ts(6),
        "slug": "elevenlabs-voice-cloning-50-languages",
        "is_breaking": False,
        "content_excerpt": ""
    },
]

# ─── Source Configurations ────────────────────────────────────────────────────

SOURCES_CONFIG = [
    {"name": "OpenAI Blog", "url": "https://openai.com/blog", "type": "rss", "active": True, "category_hint": "AI Models"},
    {"name": "Google AI Blog", "url": "https://ai.googleblog.com", "type": "rss", "active": True, "category_hint": "AI Research"},
    {"name": "DeepMind Blog", "url": "https://deepmind.google/blog", "type": "rss", "active": True, "category_hint": "AI Research"},
    {"name": "Anthropic Blog", "url": "https://anthropic.com/blog", "type": "rss", "active": True, "category_hint": "AI Models"},
    {"name": "Meta AI Blog", "url": "https://ai.meta.com/blog", "type": "rss", "active": True, "category_hint": "Open Source AI"},
    {"name": "Microsoft AI Blog", "url": "https://blogs.microsoft.com/ai", "type": "rss", "active": True, "category_hint": "Big Tech AI"},
    {"name": "NVIDIA AI Blog", "url": "https://blogs.nvidia.com/ai", "type": "rss", "active": True, "category_hint": "Big Tech AI"},
    {"name": "Hugging Face Blog", "url": "https://huggingface.co/blog", "type": "rss", "active": True, "category_hint": "Open Source AI"},
    {"name": "Stability AI Blog", "url": "https://stability.ai/blog", "type": "rss", "active": True, "category_hint": "AI Models"},
    {"name": "Mistral AI Blog", "url": "https://mistral.ai/news", "type": "rss", "active": True, "category_hint": "AI Models"},
    {"name": "Cohere Blog", "url": "https://cohere.com/blog", "type": "rss", "active": True, "category_hint": "AI Models"},
    {"name": "Perplexity Blog", "url": "https://perplexity.ai/blog", "type": "rss", "active": True, "category_hint": "AI Tools"},
    {"name": "Runway Blog", "url": "https://runway.com/blog", "type": "rss", "active": True, "category_hint": "AI Tools"},
    {"name": "TechCrunch AI", "url": "https://techcrunch.com/category/artificial-intelligence/feed", "type": "rss", "active": True, "category_hint": "Latest"},
    {"name": "VentureBeat AI", "url": "https://venturebeat.com/category/ai/feed", "type": "rss", "active": True, "category_hint": "Latest"},
    {"name": "MIT Technology Review AI", "url": "https://technologyreview.com/feed", "type": "rss", "active": True, "category_hint": "AI Research"},
    {"name": "The Verge AI", "url": "https://theverge.com/rss/ai-artificial-intelligence/index.xml", "type": "rss", "active": True, "category_hint": "Latest"},
    {"name": "Wired AI", "url": "https://wired.com/feed/tag/ai/latest/rss", "type": "rss", "active": True, "category_hint": "Latest"},
    {"name": "Ars Technica AI", "url": "https://feeds.arstechnica.com/arstechnica/technology-lab", "type": "rss", "active": True, "category_hint": "Latest"},
    {"name": "ZDNet AI", "url": "https://zdnet.com/topic/artificial-intelligence/rss.xml", "type": "rss", "active": True, "category_hint": "Latest"},
    {"name": "Analytics India Magazine", "url": "https://analyticsindiamag.com/feed", "type": "rss", "active": True, "category_hint": "Latest"},
    {"name": "MarkTechPost", "url": "https://marktechpost.com/feed", "type": "rss", "active": True, "category_hint": "AI Research"},
    {"name": "The Decoder", "url": "https://the-decoder.com/feed", "type": "rss", "active": True, "category_hint": "Latest"},
    {"name": "Unite.AI", "url": "https://unite.ai/feed", "type": "rss", "active": True, "category_hint": "Latest"},
    {"name": "Crunchbase News", "url": "https://news.crunchbase.com/feed", "type": "rss", "active": True, "category_hint": "Funding News"},
    {"name": "Product Hunt", "url": "https://producthunt.com/feed", "type": "rss", "active": True, "category_hint": "Product Launches"},
    {"name": "Hacker News AI", "url": "https://hnrss.org/newest?q=AI+machine+learning", "type": "rss", "active": True, "category_hint": "Latest"},
    {"name": "ArXiv AI", "url": "http://arxiv.org/rss/cs.AI", "type": "rss", "active": True, "category_hint": "AI Research"},
    {"name": "ElevenLabs Blog", "url": "https://elevenlabs.io/blog", "type": "web", "active": True, "category_hint": "AI Tools"},
    {"name": "LangChain Blog", "url": "https://blog.langchain.dev", "type": "rss", "active": True, "category_hint": "AI Tools"},
    {"name": "Vercel AI Blog", "url": "https://vercel.com/blog", "type": "web", "active": True, "category_hint": "AI Tools"},
    {"name": "AWS AI Blog", "url": "https://aws.amazon.com/blogs/machine-learning/feed", "type": "rss", "active": True, "category_hint": "Big Tech AI"},
    {"name": "Azure AI Blog", "url": "https://techcommunity.microsoft.com/t5/ai-azure-ai-services-blog/bg-p/Azure-AI-Services-blog", "type": "web", "active": True, "category_hint": "Big Tech AI"},
    {"name": "Salesforce AI Blog", "url": "https://blog.salesforceairesearch.com/feed", "type": "rss", "active": True, "category_hint": "Big Tech AI"},
    {"name": "Replicate Blog", "url": "https://replicate.com/blog", "type": "web", "active": True, "category_hint": "AI Tools"},
    {"name": "Papers With Code", "url": "https://paperswithcode.com", "type": "web", "active": True, "category_hint": "AI Research"},
    {"name": "InfoWorld AI", "url": "https://infoworld.com/category/artificial-intelligence", "type": "web", "active": True, "category_hint": "Latest"},
    {"name": "AI Business", "url": "https://aibusiness.com/feed", "type": "rss", "active": True, "category_hint": "Latest"},
    {"name": "Forbes AI", "url": "https://forbes.com/ai", "type": "web", "active": True, "category_hint": "Latest"},
    {"name": "Sifted AI", "url": "https://sifted.eu/sector/artificial-intelligence", "type": "web", "active": True, "category_hint": "AI Startups"},
    {"name": "Y Combinator Blog", "url": "https://ycombinator.com/blog", "type": "web", "active": True, "category_hint": "AI Startups"},
    {"name": "FutureTools", "url": "https://futuretools.io", "type": "web", "active": True, "category_hint": "AI Tools"},
    {"name": "There's An AI For That", "url": "https://theresanaiforthat.com", "type": "web", "active": True, "category_hint": "AI Tools"},
    {"name": "GitHub Trending AI", "url": "https://github.com/trending?since=daily", "type": "web", "active": True, "category_hint": "Open Source AI"},
    {"name": "Reddit r/MachineLearning", "url": "https://reddit.com/r/MachineLearning", "type": "web", "active": True, "category_hint": "AI Research"},
    {"name": "Reddit r/artificial", "url": "https://reddit.com/r/artificial", "type": "web", "active": True, "category_hint": "Latest"},
    {"name": "xAI Blog", "url": "https://x.ai/blog", "type": "web", "active": True, "category_hint": "AI Models"},
    {"name": "Midjourney News", "url": "https://midjourney.com", "type": "web", "active": True, "category_hint": "AI Tools"},
    {"name": "OpenRouter Blog", "url": "https://openrouter.ai/blog", "type": "web", "active": True, "category_hint": "AI Tools"},
    {"name": "LlamaIndex Blog", "url": "https://llamaindex.ai/blog", "type": "web", "active": True, "category_hint": "AI Tools"},
    {"name": "Adobe Firefly Blog", "url": "https://blog.adobe.com/en/topics/adobe-firefly", "type": "web", "active": True, "category_hint": "AI Tools"},
    {"name": "Canva AI Updates", "url": "https://canva.com/designschool", "type": "web", "active": True, "category_hint": "AI Tools"},
    {"name": "AlternativeTo AI", "url": "https://alternativeto.net/category/ai-machine-learning", "type": "web", "active": True, "category_hint": "AI Tools"},
    {"name": "Machine Learning Mastery", "url": "https://machinelearningmastery.com/feed", "type": "rss", "active": True, "category_hint": "AI Research"},
    {"name": "Business Insider AI", "url": "https://businessinsider.com/tech", "type": "web", "active": True, "category_hint": "Latest"},
    {"name": "Financial Times AI", "url": "https://ft.com/artificial-intelligence", "type": "web", "active": True, "category_hint": "Latest"},
    {"name": "TechCrunch Startups", "url": "https://techcrunch.com/category/startups/feed", "type": "rss", "active": True, "category_hint": "AI Startups"},
    {"name": "VentureBeat Startups", "url": "https://venturebeat.com/category/entrepreneur/feed", "type": "rss", "active": True, "category_hint": "AI Startups"},
    {"name": "Towards Data Science", "url": "https://towardsdatascience.com", "type": "web", "active": True, "category_hint": "AI Research"},
    {"name": "Stability AI News", "url": "https://stability.ai/news", "type": "web", "active": True, "category_hint": "AI Models"},
]

# ─── SQL Setup Script ─────────────────────────────────────────────────────────

SETUP_SQL = """
-- AIBrief24 Database Setup for Supabase
-- Run this in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    image_url TEXT DEFAULT '',
    source_name TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    article_url TEXT DEFAULT '',
    category TEXT DEFAULT 'Latest',
    published_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    slug TEXT UNIQUE,
    is_breaking BOOLEAN DEFAULT FALSE,
    notification_sent BOOLEAN DEFAULT FALSE,
    telegram_cta_enabled BOOLEAN DEFAULT TRUE,
    website_cta_enabled BOOLEAN DEFAULT TRUE,
    dedupe_hash TEXT UNIQUE,
    content_excerpt TEXT DEFAULT '',
    status TEXT DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT DEFAULT 'rss',
    active BOOLEAN DEFAULT TRUE,
    category_hint TEXT DEFAULT 'Latest',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, article_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notifications_enabled_default BOOLEAN DEFAULT TRUE,
    telegram_url TEXT DEFAULT 'https://t.me/aibrief24',
    website_url TEXT DEFAULT 'https://aibrief24.com/',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID REFERENCES articles(id),
    title TEXT,
    body TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'pending',
    provider_response TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    token TEXT UNIQUE NOT NULL,
    platform TEXT DEFAULT 'unknown',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_article_id ON bookmarks(article_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);

-- Disable RLS for API access (backend handles auth)
ALTER TABLE articles DISABLE ROW LEVEL SECURITY;
ALTER TABLE sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens DISABLE ROW LEVEL SECURITY;
"""

# ─── Helper: Check Supabase tables ───────────────────────────────────────────

def _use_supabase() -> bool:
    if not supabase_ready or not supabase_client:
        return False
    try:
        supabase_client.table("articles").select("id").limit(1).execute()
        return True
    except Exception:
        return False

_supabase_tables_ok = None

def use_supabase():
    global _supabase_tables_ok
    if _supabase_tables_ok is None:
        _supabase_tables_ok = _use_supabase()
    return _supabase_tables_ok

# ─── Auth Routes ──────────────────────────────────────────────────────────────

@api_router.post("/auth/signup")
def signup(req: SignupRequest):
    email = req.email.lower().strip()
    if email in users_db:
        raise HTTPException(400, "Email already registered")
    user_id = str(uuid.uuid4())
    users_db[email] = {
        "id": user_id,
        "email": email,
        "name": req.name or email.split("@")[0],
        "password_hash": hash_password(req.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    token = create_access_token({"sub": user_id, "email": email})
    return {"token": token, "user": {"id": user_id, "email": email, "name": users_db[email]["name"]}}


@api_router.post("/auth/login")
def login(req: LoginRequest):
    email = req.email.lower().strip()
    user = users_db.get(email)
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = create_access_token({"sub": user["id"], "email": email})
    return {"token": token, "user": {"id": user["id"], "email": email, "name": user["name"]}}


@api_router.get("/auth/me")
def get_me(request: Request):
    payload = get_current_user(request)
    email = payload.get("email", "")
    user = users_db.get(email)
    if not user:
        raise HTTPException(404, "User not found")
    return {"id": user["id"], "email": user["email"], "name": user["name"]}

# ─── Articles Routes ─────────────────────────────────────────────────────────

@api_router.get("/articles")
def get_articles(category: Optional[str] = None, limit: int = 50, offset: int = 0):
    articles = SEED_ARTICLES
    if category and category != "Latest":
        articles = [a for a in articles if a["category"] == category]
    articles = sorted(articles, key=lambda x: x["published_at"], reverse=True)
    return {"articles": articles[offset:offset + limit], "total": len(articles)}


@api_router.get("/articles/breaking")
def get_breaking():
    breaking = [a for a in SEED_ARTICLES if a.get("is_breaking")]
    return {"articles": breaking}


@api_router.get("/articles/search")
def search_articles(q: str = "", limit: int = 20):
    if not q:
        return {"articles": [], "total": 0}
    q_lower = q.lower()
    results = [
        a for a in SEED_ARTICLES
        if q_lower in a["title"].lower()
        or q_lower in a["summary"].lower()
        or q_lower in a["source_name"].lower()
        or q_lower in a["category"].lower()
    ]
    return {"articles": results[:limit], "total": len(results)}


@api_router.get("/articles/{article_id}")
def get_article(article_id: str):
    for a in SEED_ARTICLES:
        if a["id"] == article_id:
            return a
    raise HTTPException(404, "Article not found")

# ─── Categories ───────────────────────────────────────────────────────────────

@api_router.get("/categories")
def get_categories():
    counts = {}
    for a in SEED_ARTICLES:
        cat = a["category"]
        counts[cat] = counts.get(cat, 0) + 1
    return {"categories": [{"name": c, "count": counts.get(c, 0)} for c in CATEGORIES]}

# ─── Bookmarks ────────────────────────────────────────────────────────────────

@api_router.get("/bookmarks")
def get_bookmarks(request: Request):
    payload = get_current_user(request)
    user_id = payload["sub"]
    article_ids = bookmarks_db.get(user_id, [])
    articles = [a for a in SEED_ARTICLES if a["id"] in article_ids]
    return {"bookmarks": articles}


@api_router.post("/bookmarks")
def add_bookmark(req: BookmarkRequest, request: Request):
    payload = get_current_user(request)
    user_id = payload["sub"]
    if user_id not in bookmarks_db:
        bookmarks_db[user_id] = []
    if req.article_id not in bookmarks_db[user_id]:
        bookmarks_db[user_id].append(req.article_id)
    return {"success": True, "message": "Bookmarked"}


@api_router.delete("/bookmarks/{article_id}")
def remove_bookmark(article_id: str, request: Request):
    payload = get_current_user(request)
    user_id = payload["sub"]
    if user_id in bookmarks_db and article_id in bookmarks_db[user_id]:
        bookmarks_db[user_id].remove(article_id)
    return {"success": True, "message": "Removed"}


@api_router.get("/bookmarks/ids")
def get_bookmark_ids(request: Request):
    payload = get_current_user(request)
    user_id = payload["sub"]
    return {"ids": bookmarks_db.get(user_id, [])}

# ─── Push Notifications ──────────────────────────────────────────────────────

@api_router.post("/push/register")
def register_push_token(req: PushTokenRequest):
    push_tokens_db[req.token] = {"token": req.token, "platform": req.platform, "created_at": datetime.now(timezone.utc).isoformat()}
    return {"success": True}


@api_router.post("/push/send")
def send_notification(article_id: str = ""):
    article = None
    for a in SEED_ARTICLES:
        if a["id"] == article_id:
            article = a
            break
    if not article:
        raise HTTPException(404, "Article not found")

    log_entry = {
        "id": str(uuid.uuid4()),
        "article_id": article_id,
        "title": f"AIBrief24: {article['title'][:60]}",
        "body": article["summary"][:120] + "...",
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "status": "queued",
        "provider_response": "Push notification queued for delivery",
    }
    notification_logs.append(log_entry)
    logger.info(f"Push notification queued for article: {article['title'][:50]}")
    return {"success": True, "log": log_entry}

# ─── Settings ─────────────────────────────────────────────────────────────────

@api_router.get("/settings")
def get_settings():
    return APP_SETTINGS

# ─── Sources ──────────────────────────────────────────────────────────────────

@api_router.get("/sources")
def get_sources():
    return {"sources": SOURCES_CONFIG, "total": len(SOURCES_CONFIG)}

# ─── Setup ────────────────────────────────────────────────────────────────────

@api_router.get("/setup-sql")
def get_setup_sql():
    return {"sql": SETUP_SQL, "instructions": "Run this SQL in Supabase Dashboard > SQL Editor to create all required tables."}


@api_router.get("/health")
def health():
    return {"status": "ok", "supabase_configured": supabase_ready, "articles_count": len(SEED_ARTICLES), "sources_count": len(SOURCES_CONFIG)}

# ─── Root ─────────────────────────────────────────────────────────────────────

@api_router.get("/")
def root():
    return {"app": "AIBrief24", "version": "1.0.0", "tagline": "AI News in 60 Seconds"}

# ─── App Setup ────────────────────────────────────────────────────────────────

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
