import 'server-only';

/**
 * অ্যাডমিন প্যানেলের ডেটাবেস অ্যাক্সেস — service key দিয়ে, RLS বাইপাস করে।
 *
 * `server-only` ইমপোর্টটা ইচ্ছাকৃত: কেউ ভুল করে এই ফাইলটি কোনো ক্লায়েন্ট
 * কম্পোনেন্টে ইমপোর্ট করলে বিল্ড সঙ্গে সঙ্গে ব্যর্থ হবে। এই সুরক্ষাটা
 * জরুরি — service key ব্রাউজারে পৌঁছালে যে কেউ পুরো ডেটাবেস মুছে দিতে পারবে।
 */

const URL_BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

export function adminDbReady() {
  return Boolean(URL_BASE && SERVICE_KEY);
}

export async function adminQuery(path, { method = 'GET', body, prefer } = {}) {
  if (!adminDbReady()) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY সেট নেই');
  }

  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store', // অ্যাডমিন প্যানেলে সবসময় সর্বশেষ অবস্থা চাই
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ডেটাবেস ${method} ${path.split('?')[0]} → ${res.status} ${text.slice(0, 150)}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------
// সেটিংস
// ---------------------------------------------------------------

export async function getSettings() {
  const rows = await adminQuery('app_settings?select=key,value');
  const out = {};
  for (const r of rows ?? []) out[r.key] = r.value;
  return out;
}

export async function setSetting(key, value, actor) {
  await adminQuery('app_settings', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ key, value, updated_at: new Date().toISOString(), updated_by: actor }],
  });
}

// ---------------------------------------------------------------
// কাজের হিসাব
// ---------------------------------------------------------------

export async function logAction(actor, action, target, detail = null) {
  try {
    await adminQuery('admin_audit', {
      method: 'POST',
      prefer: 'return=minimal',
      body: [{ actor, action, target, detail }],
    });
  } catch {
    // হিসাব লিখতে না পারলেও আসল কাজটা আটকানো উচিত নয়
  }
}
