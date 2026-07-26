/**
 * প্রতিটি সোর্সের জন্য: ফিড পড়া যাচ্ছে? আর্টিকেল টেক্সট বেরোচ্ছে? ছবি পাওয়া যাচ্ছে?
 * সোর্স সাইট লেআউট বদলালে এখানেই প্রথম ধরা পড়বে।
 *
 *   node test/check-sources.mjs
 */
import { fetchFeed, SOURCES } from '../src/sources.js';
import { safeExtract } from '../src/extract.js';

let failures = 0;

for (const s of SOURCES) {
  let items = [];
  try {
    items = await fetchFeed(s);
  } catch (err) {
    console.log(`✗ ${s.name}: ফিড ব্যর্থ — ${err.message}`);
    failures++;
    continue;
  }

  if (!items.length) {
    console.log(`✗ ${s.name}: ফিড খালি`);
    failures++;
    continue;
  }

  const it = items[0];
  const a = await safeExtract(it.link);
  const mark = a.ok ? '✓' : '✗';
  if (!a.ok) failures++;

  console.log(`${mark} ${s.name}`);
  console.log(`    ফিড     : ${items.length} আইটেম`);
  console.log(`    শিরোনাম : ${it.title.slice(0, 60)}`);
  console.log(`    টেক্সট  : ${a.paragraphCount} অনুচ্ছেদ, ${a.body.length} অক্ষর`);
  console.log(`    ছবি     : ${a.image ? a.image.slice(0, 70) : '(নেই — টেক্সট কার্ড হবে)'}`);
}

console.log(failures ? `\n${failures} টি সোর্সে সমস্যা।` : '\nসব সোর্স ঠিক আছে।');
process.exit(failures ? 1 : 0);
