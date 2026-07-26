import path from 'node:path';
import { renderCard } from '../src/card.js';
import { normalizeImageUrl } from '../src/extract.js';
import { config } from '../src/config.js';

const paOg = 'https://media.prothomalo.com/prothomalo-bangla%2F2020-09%2F37a8da53-d280-4462-94c4-e3626386b4e1%2Fcourt_01.png?rect=0%2C114%2C1600%2C840&w=1200&ar=40%3A21&auto=format%2Ccompress&ogImage=true&mode=crop&overlay=https%3A%2F%2Fmedia.prothomalo.com%2Fprothomalo-bangla%2F2024-08-31%2F1m4oa2xi%2FBanner_7814X143.jpg&overlay_position=bottom&overlay_width_pct=1';
console.log('আগে :', paOg.length, 'অক্ষর, overlay আছে?', /overlay=/.test(paOg));
const clean = normalizeImageUrl(paOg);
console.log('পরে :', clean.length, 'অক্ষর, overlay আছে?', /overlay=/.test(clean));

const r = await renderCard({
  headline: 'গঙ্গাচড়ায় আগুনে ৪টি গরুসহ বসতঘর ভস্মীভূত, সর্বস্বান্ত দিনমজুর',
  category: 'জাতীয়', source: 'প্রথম আলো',
  imageUrl: clean,
  slug: 'test-watermark',
  outFile: path.join(config.paths.cards, 'test-watermark.png'),
});
console.log('কার্ড     :', r.style, r.file);
console.log('মূল ছবি   :', r.imageWebPath);
