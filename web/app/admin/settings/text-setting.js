'use client';

import { useState, useTransition } from 'react';
import { updateSettingAction } from '../actions.js';

/**
 * একটি লেখার সেটিং — Analytics আইডি, যাচাই টোকেন ইত্যাদি।
 *
 * NumberSetting-এর মতোই, তবে এখানে `pattern` দিয়ে ভুল মান আগেই ধরা
 * হয়। এই মানগুলো সরাসরি <script src> ও <meta> এ বসে, তাই ভুল বসালে
 * পাতা নীরবে ভাঙে — সাইট খুলবে, কিন্তু Analytics কোনোদিন গুনবে না,
 * আর কেউ টেরও পাবে না। তাই বসানোর মুহূর্তেই আটকানো।
 *
 * একই যাচাই সাইটের দিকেও আছে (lib/public-settings.js) — এটি সুবিধার
 * জন্য, ওটি শেষ বেড়া।
 */
export default function TextSetting({
  settingKey,
  value,
  title,
  note,
  placeholder,
  pattern,
  patternHint,
}) {
  const [v, setV] = useState(value ?? '');
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const trimmed = String(v).trim();
  const changed = trimmed !== String(value ?? '').trim();
  // খালি মান সবসময় বৈধ — এভাবেই একটা সেটিং বন্ধ করা হয়
  const valid = trimmed === '' || !pattern || new RegExp(pattern).test(trimmed);

  return (
    <div className="ctl ctl-text">
      <div className="info">
        <b>{title}</b>
        <span>{note}</span>
      </div>

      <div className="ctl-input">
        <input
          type="text"
          value={v}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => {
            setV(e.target.value);
            setSaved(false);
          }}
          className={!valid ? 'bad' : undefined}
        />
        {!valid && <div className="hint bad-text">{patternHint}</div>}
      </div>

      <button
        className="btn primary"
        disabled={!changed || !valid || pending}
        onClick={() =>
          start(async () => {
            await updateSettingAction(settingKey, trimmed);
            setSaved(true);
          })
        }
      >
        {pending ? '…' : saved ? '✓' : 'সংরক্ষণ'}
      </button>
    </div>
  );
}
