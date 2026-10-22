/** Drawer layout check: Studio + Sources must be side panels (chat visible) below 1024px; phones (<768px) keep overlay. */
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

for (let i = 0; i < 30; i++) {
  try { await fetch(`${APP_URL}/login`); break; } catch { await sleep(1000); }
}

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

// Spawn fallback server if needed
let up = true;
try { await fetch(`${APP_URL}/login`); } catch {
  const { spawn } = await import('node:child_process');
  spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', '3000'], {
    cwd: path.join(__dirname, '..'), detached: true, stdio: 'ignore',
  }).unref();
  for (let i = 0; i < 30; i++) { try { await fetch(`${APP_URL}/login`); up = true; break; } catch { await sleep(1000); } }
}

for (const [w, h, fp] of [[900, 850, '900px'], [1366, 850, '1366px'], [600, 850, '600px-phone']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => localStorage.setItem('theme', 'light'));
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !/login/.test(u.pathname), { timeout: 20000 });
  await page.goto(`${APP_URL}/ai`, { waitUntil: 'networkidle' });
  await sleep(1500);

  await page.getByRole('button', { name: /Studio/i }).first().click();
  await sleep(700);
  const metrics = await page.evaluate(() => {
    const aside = document.querySelector('aside[data-drawer="studio"]');
    const chat = document.querySelector('.chat-wallpaper');
    const scrim = [...document.querySelectorAll('div')].find(
      (d) => getComputedStyle(d).position === 'fixed' && d.className.includes('bg-black/75') && d.getAttribute('aria-hidden') === 'true'
    );
    return {
      drawerPos: aside ? getComputedStyle(aside).position : null,
      drawerW: aside ? Math.round(aside.getBoundingClientRect().width) : null,
      chatW: chat ? Math.round(chat.getBoundingClientRect().width) : null,
      chatVisible: chat ? chat.getBoundingClientRect().width > 100 : false,
      scrimPresent: !!scrim,
      scrimH: scrim ? Math.round(scrim.getBoundingClientRect().height) : 0,
    };
  });
  console.log(`${fp}:`, JSON.stringify(metrics));
  await page.screenshot({ path: path.join(SHOT_DIR, `studio-open-${fp}.png`) });
  await ctx.close();
}
await browser.close();
