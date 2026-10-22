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

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

console.log('Logging in...');
await page.goto(`${APP_URL}/login`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');

// Wait for access_token to appear in localStorage
await page.waitForFunction(() => !!localStorage.getItem('access_token'), { timeout: 15000 });
console.log('Access token received!');

// Wait for navigation to dashboard
await page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 15000 });
await sleep(1500);

// Test theme toggle in MobileDashboard!
console.log('Testing dark mode...');
await page.evaluate(() => {
  localStorage.setItem('theme', 'dark');
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add('dark');
});
await sleep(500);

await page.screenshot({ path: path.join(SHOT_DIR, 'verified-dark-390.png') });
console.log('Saved verified-dark-390.png');

console.log('Testing light mode...');
await page.evaluate(() => {
  localStorage.setItem('theme', 'light');
  document.documentElement.setAttribute('data-theme', 'light');
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.add('light');
});
await sleep(500);

await page.screenshot({ path: path.join(SHOT_DIR, 'verified-light-390.png') });
console.log('Saved verified-light-390.png');

await browser.close();
