'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createAdAction } from '../actions.js';
import { AD_PLACEMENTS } from '../../../lib/ads.js';

/**
 * নতুন বিজ্ঞাপনের ফর্ম।
 *
 * বাছাই করা ছবিটি সঙ্গে সঙ্গে দেখানো হয় (URL.createObjectURL) — আপলোড
 * করার আগেই। বিজ্ঞাপনের ফাইলগুলোর নাম প্রায়ই "banner-final-2.gif"
 * ধরনের, তাই ভুল ফাইল বাছাই খুব সহজ; চোখে দেখতে পেলে সেটা ধরা পড়ে।
 */
export default function NewAdForm() {
  const [state, action, pending] = useActionState(createAdAction, {});
  const [preview, setPreview] = useState(null);
  const formRef = useRef(null);

  // সফল হলে ফর্ম খালি — নাহলে পরপর কয়েকটা বিজ্ঞাপন বসাতে গিয়ে
  // আগেরটার নাম রয়ে যেত। রেন্ডারের ভেতরে নয়, effect-এ: রেন্ডারে
  // setState ডাকলে React আবার রেন্ডার করে, আর শর্তটা মিথ্যা না হওয়া
  // পর্যন্ত সেটা চলতেই থাকত।
  useEffect(() => {
    if (!state?.ok) return;
    formRef.current?.reset();
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }, [state]);

  function onPick(e) {
    const file = e.target.files?.[0];
    const next = file ? URL.createObjectURL(file) : null;
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return next;
    });
  }

  return (
    <form ref={formRef} action={action} className="ad-form">
      {state?.error && <div className="msg err">{state.error}</div>}
      {state?.ok && <div className="msg ok">বিজ্ঞাপন যোগ হয়েছে</div>}

      <div className="field">
        <label>নাম</label>
        <input name="name" required placeholder="যেমন: রবি — ঈদ অফার" />
        <div className="hint">কেবল এই প্যানেলে চেনার জন্য, সাইটে দেখা যায় না</div>
      </div>

      <div className="field">
        <label>কোথায় বসবে</label>
        <select name="placement" required defaultValue="sidebar">
          {AD_PLACEMENTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.note ? ` — ${p.note}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>ছবি</label>
        <input
          name="image"
          type="file"
          required
          accept="image/gif,image/png,image/webp,image/jpeg"
          onChange={onPick}
        />
        <div className="hint">GIF, PNG, WebP বা JPG — সর্বোচ্চ ৩ MB। GIF-এর অ্যানিমেশন ঠিক থাকে।</div>
        {preview && (
          <div className="ad-preview">
            <img src={preview} alt="বাছাই করা ছবি" />
          </div>
        )}
      </div>

      <div className="field">
        <label>লিংক</label>
        <input name="link_url" type="url" placeholder="https://example.com" />
        <div className="hint">খালি রাখলে ছবিটি ক্লিকযোগ্য হবে না</div>
      </div>

      <div className="field">
        <label>বিকল্প লেখা</label>
        <input name="alt" placeholder="ছবিটি না এলে যা দেখাবে" />
      </div>

      <div className="ad-form-row">
        <div className="field">
          <label>শুরু</label>
          <input name="starts_at" type="datetime-local" />
        </div>
        <div className="field">
          <label>শেষ</label>
          <input name="ends_at" type="datetime-local" />
          <div className="hint">খালি = মেয়াদ নেই</div>
        </div>
      </div>

      <div className="field">
        <label>ক্রম</label>
        <input name="sort" type="number" defaultValue={0} min={0} max={999} />
        <div className="hint">একই জায়গায় একাধিক থাকলে ছোট সংখ্যা আগে</div>
      </div>

      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? 'আপলোড হচ্ছে…' : 'যোগ করুন'}
      </button>
    </form>
  );
}
