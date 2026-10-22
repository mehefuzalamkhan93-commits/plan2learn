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

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
});
const page = await ctx.newPage();
page.on('console', (msg) => {
  const t = msg.text();
  if (!t.includes('React DevTools')) console.log('[BROWSER]', t);
});

console.log('Navigating to login...');
await page.goto(`${APP_URL}/login`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await sleep(3500);

if (!page.url().includes('/dashboard')) {
  console.log('Navigating directly to /dashboard...');
  await page.goto(`${APP_URL}/dashboard`);
  await sleep(2500);
}

console.log('Current page URL:', page.url());

const mobileWidths = [
  { w: 320, h: 680 },
  { w: 360, h: 740 },
  { w: 375, h: 812 },
  { w: 390, h: 844 },
  { w: 412, h: 915 },
  { w: 430, h: 932 },
  { w: 480, h: 854 },
];

const results = [];

// Helper to switch theme safely without unmounting or reloading
async function applyTheme(theme) {
  await page.evaluate((t) => {
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
  await sleep(400);
}

// 1. Capture DARK MODE mobile viewports
console.log('\n--- Capturing Dark Mode Mobile Viewports ---');
await applyTheme('dark');

for (const { w, h } of mobileWidths) {
  await page.setViewportSize({ width: w, height: h });
  await sleep(500);

  const stats = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const bodyW = document.body.scrollWidth;
    const winW = window.innerWidth;
    const maxW = Math.max(docW, bodyW);
    const heading = document.querySelector('h1')?.innerText?.trim();
    const taskCount = document.querySelectorAll('section[aria-labelledby="todays-study-heading"] h3').length;
    const hasNav = !!document.querySelector('nav[aria-label="Mobile Navigation"]');
    return {
      maxW,
      winW,
      hasOverflow: maxW > winW,
      heading,
      taskCount,
      hasNav,
    };
  });

  const shotName = `mobile-dark-${w}px.png`;
  await page.screenshot({ path: path.join(SHOT_DIR, shotName) });
  console.log(`[Dark] ${w}px x ${h}px: overflow=${stats.hasOverflow} (${stats.maxW}/${stats.winW}px), heading="${stats.heading}", tasks=${stats.taskCount}, nav=${stats.hasNav}`);
  results.push({ theme: 'dark', width: w, height: h, ...stats, shotName });
}

// 2. Capture LIGHT MODE mobile viewports
console.log('\n--- Capturing Light Mode Mobile Viewports ---');
await applyTheme('light');

for (const { w, h } of mobileWidths) {
  await page.setViewportSize({ width: w, height: h });
  await sleep(500);

  const stats = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const bodyW = document.body.scrollWidth;
    const winW = window.innerWidth;
    const maxW = Math.max(docW, bodyW);
    const heading = document.querySelector('h1')?.innerText?.trim();
    const taskCount = document.querySelectorAll('section[aria-labelledby="todays-study-heading"] h3').length;
    const hasNav = !!document.querySelector('nav[aria-label="Mobile Navigation"]');
    return {
      maxW,
      winW,
      hasOverflow: maxW > winW,
      heading,
      taskCount,
      hasNav,
    };
  });

  const shotName = `mobile-light-${w}px.png`;
  await page.screenshot({ path: path.join(SHOT_DIR, shotName) });
  console.log(`[Light] ${w}px x ${h}px: overflow=${stats.hasOverflow} (${stats.maxW}/${stats.winW}px), heading="${stats.heading}", tasks=${stats.taskCount}, nav=${stats.hasNav}`);
  results.push({ theme: 'light', width: w, height: h, ...stats, shotName });
}

// 3. Desktop viewports (1280px) in Dark and Light to verify 100% preservation
console.log('\n--- Capturing Desktop Viewports (1280px) ---');
for (const theme of ['dark', 'light']) {
  await applyTheme(theme);
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(600);

  const desktopStats = await page.evaluate(() => {
    const desktopEl = document.querySelector('.hidden.lg\\:block');
    const isDesktopVisible = desktopEl && getComputedStyle(desktopEl).display !== 'none';
    const mobileEl = document.querySelector('.block.lg\\:hidden');
    const isMobileHidden = mobileEl && getComputedStyle(mobileEl).display === 'none';
    const navEl = document.querySelector('nav[aria-label="Mobile Navigation"]');
    const isNavHidden = !navEl || getComputedStyle(navEl).display === 'none';
    return {
      isDesktopVisible,
      isMobileHidden,
      isNavHidden,
    };
  });

  const shotName = `desktop-${theme}-1280px.png`;
  await page.screenshot({ path: path.join(SHOT_DIR, shotName) });
  console.log(`[Desktop ${theme} 1280px]: desktopVisible=${desktopStats.isDesktopVisible}, mobileHidden=${desktopStats.isMobileHidden}, navHidden=${desktopStats.isNavHidden}`);
  results.push({ theme, width: 1280, height: 800, ...desktopStats, shotName });
}

fs.writeFileSync(path.join(SHOT_DIR, 'full-test-results.json'), JSON.stringify(results, null, 2));
console.log('\nAll 16 verification tests and screenshots completed successfully!');
await browser.close();
