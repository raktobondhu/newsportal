'use client';

import { useActionState } from 'react';
import { changeOwnPasswordAction } from '../actions.js';

export default function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, {});

  return (
    <form action={action}>
      {state?.error && <div className="msg err">{state.error}</div>}
      {state?.ok && <div className="msg ok">পাসওয়ার্ড বদলে গেছে</div>}

      <div className="field">
        <label>বর্তমান পাসওয়ার্ড</label>
        <input name="current" type="password" autoComplete="current-password" required />
      </div>

      <div className="field">
        <label>নতুন পাসওয়ার্ড</label>
        <input name="next" type="password" autoComplete="new-password" minLength={8} required />
        <div className="hint">অন্তত ৮ অক্ষর</div>
      </div>

      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? 'বদলানো হচ্ছে…' : 'বদলান'}
      </button>
    </form>
  );
}
