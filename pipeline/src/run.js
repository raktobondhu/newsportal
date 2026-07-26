import path from 'node:path';
import { config } from './config.js';
import { log, sleep, tokenOverlap } from './util.js';
import { fetchAllFeeds, SOURCES } from './sources.js';
import { safeExtract, isUnsuitableUrl } from './extract.js';
import { rewriteArticle } from './rewrite.js';
import { dedupe, rankItems, decideCardStyle, summarizeRanking, selectBalanced, DEDUPE_THRESHOLD } from './score.js';
import { renderCard } from './card.js';
import { buildCaption, postPhoto, postComment, describeFacebookError, isFatalFacebookError } from './facebook.js';
import { fetchSettings } from './supabase.js';
import { loadState, saveState, saveArticle, buildSlug, articleExists, writeIndex, markSeen, markHeadline, markArticlePosted, pruneOldState } from './store.js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || args.has('--dry');
const SKIP_FACEBOOK = DRY_RUN || args.has('--no-facebook');

/**
 * সংখ্যা যাচাই না করলে `--max=পাঁচ` → NaN → slice(0, NaN) → শূন্য আর্টিকেল,
 * অথচ কোনো এরর নেই আর exit code 0 — CI-তে সবুজ দেখাত কিন্তু কিছুই হতো না।
 */
