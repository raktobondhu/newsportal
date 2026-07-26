'use client';

import { useActionState } from 'react';
import { loginAction } from '../actions.js';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <div className="adm-login">
      <form className="box" action={formAction}>
        <img src="/logo.svg" alt="কথা ম্যাট্রিক্স" />

        {state?.error && <div className="msg err">{state.error}</div>}

        <div className="field">
          <label htmlFor="email">ইমেইল</label>
          <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </div>

        <div className="field">
          <label htmlFor="password">পাসওয়ার্ড</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>

        <button className="btn primary" type="submit" style={{ width: '100%' }} disabled={pending}>
          {pending ? 'যাচাই করা হচ্ছে…' : 'প্রবেশ করুন'}
        </button>
      </form>
    </div>
  );
}
