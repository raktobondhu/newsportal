import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { adminQuery } from './admin-db.js';

/**
 * প্রমাণীকরণ। বাইরের কোনো লাইব্রেরি ছাড়াই, কারণ যা দরকার তার সবই
 * Node-এ আছে — scrypt (পাসওয়ার্ড) আর HMAC (সেশন)।
 *
 * bcrypt/argon2 এর মতো নেটিভ প্যাকেজ Vercel-এ বিল্ড ঝামেলা তৈরি করে,
 * আর scrypt নিজেই memory-hard, brute-force এর বিরুদ্ধে যথেষ্ট শক্ত।
 */

const SESSION_COOKIE = 'km_session';
const SESSION_DAYS = 7;

function sessionSecret() {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET সেট নেই বা খুব ছোট (অন্তত ৩২ অক্ষর দরকার)');
  }
  return s;
}

// ---------------------------------------------------------------
// পাসওয়ার্ড
// ---------------------------------------------------------------

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    // timingSafeEqual — সাধারণ === দিয়ে তুলনা করলে সময়ের পার্থক্য থেকে
    // পাসওয়ার্ড অনুমান করা সম্ভব
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------
// সেশন — স্বাক্ষরিত কুকি
// ---------------------------------------------------------------

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function unsign(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');

  const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(user) {
  const token = sign({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    exp: Date.now() + SESSION_DAYS * 86400000,
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // JavaScript থেকে পড়া যাবে না — XSS হলেও সেশন চুরি হবে না
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** লগইন করা ব্যবহারকারী, নাহলে null */
export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return unsign(token);
}

// ---------------------------------------------------------------
// রোল
// ---------------------------------------------------------------

/**
 * manager কনটেন্ট সামলায়; admin এর সঙ্গে ব্যবহারকারী ও সেটিংসও।
 * প্রতিটি লেখার কাজের শুরুতে এটি ডাকা বাধ্যতামূলক — শুধু UI-তে বোতাম
 * লুকিয়ে রাখা নিরাপত্তা নয়, কেউ সরাসরি অনুরোধ পাঠাতে পারে।
 */
export const CAN = {
  editArticles: ['admin', 'manager'],
  hideArticles: ['admin', 'manager'],
  postToFacebook: ['admin', 'manager'],
  deleteArticles: ['admin'],
  manageUsers: ['admin'],
  manageSettings: ['admin'],
};

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error('লগইন করা নেই');
  return user;
}

export async function requirePermission(permission) {
  const user = await requireUser();
  const allowed = CAN[permission];
  if (!allowed) throw new Error(`অজানা অনুমতি: ${permission}`);
  if (!allowed.includes(user.role)) {
    throw new Error('এই কাজের অনুমতি আপনার নেই');
  }
  return user;
}

// ---------------------------------------------------------------
// লগইন
// ---------------------------------------------------------------

export async function authenticate(email, password) {
  const rows = await adminQuery(
    `admin_users?select=id,email,name,role,password_hash,active&email=eq.${encodeURIComponent(
      String(email).trim().toLowerCase()
    )}&limit=1`
  );
  const user = rows?.[0];

  // ব্যবহারকারী না থাকলেও একটা হ্যাশ যাচাই চালাই — নাহলে উত্তরের সময়
  // দেখে বোঝা যেত কোন ইমেইলগুলো আসল
  const hash = user?.password_hash ?? hashPassword(crypto.randomUUID());
  const ok = verifyPassword(password, hash);

  if (!user || !ok) return { error: 'ইমেইল বা পাসওয়ার্ড ভুল' };
  if (!user.active) return { error: 'এই অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে' };

  return { user };
}

export async function recordLogin(id) {
  await adminQuery(`admin_users?id=eq.${id}`, {
    method: 'PATCH',
    body: { last_login: new Date().toISOString() },
  });
}
