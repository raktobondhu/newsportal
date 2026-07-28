'use client';

import { useEffect, useRef } from 'react';

/**
 * একটি AdSense বিজ্ঞাপন ইউনিট।
 *
 * ক্লায়েন্ট কম্পোনেন্ট হতেই হয়: <ins> বসানোর পর AdSense-কে বলতে হয়
 * "এটা ভরে দাও" — সেটা ব্রাউজারেই সম্ভব।
 *
 * useRef দিয়ে একবারই push করা হয়। React ডেভেলপমেন্টে কম্পোনেন্ট দুবার
 * মাউন্ট করে (StrictMode), আর দুবার push করলে AdSense
 * "already have ads in them" ত্রুটি দিয়ে ইউনিটটি ফাঁকা রেখে দেয়।
 */
export default function AdSenseUnit({ client, slot }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // অ্যাডব্লকার থাকলে এখানে ব্যর্থ হয় — পাতার বাকিটা যেন না ভাঙে
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
