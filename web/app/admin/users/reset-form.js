'use client';

import { useState, useTransition } from 'react';
import { resetPasswordAction } from '../actions.js';

export default function ResetPasswordForm({ userId, name }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button className="btn tiny" type="button" onClick={() => setOpen(true)}>
        পাসওয়ার্ড
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set('id', userId);
        start(async () => {
          const res = await resetPasswordAction(null, fd);
          if (res?.error) setMsg(res.error);
          else {
            setMsg(null);
            setOpen(false);
          }
        });
      }}
      style={{ display: 'flex', gap: 6, alignItems: 'center' }}
    >
      <input
        name="password"
        type="password"
        placeholder={`${name} এর নতুন পাসওয়ার্ড`}
        minLength={8}
        required
        style={{ padding: '5px 9px', borderRadius: 6, background: '#0d1117', border: '1px solid var(--line)', color: 'var(--fg)', font: 'inherit', fontSize: '.82rem', width: 170 }}
      />
      <button className="btn tiny primary" type="submit" disabled={pending}>
        {pending ? '…' : 'সেট'}
      </button>
      <button className="btn tiny" type="button" onClick={() => { setOpen(false); setMsg(null); }}>
        বাতিল
      </button>
      {msg && <span style={{ color: '#ff9d97', fontSize: '.8rem' }}>{msg}</span>}
    </form>
  );
}
