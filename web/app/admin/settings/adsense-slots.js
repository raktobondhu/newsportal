'use client';

import { useState, useTransition } from 'react';
import { updateSettingAction } from '../actions.js';
import { AD_PLACEMENTS } from '../../../lib/ads.js';

/**
 * প্রতিটি জায়গার জন্য AdSense-এর slot আইডি।
 *
 * AdSense ড্যাশবোর্ডে "Ad unit" বানালে ১০ অঙ্কের একটি আইডি পাওয়া যায়।
 * যে জায়গার ঘরে আইডি বসানো থাকবে এবং যেখানে নিজেদের বিজ্ঞাপন নেই,
 * কেবল সেখানেই Google-এর বিজ্ঞাপন বসবে।
 *
 * সবগুলো একসাথে সংরক্ষণ হয়, একটি সেটিং হিসেবে — নয়টি আলাদা কী রাখলে
 * নতুন জায়গা যোগ করার সময় প্রতিবার SQL চালাতে হতো।
 */
export default function AdsenseSlots({ value }) {
  const initial = value && typeof value === 'object' ? value : {};
  const [slots, setSlots] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const clean = Object.fromEntries(
    Object.entries(slots)
      .map(([k, v]) => [k, String(v ?? '').trim()])
      .filter(([, v]) => v !== '')
  );

  const changed = JSON.stringify(clean) !== JSON.stringify(initial);
  const bad = Object.values(clean).filter((v) => !/^\d{6,20}$/.test(v));

  return (
    <div className="slot-grid">
      {AD_PLACEMENTS.map((p) => (
        <label className="slot-row" key={p.id}>
          <span>{p.label}</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="১০ অঙ্কের slot আইডি"
            spellCheck={false}
            value={slots[p.id] ?? ''}
            onChange={(e) => {
              setSlots({ ...slots, [p.id]: e.target.value });
              setSaved(false);
            }}
          />
        </label>
      ))}

      {bad.length > 0 && (
        <div className="msg err">slot আইডি কেবল সংখ্যা হয় (৬–২০ অঙ্ক)। ঠিক করুন।</div>
      )}

      <button
        className="btn primary"
        disabled={!changed || bad.length > 0 || pending}
        onClick={() =>
          start(async () => {
            await updateSettingAction('adsense_slots', clean);
            setSaved(true);
          })
        }
      >
        {pending ? 'সংরক্ষণ হচ্ছে…' : saved ? '✓ সংরক্ষিত' : 'সংরক্ষণ করুন'}
      </button>
    </div>
  );
}
