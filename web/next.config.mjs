/** @type {import('next').NextConfig} */
const nextConfig = {
  // প্রোডাকশনে ছবি আসে Supabase Storage থেকে (article.image_url /
  // card_url), তাই এখানে কোনো rewrite বা কপি করার দরকার নেই।
  // পাইপলাইন web/public/cards ও web/public/images এ যা লেখে সেটা কেবল
  // স্থানীয় ডেভেলপমেন্টের সুবিধার্থে — gitignore করা আছে।
  images: {
    // কার্ড আগেই ১০৮০x১০৮০ PNG — Next.js-এর অপ্টিমাইজার লাগবে না
    unoptimized: true,
  },
};

export default nextConfig;
