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

async function capture(colorScheme, filename) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: colorScheme, // 'dark' or 'light'
  });
  const page = await ctx.newPage();

  await page.goto(`${APP_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await sleep(3500);

  await page.goto(`${APP_URL}/dashboard`);
  await sleep(2500);

  // Force set localStorage theme to ensure it persists
  await page.evaluate((theme) => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, colorScheme);
  await sleep(500);

  await page.screenshot({ path: path.join(SHOT_DIR, filename) });
  console.log(`Captured ${filename} with colorScheme: ${colorScheme}`);
  await ctx.close();
}

console.log('Capturing dark mode mobile at 390px...');
await capture('dark', 'exact-mobile-dark-390.png');

console.log('Capturing light mode mobile at 390px...');
await capture('light', 'exact-mobile-light-390.png');

await browser.close();
