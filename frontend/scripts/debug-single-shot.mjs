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
page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()));

await page.goto(`${APP_URL}/login`);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await sleep(3500);
console.log('URL after login:', page.url());

// Ensure we are on /dashboard
await page.goto(`${APP_URL}/dashboard`);
await sleep(2000);
console.log('URL after goto dashboard:', page.url());

await page.screenshot({ path: path.join(SHOT_DIR, 'test-390-dark.png') });
console.log('Screenshot taken: test-390-dark.png');
await browser.close();
