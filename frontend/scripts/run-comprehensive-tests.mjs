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

console.log('1. Logging in to obtain valid auth session state...');
const authCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const authPage = await authCtx.newPage();
await authPage.goto(`${APP_URL}/login`);
await authPage.fill('input[type="email"]', EMAIL);
await authPage.fill('input[type="password"]', PASSWORD);
await authPage.click('button[type="submit"]');
await sleep(4000);

await authPage.goto(`${APP_URL}/dashboard`);
await sleep(2500);

const token = await authPage.evaluate(() => localStorage.getItem('access_token'));
console.log('Retrieved access_token:', token ? 'Found (' + token.substring(0, 15) + '...)' : 'MISSING');

const storageState = await authCtx.storageState();
await authCtx.close();

const viewports = [320, 360, 375, 390, 412, 430, 480];
const results = [];

// Function to test a specific viewport and theme
async function testViewport(width, height, theme, isMobile) {
  const ctx = await browser.newContext({
    storageState,
    viewport: { width, height },
    colorScheme: theme,
    userAgent: isMobile
      ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      : undefined,
  });

  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/dashboard`);
  await sleep(1500);

  // Apply theme explicitly
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
  await sleep(600);

  const data = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const bodyW = document.body.scrollWidth;
    const winW = window.innerWidth;
    const maxW = Math.max(docW, bodyW);
    const hasHorizontalOverflow = maxW > winW;
    const h1 = document.querySelector('h1')?.innerText?.trim();
    const taskCount = document.querySelectorAll('section[aria-labelledby="todays-study-heading"] h3').length;
    const hasMobileNav = !!document.querySelector('nav[aria-label="Mobile Navigation"]');
    const isMobileNavVisible = hasMobileNav && getComputedStyle(document.querySelector('nav[aria-label="Mobile Navigation"]')).display !== 'none';
    const desktopContainer = document.querySelector('.hidden.lg\\:block');
    const isDesktopVisible = desktopContainer && getComputedStyle(desktopContainer).display !== 'none';

    return {
      maxW,
      winW,
      hasHorizontalOverflow,
      h1,
      taskCount,
      isMobileNavVisible,
      isDesktopVisible,
    };
  });

  const shotName = isMobile ? `dashboard-${theme}-${width}px.png` : `desktop-${theme}-${width}px.png`;
  await page.screenshot({ path: path.join(SHOT_DIR, shotName) });
  await ctx.close();

  const record = { theme, width, height, isMobile, ...data, shotName };
  results.push(record);
  console.log(`[${theme.toUpperCase()}] ${width}px: overflow=${data.hasHorizontalOverflow} (w=${data.maxW}px/vp=${data.winW}px), h1="${data.h1}", tasks=${data.taskCount}, mobileNav=${data.isMobileNavVisible}, desktop=${data.isDesktopVisible}`);
  return record;
}

// 2. Test all Mobile Viewports in DARK MODE
console.log('\n--- 2. Testing Dark Mode Mobile Viewports ---');
for (const w of viewports) {
  await testViewport(w, 844, 'dark', true);
}

// 3. Test all Mobile Viewports in LIGHT MODE
console.log('\n--- 3. Testing Light Mode Mobile Viewports ---');
for (const w of viewports) {
  await testViewport(w, 844, 'light', true);
}

// 4. Test Desktop at 1280px in both themes
console.log('\n--- 4. Testing Desktop (1280px) in Dark and Light ---');
await testViewport(1280, 800, 'dark', false);
await testViewport(1280, 800, 'light', false);

// 5. Save comprehensive results JSON
fs.writeFileSync(path.join(SHOT_DIR, 'comprehensive-test-results.json'), JSON.stringify(results, null, 2));
console.log('\nAll 16 viewports tested and screenshots saved successfully!');

await browser.close();
