const assert=require('assert');
const N=require('../lib/coin-scan/verified-news-provider.js');
const rss='<?xml version="1.0"?><rss><channel><item><title><![CDATA[Protocol upgrade announced]]></title><link>https://project.example/post</link><pubDate>Thu, 25 Sep 2026 02:00:00 GMT</pubDate></item></channel></rss>';
const rows=N.parseFeed(rss,'Project Official',Date.parse('2026-09-25T02:05:00Z'));
assert.equal(rows.length,1);assert.equal(rows[0].verification_status,'OFFICIAL_CONFIRMED');assert.equal(rows[0].source_tier,2);
const html='<a href="/en/support/announcement/detail/abc123"><span>Token migration notice</span></a>';
const b=N.parseBinanceHtml(html,1000);assert.equal(b.length,1);assert.equal(b[0].source,'Binance');assert.equal(b[0].source_tier,1);
console.log('verified news provider PASS');
