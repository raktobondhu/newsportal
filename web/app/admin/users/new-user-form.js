'use client';

import { useActionState } from 'react';
import { createUserAction } from '../actions.js';

export default function NewUserForm() {
  const [state, action, pending] = useActionState(createUserAction, {});

  return (
    <form action={action}>
      {state?.error && <div className="msg err">{state.error}</div>}
      {state?.ok && <div className="msg ok">ব্যবহারকারী যোগ হয়েছে</div>}

      <div className="field">
        <label>নাম</label>
        <input name="name" required />
      </div>

      <div className="field">
        <label>ইমেইল</label>
        <input name="email" type="email" required />
      </div>

      <div className="field">
        <label>পাসওয়ার্ড</label>
        <input name="password" type="password" minLength={8} required />
        <div className="hint">অন্তত ৮ অক্ষর</div>
      </div>

      <div className="field">
        <label>রোল</label>
        <select name="role" defaultValue="manager">
          <option value="manager">ম্যানেজার — খবর দেখাশোনা</option>
          <option value="admin">অ্যাডমিন — সবকিছু</option>
        </select>
      </div>

      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? 'যোগ হচ্ছে…' : 'যোগ করুন'}
      </button>
    </form>
  );
}
