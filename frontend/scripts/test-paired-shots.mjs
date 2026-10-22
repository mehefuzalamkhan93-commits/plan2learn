import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'ui-shots');
const APP_URL = 'http://localhost:3000';
const EMAIL = 'mahafuzalamkhan25@gmail.com';
const PASSWORD = 'Temp@12345';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

async function captureViewport(w, h, theme, filename) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  });
  
  // Pre-seed theme in localStorage before page loads
  await ctx.addInitScript((t) => {
    localStorage.setItem('theme', t);
    document.documentElement.setAttribute('data-theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, theme);

  const page = await ctx.newPage();

  // Login
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await sleep(3500);

  // Go to dashboard
  if (!page.url().includes('/dashboard')) {
    await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
    await sleep(2000);
  } else {
    await sleep(1500);
  }

  // Ensure theme class is applied
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, theme);
  await sleep(500);

  // Check metrics
  const check = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    const bodyW = document.body.scrollWidth;
    const maxW = Math.max(docW, bodyW);
    const heading = document.querySelector('h1')?.innerText?.trim();
    const tasks = document.querySelectorAll('section[aria-labelledby="todays-study-heading"] h3');
    const taskTitles = Array.from(tasks).map((t) => t.innerText.trim());
    return {
      url: window.location.href,
      maxW,
      winW,
      hasOverflow: maxW > winW,
      heading,
      taskTitles,
    };
  });

  console.log(`[${theme.toUpperCase()}] ${w}px x ${h}px -> url: ${check.url}, overflow: ${check.hasOverflow}, heading: "${check.heading}", tasks: ${check.taskTitles.length}`);

  const shotPath = path.join(SHOT_DIR, filename);
  await page.screenshot({ path: shotPath });
  await ctx.close();
  return check;
}

console.log('Testing Dark Mode at 390px...');
await captureViewport(390, 844, 'dark', 'mobile-dashboard-dark-390px.png');

console.log('Testing Light Mode at 390px...');
await captureViewport(390, 844, 'light', 'mobile-dashboard-light-390px.png');

await browser.close();
