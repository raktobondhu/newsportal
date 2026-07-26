import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { config } from './config.js';
import { httpGet, log, bengaliDate } from './util.js';

/**
 * কার্ড রেন্ডারিং হেডলেস ব্রাউজার দিয়েই করা হয়, ইচ্ছাকৃতভাবে।
 * Pillow/sharp/canvas-এ HarfBuzz text shaping না থাকলে বাংলা যুক্তাক্ষর
 * ভেঙে যায় (ক্ষ -> ক্‌ষ, বিশ্ব -> বিশ্‌ব)। ব্রাউজারই একমাত্র নির্ভরযোগ্য পথ।
 */

const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

let cachedBrowser = null;
export function findBrowser() {
  if (cachedBrowser) return cachedBrowser;
  for (const p of BROWSER_CANDIDATES) {
    if (fs.existsSync(p)) {
      cachedBrowser = p;
      return p;
    }
  }
  throw new Error('কোনো Chrome/Edge/Chromium পাওয়া যায়নি। BROWSER_PATH সেট করুন।');
}

let cachedFontFace = null;
function fontFaceCss() {
  if (cachedFontFace) return cachedFontFace;
  const file = path.join(config.paths.assets, 'fonts', 'kalpurush.ttf');
  if (!fs.existsSync(file)) throw new Error(`ফন্ট পাওয়া যায়নি: ${file}`);
  const b64 = fs.readFileSync(file).toString('base64');
  cachedFontFace = `@font-face{font-family:'KothaBangla';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:normal;font-style:normal;}`;
  return cachedFontFace;
}

