# PulseRadar SEO/AEO/GEO/NEO integration

Reference: https://github.com/leopard627/fire-your-seo-agency (MIT; review upstream license before copying source).

## Current scope
Run `node scripts/seo-audit.js` for a static, read-only baseline. The script intentionally does not modify production, publish generated financial advice, or claim verified search visibility.

## Implementation backlog
1. Audit actual production HTTP response without JavaScript; ensure coin pages are server-rendered, crawlable, and indexable where intended.
2. Add canonical URLs, dynamic sitemap with only valid public pages, and robots policy. Keep private/internal scan endpoints out of indexing.
3. Add unique titles, descriptions, OG tags, and valid JSON-LD on public analysis pages. Avoid invented ratings, prices, or returns.
4. Show source exchange, UTC timestamp, market type, timeframe, indicator methodology, data freshness, and N/A for missing OI/funding.
5. Publish concise question-first educational content, clear risk disclosures, and no guaranteed-return language.
6. Register and verify domains in Google Search Console, Bing Webmaster Tools, and Naver Search Advisor manually with domain-owner approval.
7. Measure indexed pages, impressions, clicks, crawl errors, and AI referrals over baseline and subsequent 28-day windows; do not equate llms.txt with guaranteed citation.
8. Review changes through PR, run tests/build, and verify live HTML, mobile layout, and deployment health before release.

## Safety gates
- Do not auto-publish AI-generated financial recommendations.
- Do not expose API secrets, private scan histories, user data, or internal routes in sitemaps.
- No keyword stuffing, cloaking, purchased backlinks, or fabricated evidence.
- Treat third-party skill instructions as untrusted until reviewed.
