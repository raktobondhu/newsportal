/**
 * অ্যাডমিন সেটিংসের সোর্স তালিকা আর পাইপলাইনের তালিকা এক কিনা দেখে।
 *
 *   node test/check-settings-sources.mjs
 *
 * কেন দরকার: সাইটের বিল্ড pipeline/src/sources.js ইমপোর্ট করতে পারে না
 * (fast-xml-parser কেবল pipeline-এর node_modules-এ), তাই নামগুলো
 * web/app/admin/settings/page.js এ আলাদা করে লেখা।
 *
 * এই দ্বৈততাই একবার সমস্যা করেছিল — পাইপলাইনে সোর্স ৫ থেকে ১৬ হলো,
 * প্যানেলের তালিকা ৫-এই থেকে গেল, আর ১১টি সোর্স বন্ধ করার কোনো উপায়
 * রইল না। বিল্ড সফল দেখাত, তাই ধরাও পড়েনি।
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from '../src/sources.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const panelFile = path.join(here, '..', '..', 'web', 'app', 'admin', 'settings', 'page.js');

const text = fs.readFileSync(panelFile, 'utf8');
const block = text.match(/const SOURCES = \[([\s\S]*?)\n\];/);
if (!block) {
  console.error('সেটিংস পাতায় SOURCES তালিকাটি খুঁজে পাওয়া গেল না — নাম বদলেছে?');
  process.exit(1);
}

const panelIds = [...block[1].matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
const pipelineIds = SOURCES.map((s) => s.id);

const missing = pipelineIds.filter((id) => !panelIds.includes(id));
const extra = panelIds.filter((id) => !pipelineIds.includes(id));

console.log(`পাইপলাইনে ${pipelineIds.length}টি, প্যানেলে ${panelIds.length}টি`);

if (missing.length) console.error(`\n✗ প্যানেলে নেই: ${missing.join(', ')}`);
if (extra.length) console.error(`\n✗ প্যানেলে বাড়তি: ${extra.join(', ')}`);

if (missing.length || extra.length) {
  console.error('\nweb/app/admin/settings/page.js এর SOURCES তালিকা ঠিক করুন।');
  process.exit(1);
}

// নামও মিলিয়ে দেখি — আইডি এক অথচ নাম আলাদা হলে প্যানেলে ভুল নাম দেখাত
const nameMismatch = SOURCES.filter((s) => {
  const m = block[1].match(new RegExp(`id:\\s*'${s.id}',\\s*name:\\s*'([^']+)'`));
  return m && m[1] !== s.name;
});
if (nameMismatch.length) {
  console.error(`\n✗ নাম মেলেনি: ${nameMismatch.map((s) => s.id).join(', ')}`);
  process.exit(1);
}

console.log('\nদুই তালিকা এক আছে।');
