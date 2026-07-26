/** সাইটের শিরোনাম বনাম ফেসবুকের শিরোনাম — পাশাপাশি দেখা। */
import { fetchFeed, SOURCES } from '../src/sources.js';
import { safeExtract, isUnsuitableUrl } from '../src/extract.js';
import { rewriteArticle } from '../src/rewrite.js';

for (const id of ['prothomalo', 'bbcworld']) {
  const s = SOURCES.find((x) => x.id === id);
  const items = (await fetchFeed(s)).filter((i) => !isUnsuitableUrl(i.link)).slice(0, 2);
  for (const it of items) {
    const a = await safeExtract(it.link);
    if (!a.ok) continue;
    const r = await rewriteArticle({ ...it, body: a.body });
    console.log('─'.repeat(70));
    console.log('সাইট     :', r.headline);
    console.log('ফেসবুক   :', r.socialHeadline, `(${r.socialHeadline.length} অক্ষর)`);
    console.log('আলাদা?   :', r.headline !== r.socialHeadline ? 'হ্যাঁ' : 'না — fallback হয়েছে');
  }
}
console.log('─'.repeat(70));