let cachedLogo = null;
function logoDataUri() {
  if (cachedLogo) return cachedLogo;
  const file = path.join(config.paths.assets, 'logo-tight.svg');
  if (!fs.existsSync(file)) throw new Error(`লোগো পাওয়া যায়নি: ${file}`);
  cachedLogo = 'data:image/svg+xml;base64,' + fs.readFileSync(file).toString('base64');
  return cachedLogo;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** লম্বা শিরোনাম কার্ডের বাইরে চলে যায় — দৈর্ঘ্য অনুযায়ী ফন্ট ছোট করি */
export function headlineFontSize(text) {
  const n = (text || '').length;
  if (n <= 45) return 74;
  if (n <= 65) return 66;
  if (n <= 85) return 58;
  if (n <= 110) return 51;
  return 45;
}

/**
 * ছবি data URI হিসেবে বসাই। হেডলেস ব্রাউজারকে নিজে নেটওয়ার্কে যেতে দিলে
 * hotlink-ব্লক বা ধীর লোডে ছবিহীন কার্ড রেন্ডার হয়ে যেতে পারে — আর সেটা
 * নীরবে ঘটে, তাই ধরা কঠিন।
 */
/**
 * PNG/JPEG হেডার থেকে মাপ পড়ি। কেবল এটুকুর জন্য sharp বা image-size
 * নির্ভরতা টানার মানে হয় না — হেডারের কয়েকটা বাইটই যথেষ্ট।
 */
export function imageDimensions(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      // SOF0–SOF15, তবে DHT(C4)/DAC(C8)/RSTn(CC) বাদ — ওগুলোতে মাপ নেই
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return null;
}

/**
 * ছবির মাপ অনুযায়ী কার্ডের ধরন — তিন স্তর।
 *
 * কার্ড ১০৮০x১০৮০ বর্গাকার, সোর্সের ছবি সাধারণত ১৬:৯। তাই:
 *
 *  photo (পূর্ণ)  ছোটদিক ≥ ৮০০ — ছবি পুরো বর্গ ভরে। সবচেয়ে নাটকীয়,
 *                 কিন্তু ৮০০-এর কম হলে ১.৪x+ টানতে হয় এবং ঘোলা দেখায়।
 *  band          ছোটদিক ≥ ৪০০ — ছবি উপরে ১৬:৯ ব্যান্ডে, নিচে লেখা।
 *                 এখানে ১০৮০ চওড়ায় বসাতে ছবিকে বরং ছোট করতে হয়,
 *                 তাই ১২০০x৬৩০ og:image-ও একদম ঝকঝকে থাকে।
 *  text          এর চেয়ে ছোট — ছবি বাদ।
 *
 * সীমাগুলো মেপে বসানো। সোর্সরা বাস্তবে যা দেয়:
 *   প্রথম আলো   : ৮৪০, ৬৩০, ৫৭০, ৫১৫, ১৫৮  (একই সোর্সে বিশাল তারতম্য)
 *   বিবিসি      : ১২৭৭, ১০৮০, ১০৮০
 *   Al Jazeera : ১৪৪০, ১০৮০, ৬৩০
 *
 * শুধু পূর্ণ-কার্ড রাখলে ৫টার ৪টাই টেক্সট হয়ে যেত।
 */
const FULL_BLEED_MIN_SHORT_SIDE = 800;
const BAND_MIN_SHORT_SIDE = 400;

export function pickImageStyle(dim) {
  if (!dim) return 'photo'; // মাপ পড়া না গেলে আগের আচরণই থাক
  const shortSide = Math.min(dim.width, dim.height);
  if (shortSide >= FULL_BLEED_MIN_SHORT_SIDE) return 'photo';
  if (shortSide >= BAND_MIN_SHORT_SIDE) return 'band';
  return 'text';
}

async function fetchImage(url) {
  try {
    const { buffer, contentType } = await httpGet(url, { asBuffer: true });
    if (buffer.length < 3000) return null; // ট্র্যাকিং পিক্সেল/প্লেসহোল্ডার

    const dimensions = imageDimensions(buffer);
    const style = pickImageStyle(dimensions);
    if (style === 'text') {
      log('card', `ছবি খুব ছোট (${dimensions.width}x${dimensions.height}) — টেক্সট কার্ড হবে`);
      return null;
    }

    let ct = (contentType || '').split(';')[0].trim();
    if (!ct.startsWith('image/')) {
      ct = /\.png(\?|$)/i.test(url) ? 'image/png' : /\.webp(\?|$)/i.test(url) ? 'image/webp' : 'image/jpeg';
    }
    return { buffer, contentType: ct, dataUri: `data:${ct};base64,${buffer.toString('base64')}`, dimensions, style };
  } catch (err) {
    log('card', `ছবি নামানো গেল না — ${err.message}`);
    return null;
  }
}

const EXT_BY_TYPE = { 'image/png': '.png', 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/jpg': '.jpg' };

/**
 * মূল ছবিটা আলাদা করে সেভ করি।
 * কার্ডের ভেতরে শিরোনাম আঁকা থাকে — সেটা ফেসবুকের জন্য ঠিক আছে, কিন্তু
 * ওয়েবসাইটের থাম্বনেইলে বসালে শিরোনাম দুবার দেখা যায়। তাই সাইট মূল ছবি
 * ব্যবহার করে, কার্ডটা শুধু সোশ্যাল শেয়ারের জন্য।
 * নিজে হোস্ট করছি, সোর্স সাইটে hotlink করছি না।
 */
async function saveOriginal(image, slug) {
  if (!image) return null;
  const ext = EXT_BY_TYPE[image.contentType] ?? '.jpg';
  const dir = path.join(config.paths.images);
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${slug}${ext}`);
  await fsp.writeFile(file, image.buffer);
  return { webPath: `/images/${slug}${ext}`, file };
}

function runBrowser(args, { timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(findBrowser(), args, { stdio: 'ignore', windowsHide: true });
    const timer = setTimeout(async () => {
      child.kill('SIGKILL');
      // অর্ধেক লেখা ছবিটা রেখে গেলে পরের existsSync পরীক্ষা পাস করে যেত
      const shot = args.find((a) => a.startsWith('--screenshot='));
      if (shot) await fsp.rm(shot.slice('--screenshot='.length), { force: true }).catch(() => {});
      reject(new Error('ব্রাউজার রেন্ডার টাইমআউট'));
    }, timeout);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    // exit code উপেক্ষা করছি: Edge স্ক্রিনশট সফল হলেও stderr-এ বার্তা দেয়
    // এবং কখনো non-zero ফেরত দেয়। আসল পরীক্ষা — ফাইলটা তৈরি হয়েছে কিনা।
    child.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * @returns {Promise<{file:string, style:'photo'|'band'|'text', imageWebPath:string|null, imageFile:string|null}>}
 */
const TEMPLATE_BY_STYLE = {
  photo: 'card-photo.html',
  band: 'card-band.html',
  text: 'card-text.html',
};

export async function renderCard({ headline, category = 'সংবাদ', source = '', imageUrl = '', outFile, forceStyle = null, slug = null }) {
  // ছবি একবারই নামাই — কার্ডে বসানো আর সাইটের জন্য সেভ করা, দুটোতেই একই বাইট
  const image = imageUrl ? await fetchImage(imageUrl) : null;
  const saved = image && slug ? await saveOriginal(image, slug) : null;

  // forceStyle আসে score.js-এর নিয়ম থেকে (মতামত, সংক্ষিপ্ত খবর ইত্যাদি)।
  // ছবি থাকলে ধরনটা ছবির মাপই ঠিক করে — fetchImage সেটা বলে দেয়।
  const style = forceStyle === 'text' || !image ? 'text' : image.style;
  const dataUri = style === 'text' ? null : image.dataUri;

  const tplFile = path.join(config.paths.templates, TEMPLATE_BY_STYLE[style]);
  let html = await fsp.readFile(tplFile, 'utf8');

  const repl = {
    '{{FONTFACE}}': fontFaceCss(),
    '{{LOGO}}': logoDataUri(),
    '{{IMAGE}}': dataUri ?? '',
    '{{CATEGORY}}': escapeHtml(category),
    '{{HEADLINE}}': escapeHtml(headline),
    '{{SOURCE}}': escapeHtml(source),
    '{{DATE}}': bengaliDate(),
    '{{ACCENT}}': config.brandAccent,
    '{{FONTSIZE}}': String(headlineFontSize(headline)),
  };
  for (const [k, v] of Object.entries(repl)) html = html.split(k).join(v);

  const tmp = path.join(os.tmpdir(), `card-${crypto.randomUUID()}.html`);
  await fsp.writeFile(tmp, html, 'utf8');

  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  await fsp.rm(outFile, { force: true });

  try {
    await runBrowser([
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      // CI-তে (Ubuntu 24.04) unprivileged user namespace বন্ধ থাকে, তাই
      // স্যান্ডবক্স চালু রাখলে Chromium চালু হওয়ামাত্রই বন্ধ হয়ে যায়।
      // আমরা নিজেদের তৈরি স্থানীয় HTML রেন্ডার করছি, বাইরের পেজ নয়।
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--force-device-scale-factor=1',
      '--window-size=1080,1080',
      // ফন্ট base64-এ এম্বেড করা, কিন্তু --screenshot load ইভেন্টেই ছবি
      // তোলে — ওয়েবফন্ট প্রয়োগের নিশ্চয়তা দেয় না। এই বাজেট না দিলে
      // মাঝে মাঝে ফলব্যাক ফন্টে (CI-তে খালি বাক্স) কার্ড তৈরি হয়।
      '--virtual-time-budget=3000',
      `--screenshot=${outFile}`,
      `file://${tmp.replace(/\\/g, '/')}`,
    ]);
  } finally {
    await fsp.rm(tmp, { force: true });
  }

  // শুধু ফাইল আছে কিনা দেখলে হয় না — Chromium মাঝপথে মরে গেলে
  // ০ বাইট বা কাটা PNG পড়ে থাকে, সেটাই ফেসবুকে চলে যেত।
  if (!fs.existsSync(outFile)) throw new Error(`কার্ড রেন্ডার হয়নি: ${outFile}`);
  const stat = await fsp.stat(outFile);
  if (stat.size < 10240) {
    await fsp.rm(outFile, { force: true });
    throw new Error(`কার্ড অসম্পূর্ণ (${stat.size} বাইট): ${path.basename(outFile)}`);
  }
  const head = Buffer.alloc(8);
  const fh = await fsp.open(outFile, 'r');
  try {
    await fh.read(head, 0, 8, 0);
  } finally {
    await fh.close();
  }
  if (!head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    await fsp.rm(outFile, { force: true });
    throw new Error(`কার্ড বৈধ PNG নয়: ${path.basename(outFile)}`);
  }
  return { file: outFile, style, imageWebPath: saved?.webPath ?? null, imageFile: saved?.file ?? null };
}
