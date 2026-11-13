/**
 * Starter source registry. Admins can add/disable sources in /admin/sources without a deploy.
 * authority: 5 = first-party/canonical, 4 = top-tier press, 3 = solid trade/community, 2 = high-volume/noisy.
 */
export type SeedSource = {
  name: string;
  homepageUrl: string;
  feedUrl: string;
  type?: "rss" | "sitemap";
  pathFilter?: string;
  vendor?: string;
  defaultCategory?: string;
  authority: number;
  aiOnly?: boolean;
  maxItemsPerFetch?: number;
};

export const SEED_SOURCES: SeedSource[] = [
  // ── Vendors (first-party) ──
  { name: "Anthropic News", homepageUrl: "https://www.anthropic.com/news", feedUrl: "https://www.anthropic.com/sitemap.xml", type: "sitemap", pathFilter: "/news/", vendor: "anthropic", authority: 5, maxItemsPerFetch: 10 },
  { name: "OpenAI News", homepageUrl: "https://openai.com/news", feedUrl: "https://openai.com/news/rss.xml", vendor: "openai", authority: 5 },
  { name: "Google AI Blog", homepageUrl: "https://blog.google/technology/ai/", feedUrl: "https://blog.google/technology/ai/rss/", vendor: "google", authority: 5 },
  { name: "Google DeepMind", homepageUrl: "https://deepmind.google/discover/blog/", feedUrl: "https://deepmind.google/blog/rss.xml", vendor: "google", authority: 5 },
  { name: "Google Developers Blog", homepageUrl: "https://developers.googleblog.com", feedUrl: "https://developers.googleblog.com/feeds/posts/default", vendor: "google", authority: 4, aiOnly: false },
  { name: "Official Microsoft Blog", homepageUrl: "https://blogs.microsoft.com", feedUrl: "https://blogs.microsoft.com/feed/", vendor: "microsoft", authority: 5, aiOnly: false },
  { name: "Microsoft Source", homepageUrl: "https://news.microsoft.com/source/", feedUrl: "https://news.microsoft.com/source/feed/", vendor: "microsoft", authority: 4, aiOnly: false },
  { name: "AWS Machine Learning Blog", homepageUrl: "https://aws.amazon.com/blogs/machine-learning/", feedUrl: "https://aws.amazon.com/blogs/machine-learning/feed/", vendor: "amazon", authority: 4, maxItemsPerFetch: 15 },
  { name: "AWS News Blog", homepageUrl: "https://aws.amazon.com/blogs/aws/", feedUrl: "https://aws.amazon.com/blogs/aws/feed/", vendor: "amazon", authority: 4, aiOnly: false },
  { name: "NVIDIA Blog", homepageUrl: "https://blogs.nvidia.com", feedUrl: "https://blogs.nvidia.com/feed/", vendor: "nvidia", authority: 4, aiOnly: false },
  { name: "Hugging Face Blog", homepageUrl: "https://huggingface.co/blog", feedUrl: "https://huggingface.co/blog/feed.xml", vendor: "huggingface", defaultCategory: "open_source", authority: 4 },
  { name: "Salesforce News", homepageUrl: "https://www.salesforce.com/news/", feedUrl: "https://www.salesforce.com/news/feed/", vendor: "salesforce", authority: 4, aiOnly: false },
  { name: "Databricks Blog", homepageUrl: "https://www.databricks.com/blog", feedUrl: "https://www.databricks.com/feed", vendor: "databricks", authority: 4, aiOnly: false },
  { name: "GitHub Blog — AI & ML", homepageUrl: "https://github.blog/ai-and-ml/", feedUrl: "https://github.blog/ai-and-ml/feed/", vendor: "microsoft", authority: 4 },
  { name: "Apple Machine Learning Research", homepageUrl: "https://machinelearning.apple.com", feedUrl: "https://machinelearning.apple.com/rss.xml", vendor: "apple", defaultCategory: "research", authority: 4 },

  // ── Tech & business press ──
  { name: "TechCrunch AI", homepageUrl: "https://techcrunch.com/category/artificial-intelligence/", feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/", authority: 4 },
  { name: "The Verge AI", homepageUrl: "https://www.theverge.com/ai-artificial-intelligence", feedUrl: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", authority: 4 },
  { name: "VentureBeat AI", homepageUrl: "https://venturebeat.com/category/ai/", feedUrl: "https://venturebeat.com/category/ai/feed/", authority: 3 },
  { name: "MIT Technology Review — AI", homepageUrl: "https://www.technologyreview.com/topic/artificial-intelligence/", feedUrl: "https://www.technologyreview.com/topic/artificial-intelligence/feed", authority: 4 },
  { name: "Ars Technica — AI", homepageUrl: "https://arstechnica.com/ai/", feedUrl: "https://arstechnica.com/ai/feed/", authority: 4 },
  { name: "Wired — AI", homepageUrl: "https://www.wired.com/tag/ai/", feedUrl: "https://www.wired.com/feed/tag/ai/latest/rss", authority: 4 },
  { name: "The Register — AI/ML", homepageUrl: "https://www.theregister.com/software/ai_ml/", feedUrl: "https://www.theregister.com/software/ai_ml/headlines.atom", authority: 3 },
  { name: "ZDNET — AI", homepageUrl: "https://www.zdnet.com/topic/artificial-intelligence/", feedUrl: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml", authority: 3 },
  { name: "SiliconANGLE — AI", homepageUrl: "https://siliconangle.com/category/ai/", feedUrl: "https://siliconangle.com/category/ai/feed/", authority: 3 },
  { name: "The Decoder", homepageUrl: "https://the-decoder.com", feedUrl: "https://the-decoder.com/feed/", authority: 3 },
  { name: "Fierce Healthcare — AI", homepageUrl: "https://www.fiercehealthcare.com/ai-and-machine-learning", feedUrl: "https://www.fiercehealthcare.com/rss/xml", authority: 3, aiOnly: false },
  { name: "Finextra — AI", homepageUrl: "https://www.finextra.com", feedUrl: "https://www.finextra.com/rss/channel.aspx?channel=ai", authority: 3 },

  // ── Analysts, newsletters & practitioners ──
  { name: "Simon Willison", homepageUrl: "https://simonwillison.net", feedUrl: "https://simonwillison.net/atom/everything/", authority: 3, aiOnly: false, maxItemsPerFetch: 15 },
  { name: "Import AI", homepageUrl: "https://importai.substack.com", feedUrl: "https://importai.substack.com/feed", authority: 3 },
  { name: "Latent Space", homepageUrl: "https://www.latent.space", feedUrl: "https://www.latent.space/feed", authority: 3 },
  { name: "One Useful Thing (Ethan Mollick)", homepageUrl: "https://www.oneusefulthing.org", feedUrl: "https://www.oneusefulthing.org/feed", defaultCategory: "enterprise", authority: 3 },
  { name: "Interconnects", homepageUrl: "https://www.interconnects.ai", feedUrl: "https://www.interconnects.ai/feed", defaultCategory: "research", authority: 3 },
  { name: "SemiAnalysis", homepageUrl: "https://semianalysis.com", feedUrl: "https://semianalysis.com/feed/", defaultCategory: "infrastructure", authority: 3 },

  // ── Research ──
  { name: "arXiv cs.AI", homepageUrl: "https://arxiv.org/list/cs.AI/recent", feedUrl: "https://rss.arxiv.org/rss/cs.AI", defaultCategory: "research", authority: 2, maxItemsPerFetch: 10 },
  { name: "arXiv cs.CL", homepageUrl: "https://arxiv.org/list/cs.CL/recent", feedUrl: "https://rss.arxiv.org/rss/cs.CL", defaultCategory: "research", authority: 2, maxItemsPerFetch: 10 },
  { name: "BAIR Blog", homepageUrl: "https://bair.berkeley.edu/blog/", feedUrl: "https://bair.berkeley.edu/blog/feed.xml", defaultCategory: "research", authority: 3 },

  // ── Community ──
  { name: "Hacker News (AI, 100+ points)", homepageUrl: "https://news.ycombinator.com", feedUrl: "https://hnrss.org/newest?q=AI+OR+LLM+OR+OpenAI+OR+Anthropic+OR+Claude+OR+GPT&points=100", authority: 2, aiOnly: false },
  { name: "r/MachineLearning", homepageUrl: "https://www.reddit.com/r/MachineLearning/", feedUrl: "https://www.reddit.com/r/MachineLearning/top/.rss?t=day", authority: 2, maxItemsPerFetch: 10 },
  { name: "r/LocalLLaMA", homepageUrl: "https://www.reddit.com/r/LocalLLaMA/", feedUrl: "https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day", defaultCategory: "open_source", authority: 2, maxItemsPerFetch: 10 },

  // ── Open source releases ──
  { name: "Ollama releases", homepageUrl: "https://github.com/ollama/ollama", feedUrl: "https://github.com/ollama/ollama/releases.atom", defaultCategory: "open_source", authority: 2, maxItemsPerFetch: 3 },
  { name: "vLLM releases", homepageUrl: "https://github.com/vllm-project/vllm", feedUrl: "https://github.com/vllm-project/vllm/releases.atom", defaultCategory: "open_source", authority: 2, maxItemsPerFetch: 3 },
  { name: "Model Context Protocol releases", homepageUrl: "https://github.com/modelcontextprotocol/modelcontextprotocol", feedUrl: "https://github.com/modelcontextprotocol/modelcontextprotocol/releases.atom", defaultCategory: "agents", authority: 3, maxItemsPerFetch: 3 },

  // ── Policy & regulation ──
  { name: "NIST News", homepageUrl: "https://www.nist.gov/news-events/news", feedUrl: "https://www.nist.gov/news-events/news/rss.xml", defaultCategory: "regulation", authority: 4, aiOnly: false },
  { name: "FTC Press Releases", homepageUrl: "https://www.ftc.gov/news-events/news/press-releases", feedUrl: "https://www.ftc.gov/feeds/press-release.xml", defaultCategory: "regulation", authority: 4, aiOnly: false },
  { name: "European Commission — Digital Strategy", homepageUrl: "https://digital-strategy.ec.europa.eu/en/news", feedUrl: "https://digital-strategy.ec.europa.eu/en/rss.xml", defaultCategory: "regulation", authority: 4, aiOnly: false },
];
