import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'ui-shots');
const APP_URL = 'http://localhost:3000';
const EMAIL = 'mahafuzalamkhan25@gmail.com';
const PASSWORD = 'Temp@12345';

if (!fs.existsSync(SHOT_DIR)) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

async function loginAndGetCookies() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 15000 });
  await sleep(1500);
  const storageState = await ctx.storageState();
  await ctx.close();
  return storageState;
}

const storageState = await loginAndGetCookies();
console.log('Successfully logged in and obtained session state.');

const mobileWidths = [320, 360, 375, 390, 412, 430, 480];

// Test Dark Mode across all mobile widths
console.log('\n--- Testing Dark Mode across mobile viewports ---');
for (const w of mobileWidths) {
  const h = 844;
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: w, height: h },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  });
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
  await sleep(1500);

  const overflow = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    return {
      scrollWidth: docW,
      innerWidth: winW,
      hasHorizontalOverflow: docW > winW,
      heading: document.querySelector('h1')?.innerText,
      hasBottomNav: !!document.querySelector('nav[aria-label="Mobile Navigation"]')
    };
  });
  console.log(`Viewport ${w}px (Dark):`, JSON.stringify(overflow));

  await page.screenshot({ path: path.join(SHOT_DIR, `mobile-dashboard-dark-${w}px.png`), fullPage: false });
  await ctx.close();
}

// Test Light Mode across mobile widths
console.log('\n--- Testing Light Mode across mobile viewports ---');
for (const w of [320, 375, 390, 412, 480]) {
  const h = 844;
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: w, height: h },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  });
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
  await sleep(1500);

  const overflow = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    return {
      scrollWidth: docW,
      innerWidth: winW,
      hasHorizontalOverflow: docW > winW,
      heading: document.querySelector('h1')?.innerText,
    };
  });
  console.log(`Viewport ${w}px (Light):`, JSON.stringify(overflow));

  await page.screenshot({ path: path.join(SHOT_DIR, `mobile-dashboard-light-${w}px.png`), fullPage: false });
  await ctx.close();
}

// Test Desktop (1280px) in Dark and Light to verify preservation
console.log('\n--- Testing Desktop Preservation (1280px) ---');
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 800 }
  });
  await ctx.addInitScript((t) => {
    localStorage.setItem('theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, theme);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'networkidle' });
  await sleep(1500);

  const desktopCheck = await page.evaluate(() => {
    const isMobileNavPresent = !!document.querySelector('nav[aria-label="Mobile Navigation"]');
    const isMobileNavVisible = isMobileNavPresent && getComputedStyle(document.querySelector('nav[aria-label="Mobile Navigation"]')).display !== 'none';
    const desktopContainer = document.querySelector('.hidden.lg\\:block');
    const desktopVisible = desktopContainer && getComputedStyle(desktopContainer).display !== 'none';
    return {
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      desktopVisible,
      isMobileNavVisible,
    };
  });
  console.log(`Desktop (1280px, ${theme}):`, JSON.stringify(desktopCheck));

  await page.screenshot({ path: path.join(SHOT_DIR, `desktop-dashboard-${theme}-1280px.png`), fullPage: false });
  await ctx.close();
}

await browser.close();
console.log('\nAll visual verification tests completed successfully.');
