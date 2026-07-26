/**
 * একটা ইংরেজি ও একটা বাংলা আর্টিকেল নিয়ে রিরাইট যাচাই।
 *   node test/check-rewrite.mjs
 */
import { fetchFeed, SOURCES } from '../src/sources.js';
import { safeExtract, isUnsuitableUrl } from '../src/extract.js';
import { rewriteArticle } from '../src/rewrite.js';

for (const id of ['bbcworld', 'prothomalo']) {
  const s = SOURCES.find((x) => x.id === id);
  const items = (await fetchFeed(s)).filter((i) => !isUnsuitableUrl(i.link));
  const it = items[0];
  const a = await safeExtract(it.link);

  console.log(`\n=== ${s.name} (${s.lang}) ===`);
  console.log(`মূল    : ${it.title}`);

  const t0 = Date.now();
  const r = await rewriteArticle({ ...it, body: a.body });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`মডেল   : ${r.model}  (${secs}s)`);
  console.log(`শিরোনাম: ${r.headline}`);
  console.log(`ক্যাটাগরি: ${r.category}   মতামত: ${r.isOpinion}`);
  console.log(`ট্যাগ  : ${r.tags.join(', ')}`);
  console.log(`সারমর্ম: ${r.summary}`);
  console.log(`\n${r.body}\n`);
}