function limitArg(name, fallback) {
  const hit = [...args].find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const value = Number(hit.split('=')[1]);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--${name} এর মান সংখ্যা হতে হবে, পাওয়া গেছে: ${hit.split('=')[1]}`);
  }
  return Math.floor(value);
}

const MAX_ARTICLES = limitArg('max', config.limits.maxArticlesPerRun);
const MAX_POSTS = limitArg('posts', config.limits.maxFacebookPosts);

async function main() {
  const startedAt = Date.now();
  log('start', DRY_RUN ? 'DRY RUN — কিছুই প্রকাশ হবে না' : 'লাইভ রান');

  // SITE_URL ছাড়া কমেন্টে লিংক যায় না, অর্থাৎ ফেসবুক থেকে সাইটে কেউ
  // আসে না — পুরো ব্যবস্থার উদ্দেশ্যই ব্যর্থ। আগে এটা কেবল warn ছিল,
  // ফলে CI সবুজ দেখাত আর দিনের পর দিন লিংকহীন পোস্ট যেতে থাকত।
  // dry-run এ থামাই না, কারণ তখন কিছুই প্রকাশ হচ্ছে না।
  if (!config.siteUrl) {
    if (!SKIP_FACEBOOK) {
      throw new Error(
        'SITE_URL সেট নেই। লিংক ছাড়া ফেসবুকে পোস্ট করার মানে হয় না — ' +
          'GitHub → Settings → Variables এ SITE_URL বসান, অথবা --no-facebook দিয়ে চালান।'
      );
    }
    log('warn', 'SITE_URL সেট নেই — কমেন্টে লিংক যাবে না (dry-run, তাই থামছি না)');
  }

  /**
   * অ্যাডমিন প্যানেলের সেটিংস আগে পড়ি। থামানোর সুইচ এখানেই —
   * GitHub-এ workflow disable করার চেয়ে এটা অনেক দ্রুত, আর যিনি
   * কোড চেনেন না তিনিও পারবেন।
   */
  const settings = await fetchSettings();

  if (settings.automation_enabled === false) {
    log('done', 'অ্যাডমিন প্যানেল থেকে অটোমেশন বন্ধ করা আছে — কিছু করা হলো না।');
    return;
  }

  const facebookDisabledBySetting = settings.facebook_enabled === false;
  if (facebookDisabledBySetting && !SKIP_FACEBOOK) {
    log('facebook', 'প্যানেল থেকে ফেসবুক প্রকাশ বন্ধ — খবর কেবল সাইটে যাবে');
  }

  const maxArticles = Number(settings.max_articles_per_run ?? MAX_ARTICLES) || MAX_ARTICLES;
  const maxPosts = facebookDisabledBySetting ? 0 : Number(settings.max_posts_per_run ?? MAX_POSTS) || MAX_POSTS;

  const state = await loadState();
  log('state', `আগে দেখা হয়েছে ${state.seen.size} টি লিংক`);

  // ১. সংগ্রহ — প্যানেল থেকে বন্ধ করা সোর্স বাদ দিয়ে
  const disabledSources = Array.isArray(settings.disabled_sources) ? settings.disabled_sources : [];
  const activeSources = SOURCES.filter((s) => !disabledSources.includes(s.id));
  if (disabledSources.length) {
    log('rss', `প্যানেল থেকে বন্ধ: ${disabledSources.join(', ')}`);
  }
  const raw = await fetchAllFeeds(activeSources);

  // ২. ছাঁটাই — ভিডিও/গ্যালারি পেজ আর আগে প্রকাশিত খবর বাদ
  const fresh = raw.filter((i) => !isUnsuitableUrl(i.link) && !state.seen.has(i.link));
  log('filter', `${raw.length} → ${fresh.length} (ভিডিও ও পুরোনো বাদ)`);
  if (!fresh.length) {
    log('done', 'নতুন কিছু নেই।');
    return;
  }

  // ৩. একই খবরের একাধিক সংস্করণ এক করা, তারপর গুরুত্ব অনুযায়ী সাজানো
  const unique = dedupe(fresh);
  log('dedupe', `${fresh.length} → ${unique.length} টি আলাদা খবর`);

  const ranked = rankItems(unique);

  // কেবল স্কোরে বাছলে ভারসাম্য থাকে না — কোটা দিয়ে দেশ/বিদেশ/বিষয়
  // তিন ভাগেই খবর নিশ্চিত করা হয়
  const { picked: selected, taken } = selectBalanced(ranked, maxArticles);
  log('rank', `বাছাই — দেশ ${taken['দেশ']}, বিদেশ ${taken['বিদেশ']}, বিষয় ${taken['বিষয়']}`);
  summarizeRanking(selected, Math.min(10, selected.length));

  // ৪. প্রতিটি খবর প্রক্রিয়াকরণ
  const produced = [];
  for (const [i, item] of selected.entries()) {
    const label = `[${i + 1}/${selected.length}]`;
    try {
      const extracted = await safeExtract(item.link);
      if (!extracted.ok) {
        // seen-এ যোগ করা জরুরি: নাহলে প্রতি রানে এই একই লিংকগুলোই
        // শীর্ষে থেকে আবার চেষ্টা হতো, নতুন খবর কখনো প্রকাশই পেত না
        // (--max=5 এ শীর্ষ ৫টিই তো সব)।
        markSeen(state, item.link);
        log('skip', `${label} লেখা পাওয়া যায়নি — ${item.title.slice(0, 45)}`);
        continue;
      }

      const rewritten = await rewriteArticle({ ...item, body: extracted.body });

      // ভাষা-পারাপার ডিডুপ।
      // rank করার আগের ডিডুপ শুধু একই ভাষার সোর্সে কাজ করে — বাংলা ও ইংরেজি
      // শিরোনামে কোনো শব্দই মেলে না, তাই BBC World ও প্রথম আলোর একই খবর
      // দুটো আলাদা আইটেম হিসেবে থেকে যায়। রিরাইটের পরে সব শিরোনামই বাংলা,
      // তখন মেলানো সম্ভব। খরচ: ডুপ্লিকেটের জন্য একটি LLM কল নষ্ট হয়।
      const clash = [...produced, ...(state.recentHeadlines ?? [])].find(
        (prev) =>
          tokenOverlap(typeof prev === 'string' ? prev : prev.headline, rewritten.headline) >= DEDUPE_THRESHOLD
      );
      if (clash) {
        const shown = typeof clash === 'string' ? clash : clash.headline;
        log('skip', `${label} একই খবর আগেই আছে — ${shown.slice(0, 45)}`);
        markSeen(state, item.link);
        continue;
      }

      const slug = buildSlug(rewritten.headline, item.id);

      if (articleExists(slug)) {
        log('skip', `${label} আগেই আছে — ${slug.slice(0, 45)}`);
        markSeen(state, item.link);
        continue;
      }

      const decision = decideCardStyle({
        image: extracted.image,
        isOpinion: rewritten.isOpinion,
        body: rewritten.body,
      });

      const cardFile = path.join(config.paths.cards, `${slug}.png`);
      const card = await renderCard({
        // কার্ডটা ফেসবুকের জিনিস, সাইটের নয় — তাই সোশ্যাল শিরোনামই আঁকি
        headline: rewritten.socialHeadline,
        category: rewritten.category,
        source: item.sourceName,
        imageUrl: extracted.image,
        outFile: cardFile,
        forceStyle: decision.style === 'text' ? 'text' : null,
        slug,
      });

      const article = {
        slug,
        headline: rewritten.headline,
        // সাইট সবসময় headline দেখায়; socialHeadline কেবল ফেসবুকের জন্য
        socialHeadline: rewritten.socialHeadline,
        summary: rewritten.summary,
        body: rewritten.body,
        category: rewritten.category,
        tags: rewritten.tags,
        isOpinion: rewritten.isOpinion,
        sourceName: item.sourceName,
        sourceUrl: item.link,
        alsoIn: item.alsoIn ?? [],
        score: item.score,
        model: rewritten.model,
        provider: rewritten.provider,
        originalImage: extracted.image || null,
        // সাইটে দেখানোর ছবি — কার্ড নয়, মূল ছবি (কার্ডে শিরোনাম আঁকা থাকে)
        imageWebPath: card.imageWebPath,
        imageLocalFile: card.imageFile,
        cardFile: card.file,
        cardWebPath: `/cards/${slug}.png`,
        cardStyle: card.style,
        publishedAt: new Date().toISOString(),
        sourcePublishedAt: item.publishedAt,
      };

      const { published } = await saveArticle(article);

      // seen-এ যোগ করি কেবল সফল হলে। ব্যর্থ হলেও চিহ্নিত করলে লিংকটা
      // seen_links-এ চলে যেত আর ২১ দিন (pruneSeenLinks) পর্যন্ত আর কখনো
      // চেষ্টাই হতো না — Supabase-এর সাময়িক গোলযোগে সেই সময়ের সব খবর
      // চিরতরে হারিয়ে যেত।
      if (published) markSeen(state, item.link);

      if (published) {
        produced.push(article);
        // শিরোনামও সঙ্গে সঙ্গেই নথিভুক্ত — রান মাঝপথে থামলেও পরের রান
        // যেন এই খবরটাকে "নতুন" ভেবে দ্বিতীয়বার প্রকাশ না করে
        markHeadline(state, article.headline);
        log('ok', `${label} [${card.style}] ${rewritten.category} — ${rewritten.headline.slice(0, 50)}`);
      } else {
        // সাইটে নেই মানে ক্যাপশনের লিংকও কাজ করবে না — ফেসবুকে যাবে না
        log('warn', `${label} সংরক্ষণ ব্যর্থ, ফেসবুকে যাবে না — ${rewritten.headline.slice(0, 40)}`);
      }

      // প্রতিটি খবরের পরেই state লিখি। শেষে একবার লিখলে রান মাঝপথে
      // থেমে গেলে (Actions টাইমআউট) seen_links কিছুই সংরক্ষিত হতো না,
      // অথচ আর্টিকেল Supabase-এ ঢুকে যেত — পরের রানে সেই খবরই আবার
      // রিরাইট হয়ে ভিন্ন স্ল্যাগে দ্বিতীয়বার প্রকাশ পেত।
      await saveState(state);
    } catch (err) {
      markSeen(state, item.link);
      log('error', `${label} ${item.title.slice(0, 40)} — ${err.message.slice(0, 70)}`);
    }
  }

  log('build', `${produced.length} টি আর্টিকেল তৈরি হয়েছে`);
  await writeIndex();
  await pruneOldState();

  // ৫. ফেসবুকে সেরা কয়েকটা
  if (SKIP_FACEBOOK) {
    log('facebook', DRY_RUN ? 'dry-run — পোস্ট করা হয়নি' : '--no-facebook — বাদ দেওয়া হলো');
    if (produced.length) {
      log('facebook', 'যেগুলো যেত, তার ক্যাপশনের নমুনা:');
      console.log('\n' + '─'.repeat(60));
      console.log(buildCaption(produced[0]));
      console.log('─'.repeat(60));
      // লিংক এখন ক্যাপশনে নেই — কমেন্টে যায়, তাই নমুনায়ও আলাদা করে দেখাই
      console.log(`কমেন্ট: বিস্তারিত: ${siteUrlFor(produced[0]) || '(SITE_URL নেই)'}`);
      console.log('─'.repeat(60) + '\n');
    }
  } else {
    const toPost = produced.slice(0, maxPosts);
    let posted = 0;
    for (const [i, article] of toPost.entries()) {
      try {
        const caption = buildCaption(article);
        const res = await postPhoto({ imagePath: article.cardFile, caption });
        posted++;
        // কোন খবরটা সত্যিই পেজে গেছে সেটা নথিভুক্ত রাখি — নাহলে রান
        // মাঝপথে থামলে কোনটা পোস্ট হয়েছে আর কোনটা হয়নি, জানার উপায় থাকে না
        await markArticlePosted(article.slug, res.postId ?? res.photoId);
        log('facebook', `[${i + 1}/${toPost.length}] পোস্ট হয়েছে — ${res.postId ?? res.photoId}`);

        // লিংক আলাদা কমেন্টে। এই ব্যর্থতা রানের ব্যর্থতা নয় — ছবিটা
        // ততক্ষণে পেজে প্রকাশিত, আর লিংকহীন পোস্টও পোস্টই। তাই নিজের
        // try/catch, আর isFatalFacebookError-এর বাইরে রাখা হয়েছে।
        const url = siteUrlFor(article);
        if (url) {
          try {
            await postComment({ postId: res.postId ?? res.photoId, message: `বিস্তারিত: ${url}` });
          } catch (err) {
            log('facebook', `[${i + 1}/${toPost.length}] লিংকের কমেন্ট যায়নি — ${describeFacebookError(err, { action: 'comment' })}`);
          }
        }
      } catch (err) {
        log('facebook', `[${i + 1}/${toPost.length}] ব্যর্থ — ${describeFacebookError(err)}`);
        // এই ভুলগুলো পরের পোস্টেও একইভাবে হবে — চেষ্টা চালিয়ে যাওয়ার
        // মানে হয় না, উল্টো প্রতিটি ব্যর্থ চেষ্টার মাঝে অপেক্ষা করে
        // ঘণ্টার পর ঘণ্টা নষ্ট হয়।
        if (isFatalFacebookError(err)) break;
      }
      // পরপর পোস্ট করলে স্প্যাম হিসেবে চিহ্নিত হওয়ার ঝুঁকি
      if (i < toPost.length - 1) await sleep(config.limits.facebookGapMinutes * 60000);
    }
    state.postedCount = (state.postedCount ?? 0) + posted;
    log('facebook', `মোট ${posted} টি পোস্ট`);
  }

  await saveState(state);
  log('done', `শেষ — ${((Date.now() - startedAt) / 1000).toFixed(1)} সেকেন্ড`);
}

function siteUrlFor(article) {
  return config.siteUrl ? `${config.siteUrl}/news/${article.slug}` : '';
}

main().catch((err) => {
  log('fatal', err.message);
  console.error(err);
  process.exit(1);
});
