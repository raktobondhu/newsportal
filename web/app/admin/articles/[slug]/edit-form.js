'use client';

import { useState, useTransition } from 'react';
import { updateArticleAction } from '../../actions.js';

const CATEGORIES = ['জাতীয়', 'আন্তর্জাতিক', 'রাজনীতি', 'অর্থনীতি', 'খেলা', 'বিনোদন', 'প্রযুক্তি', 'শিক্ষা', 'স্বাস্থ্য', 'অপরাধ'];

/** দৃশ্যমান অক্ষর — বাংলায় .length বিভ্রান্তিকর (যুক্তাক্ষর একাধিক একক নেয়) */
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('bn', { granularity: 'grapheme' }) : null;
const count = (s) => (seg ? [...seg.segment(s)].length : s.length);
const bn = (v) => String(v).replace(/[0-9]/g, (c) => '০১২৩৪৫৬৭৮৯'[Number(c)]);

export default function EditForm({ article }) {
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();
  const [social, setSocial] = useState(article.social_headline ?? '');

  function onSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await updateArticleAction(article.slug, fd);
      setMsg(res?.error ? { err: res.error } : { ok: 'সংরক্ষণ হয়েছে' });
    });
  }

  const socialLen = count(social);

  return (
    <form onSubmit={onSubmit}>
      {msg?.err && <div className="msg err">{msg.err}</div>}
      {msg?.ok && <div className="msg ok">{msg.ok}</div>}

      <div className="field">
        <label>শিরোনাম — সাইটে যা দেখা যাবে</label>
        <input name="headline" defaultValue={article.headline} required />
      </div>

      <div className="field">
        <label>
          ফেসবুকের শিরোনাম{' '}
          <span style={{ color: socialLen > 65 ? '#ff9d97' : 'var(--muted)' }}>
            ({bn(socialLen)}/৬৫ অক্ষর)
          </span>
        </label>
        <input name="social_headline" value={social} onChange={(e) => setSocial(e.target.value)} />
        <div className="hint">
          খালি রাখলে সাইটের শিরোনামটাই ফেসবুকে যাবে। ৬৫ অক্ষরের বেশি হলে ফিডে কেটে যায়।
        </div>
      </div>

      <div className="field">
        <label>সারমর্ম</label>
        <textarea name="summary" rows={3} defaultValue={article.summary ?? ''} />
      </div>

      <div className="field">
        <label>বিভাগ</label>
        <select name="category" defaultValue={article.category}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>মূল লেখা — অনুচ্ছেদের মাঝে একটি খালি লাইন রাখুন</label>
        <textarea name="body" rows={16} defaultValue={article.body} required />
      </div>

      <div className="btn-row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}
        </button>
        <a className="btn" href="/admin/articles">ফিরে যান</a>
      </div>
    </form>
  );
}
