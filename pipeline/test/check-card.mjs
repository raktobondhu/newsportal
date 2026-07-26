import fsmod from 'node:fs';
import path from 'node:path';
import { renderCard, findBrowser } from '../src/card.js';
import { config } from '../src/config.js';
console.log('ব্রাউজার:', findBrowser());
const out = path.join(config.paths.cards, 'test');
const a = await renderCard({
  headline: "ফ্রান্স ও স্পেনে দাবানল: আড়াই লক্ষাধিক মানুষের এলাকা ত্যাগ",
  category: 'আন্তর্জাতিক', source: 'বিবিসি',
  imageUrl: 'https://ichef.bbci.co.uk/ace/ws/1024/cpsprodpb/8783/live/30d9e7b0-880f-11f1-afbe-b9a38c21b1d6.jpg',
  outFile: path.join(out, 'photo.png'),
});
console.log('photo :', a.style, fsSize(a.file));
const b = await renderCard({
  headline: "মাদকে জড়িত থাকার অভিযোগে লালমনিরহাটে সামাজিক সংগঠনের ৪ সদস্য কারাগারে",
  category: 'অপরাধ', source: 'প্রথম আলো',
  outFile: path.join(out, 'text.png'),
});
console.log('text  :', b.style, fsSize(b.file));
function fsSize(f){ return Math.round(fsmod.statSync(f).size/1024)+'KB'; }
