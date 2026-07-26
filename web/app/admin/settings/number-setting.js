'use client';

import { useState, useTransition } from 'react';
import { updateSettingAction } from '../actions.js';

export default function NumberSetting({ settingKey, value, title, note, min = 0, max = 100 }) {
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const changed = Number(v) !== Number(value);

  return (
    <div className="setting">
      <div className="info">
        <b>{title}</b>
        <span>{note}</span>
      </div>
      <input
        type="number"
        value={v}
        min={min}
        max={max}
        onChange={(e) => { setV(e.target.value); setSaved(false); }}
        style={{ width: 84, padding: '8px 10px', borderRadius: 7, background: '#0d1117', border: '1px solid var(--line)', color: 'var(--fg)', font: 'inherit' }}
      />
      <button
        className="btn primary"
        disabled={!changed || pending}
        onClick={() =>
          start(async () => {
            await updateSettingAction(settingKey, Number(v));
            setSaved(true);
          })
        }
      >
        {pending ? '…' : saved ? '✓' : 'সংরক্ষণ'}
      </button>
    </div>
  );
}
