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

// Single persistent context or fresh page
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

console.log('Logging in...');
await page.goto(`${APP_URL}/login`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await sleep(3500);

// Verify we can access dashboard
await page.goto(`${APP_URL}/dashboard`);
await sleep(1500);

const viewports = [
  { name: '320px', width: 320, height: 680 },
  { name: '360px', width: 360, height: 740 },
  { name: '375px', width: 375, height: 812 },
  { name: '390px', width: 390, height: 844 },
  { name: '412px', width: 412, height: 915 },
  { name: '430px', width: 430, height: 932 },
  { name: '480px', width: 480, height: 854 },
];

const reportResults = [];

// Helper to switch theme in active page
async function setPageTheme(targetTheme) {
  await page.evaluate((theme) => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, targetTheme);
  await sleep(600);
}

// 1. Dark Mode Mobile Viewports
console.log('\n=== Testing Dark Mode Mobile ===');
await setPageTheme('dark');

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await sleep(600);

  const metrics = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    const bodyW = document.body.scrollWidth;
    const hasOverflow = docW > winW || bodyW > winW;
    const heading = document.querySelector('h1')?.textContent?.trim();
    const taskRows = document.querySelectorAll('section[aria-labelledby="todays-study-heading"] > div:last-child > div');
    const bottomNav = document.querySelector('nav[aria-label="Mobile Navigation"]');
    return {
      scrollWidth: Math.max(docW, bodyW),
      winW,
      hasOverflow,
      heading,
      taskCount: taskRows.length,
      hasBottomNav: !!bottomNav,
    };
  });

  const shotPath = path.join(SHOT_DIR, `recreated-mobile-dark-${vp.name}.png`);
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log(`[Dark] ${vp.name}: overflow=${metrics.hasOverflow} (${metrics.scrollWidth}px / ${metrics.winW}px), heading="${metrics.heading}", tasks=${metrics.taskCount}`);
  reportResults.push({ theme: 'dark', ...vp, ...metrics, shot: path.basename(shotPath) });
}

// 2. Light Mode Mobile Viewports
console.log('\n=== Testing Light Mode Mobile ===');
await setPageTheme('light');

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await sleep(600);

  const metrics = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    const bodyW = document.body.scrollWidth;
    const hasOverflow = docW > winW || bodyW > winW;
    const heading = document.querySelector('h1')?.textContent?.trim();
    const taskRows = document.querySelectorAll('section[aria-labelledby="todays-study-heading"] > div:last-child > div');
    const bottomNav = document.querySelector('nav[aria-label="Mobile Navigation"]');
    return {
      scrollWidth: Math.max(docW, bodyW),
      winW,
      hasOverflow,
      heading,
      taskCount: taskRows.length,
      hasBottomNav: !!bottomNav,
    };
  });

  const shotPath = path.join(SHOT_DIR, `recreated-mobile-light-${vp.name}.png`);
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log(`[Light] ${vp.name}: overflow=${metrics.hasOverflow} (${metrics.scrollWidth}px / ${metrics.winW}px), heading="${metrics.heading}", tasks=${metrics.taskCount}`);
  reportResults.push({ theme: 'light', ...vp, ...metrics, shot: path.basename(shotPath) });
}

// 3. Desktop Preservation (1280px) in Dark and Light
console.log('\n=== Testing Desktop (1280px) Preservation ===');
for (const theme of ['dark', 'light']) {
  await setPageTheme(theme);
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(800);

  const desktopMetrics = await page.evaluate(() => {
    const mobileNav = document.querySelector('nav[aria-label="Mobile Navigation"]');
    const isMobileNavHidden = !mobileNav || getComputedStyle(mobileNav).display === 'none';
    const desktopContainer = document.querySelector('.hidden.lg\\:block');
    const isDesktopVisible = desktopContainer && getComputedStyle(desktopContainer).display !== 'none';
    return {
      isMobileNavHidden,
      isDesktopVisible,
    };
  });

  const shotPath = path.join(SHOT_DIR, `desktop-preserved-${theme}-1280px.png`);
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log(`[Desktop 1280px ${theme}]: desktopVisible=${desktopMetrics.isDesktopVisible}, mobileNavHidden=${desktopMetrics.isMobileNavHidden}`);
  reportResults.push({ theme, width: 1280, height: 800, ...desktopMetrics, shot: path.basename(shotPath) });
}

fs.writeFileSync(path.join(SHOT_DIR, 'mobile-verification-results.json'), JSON.stringify(reportResults, null, 2));
console.log('\nAll tests and screenshots successfully captured!');
await browser.close();
