/** কোন প্রোভাইডার/মডেল এখন সাড়া দিচ্ছে এবং বাংলা কেমন — এক নজরে। */
import { fetchFeed, SOURCES } from '../src/sources.js';
import { safeExtract, isUnsuitableUrl } from '../src/extract.js';
import { rewriteArticle } from '../src/rewrite.js';

const s = SOURCES.find((x) => x.id === 'bbcworld');
const it = (await fetchFeed(s)).filter((i) => !isUnsuitableUrl(i.link))[0];
const a = await safeExtract(it.link);
console.log('মূল :', it.title, '\n');

const t0 = Date.now();
const r = await rewriteArticle({ ...it, body: a.body });
console.log(`প্রোভাইডার : ${r.provider}/${r.model}  (${((Date.now()-t0)/1000).toFixed(1)}s)`);
console.log('শিরোনাম    :', r.headline);
console.log('ক্যাটাগরি  :', r.category, '| মতামত:', r.isOpinion);
console.log('ট্যাগ      :', r.tags.join(', '));
console.log('\n' + r.body.split('\n\n')[0]);
