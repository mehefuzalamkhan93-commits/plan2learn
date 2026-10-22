import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'ui-shots');
const APP_URL = 'http://localhost:3000';
const BACKEND_URL = 'http://127.0.0.1:8000/api/v1';
const EMAIL = 'mahafuzalamkhan25@gmail.com';
const PASSWORD = 'Temp@12345';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('1. Obtaining JWT access token from backend API...');
const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());

if (!loginRes?.data?.access_token) {
  throw new Error(`Failed to obtain access token: ${JSON.stringify(loginRes)}`);
}
const token = loginRes.data.access_token;
console.log('Token successfully obtained:', token.substring(0, 15) + '...');

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
});

// Inject authentication token on every page load
await ctx.addInitScript((jwt) => {
  localStorage.setItem('access_token', jwt);
}, token);

const page = await ctx.newPage();

const results = {
  startScreen: {},
  chatView: {},
  sourcesDrawer: {},
  lightMode: {},
  viewports: [],
  desktopPreservation: {},
};

// ====================================================================
// TEST 1: MOBILE AI ASSISTANT START SCREEN (Screen #1)
// ====================================================================
console.log('\n--- Test 1: Verifying Mobile AI Assistant Start Screen (Screen #1) ---');
await page.goto(`${APP_URL}/ai`);
await sleep(2000);

await page.evaluate(() => {
  localStorage.setItem('theme', 'dark');
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await sleep(500);

// If there are existing messages, start a fresh conversation to see Screen #1
const hasExistingMessages = await page.evaluate(() => {
  return document.querySelectorAll('main div.select-text').length > 0;
});
if (hasExistingMessages) {
  console.log('Clearing conversation to verify Start Screen #1...');
  await page.locator('button[aria-label="Start new chat"]').first().click();
  await sleep(1000);
}

const startScreenStats = await page.evaluate(() => {
  const heading = document.querySelector('h1')?.innerText?.trim();
  const heroTitle = document.querySelector('h2')?.innerText?.trim();
  const suggestions = Array.from(document.querySelectorAll('h3')).map((h) => h.innerText.trim());
  const hasBottomNav = !!document.querySelector('nav[aria-label="Mobile Navigation"]');
  const activeNav = document.querySelector('nav[aria-label="Mobile Navigation"] button[aria-current="page"]')?.innerText?.trim() || 'AI';

  return {
    heading,
    heroTitle,
    suggestions,
    hasBottomNav,
    activeNav,
  };
});

console.log('Start Screen stats:', JSON.stringify(startScreenStats));
results.startScreen = startScreenStats;
await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-ai-screen1-start-dark-390px.png') });

// ====================================================================
// TEST 2: CHAT VIEW (Screen #2 — ChatGPT Minimal Style)
// ====================================================================
console.log('\n--- Test 2: Sending Question & Verifying Minimal Chat View (Screen #2) ---');
// Click the first suggestion: "Explain a concept"
const explainBtn = page.locator('button:has-text("Explain a concept")').first();
await explainBtn.click();
console.log('Clicked "Explain a concept" suggestion, waiting for AI response...');
await page.locator('button[aria-label="Copy response"]').first().waitFor({ state: 'visible', timeout: 30000 });
await sleep(1000);

const chatViewStats = await page.evaluate(() => {
  const userBubble = document.querySelector('div.bg-indigo-600');
  const userText = userBubble ? userBubble.innerText.trim() : '';
  
  // Check if any avatars exist in the message stream
  const avatarsFound = document.querySelectorAll('main .rounded-full img, main [class*="avatar"]').length;
  
  const botMarkdown = document.querySelector('div.ai-markdown');
  const botText = botMarkdown ? botMarkdown.innerText.slice(0, 100) : '';

  const hasCopyBtn = !!document.querySelector('button[aria-label="Copy response"]');
  const hasThumbsUp = !!document.querySelector('button[aria-label="Helpful"]');
  const hasThumbsDown = !!document.querySelector('button[aria-label="Needs improvement"]');
  const hasSaveNote = !!document.querySelector('button[aria-label="Save as study note"]');

  const quickActionPills = Array.from(document.querySelectorAll('.fixed button span')).map(s => s.innerText.trim());

  return {
    userText,
    avatarsFound,
    botPreview: botText,
    hasCopyBtn,
    hasThumbsUp,
    hasThumbsDown,
    hasSaveNote,
    quickActionPills,
  };
});

console.log('Chat View stats:', JSON.stringify(chatViewStats));
results.chatView = chatViewStats;
await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-ai-screen2-chat-dark-390px.png') });

// Test Copy button
await page.locator('button[aria-label="Copy response"]').first().click();
await sleep(500);

// Test Save Note button
await page.locator('button[aria-label="Save as study note"]').first().click();
await sleep(1500);

// ====================================================================
// TEST 3: SOURCES PANEL DRAWER (Screen #3)
// ====================================================================
console.log('\n--- Test 3: Opening Sources Drawer (Screen #3) ---');
await page.locator('button[aria-label="Open Sources Panel"]').first().click();
await sleep(800);

const sourcesDrawerStats = await page.evaluate(() => {
  const title = Array.from(document.querySelectorAll('h3')).find(h => h.innerText.includes('Sources'))?.innerText?.trim();
  const filterPills = Array.from(document.querySelectorAll('button.rounded-full')).map(b => b.innerText.trim());
  const sourceItems = Array.from(document.querySelectorAll('h4')).map(h => h.innerText.trim());
  const checkboxes = document.querySelectorAll('button[aria-label*="source"]').length;

  return {
    title,
    filterPills,
    sourceCount: sourceItems.length,
    sourceTitles: sourceItems,
    checkboxes,
  };
});

console.log('Sources Drawer stats:', JSON.stringify(sourcesDrawerStats));
results.sourcesDrawer = sourcesDrawerStats;
await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-ai-screen3-sources-drawer-dark-390px.png') });

// Click filter: Notes inside Sources Drawer
const notesFilterBtn = page.locator('.fixed.inset-0.z-50 button:has-text("notes")').first();
if (await notesFilterBtn.count() > 0) {
  await notesFilterBtn.click();
  await sleep(400);
}

// Click filter: All inside Sources Drawer
const allFilterBtn = page.locator('.fixed.inset-0.z-50 button:has-text("all")').first();
if (await allFilterBtn.count() > 0) {
  await allFilterBtn.click();
  await sleep(400);
}

// Close Sources Drawer
await page.locator('.fixed.inset-0.z-50 button:has(svg.lucide-x)').first().click();
await sleep(600);

// Verify returning to same chat seamlessly
const stillInChat = await page.evaluate(() => {
  return document.querySelectorAll('main div.select-text').length > 0;
});
console.log('Returned to same chat conversation after closing sources drawer:', stillInChat);
results.sourcesDrawer.returnedToChat = stillInChat;

// ====================================================================
// TEST 4: LIGHT MODE CHAT (Screen #4)
// ====================================================================
console.log('\n--- Test 4: Verifying Light Mode Chat (Screen #4) ---');
await page.evaluate(() => {
  localStorage.setItem('theme', 'light');
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.add('light');
  document.documentElement.setAttribute('data-theme', 'light');
});
await sleep(600);
await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-ai-screen4-chat-light-390px.png') });

// Switch back to Dark Mode
await page.evaluate(() => {
  localStorage.setItem('theme', 'dark');
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await sleep(500);

// ====================================================================
// TEST 5: MULTI-VIEWPORT RESPONSIVENESS (320px - 480px)
// ====================================================================
console.log('\n--- Test 5: Testing Multi-Viewport Responsiveness (320px - 480px) ---');
const mobileWidths = [320, 360, 375, 390, 412, 430, 480];
for (const w of mobileWidths) {
  await page.setViewportSize({ width: w, height: 844 });
  await sleep(400);

  const overflowMetrics = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const bodyW = document.body.scrollWidth;
    const winW = window.innerWidth;
    const maxW = Math.max(docW, bodyW);
    return {
      maxW,
      winW,
      hasOverflow: maxW > winW,
    };
  });

  const shot = `mobile-ai-dark-${w}px.png`;
  await page.screenshot({ path: path.join(SHOT_DIR, shot) });
  console.log(`[Viewport ${w}px]: overflow=${overflowMetrics.hasOverflow} (${overflowMetrics.maxW}px / ${overflowMetrics.winW}px)`);
  results.viewports.push({ width: w, ...overflowMetrics, shot });
}

// ====================================================================
// TEST 6: DESKTOP PRESERVATION (1280px)
// ====================================================================
console.log('\n--- Test 6: Verifying Desktop AI Workspace Preservation (1280px) ---');
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${APP_URL}/ai`);
await sleep(1500);

const desktopStats = await page.evaluate(() => {
  const desktopHeader = document.querySelector('.hidden.lg\\:flex header');
  const hasDesktopSourcesBtn = Array.from(document.querySelectorAll('.hidden.lg\\:flex header button')).some(b => b.innerText.includes('Sources'));
  const hasDesktopStudioBtn = Array.from(document.querySelectorAll('.hidden.lg\\:flex header button')).some(b => b.innerText.includes('Studio'));
  const hasDesktopTabs = Array.from(document.querySelectorAll('.hidden.lg\\:flex nav button')).map(b => b.innerText.trim());
  const mobileNav = document.querySelector('nav[aria-label="Mobile Navigation"]');
  const isMobileNavHidden = !mobileNav || getComputedStyle(mobileNav).display === 'none';

  return {
    hasDesktopSourcesBtn,
    hasDesktopStudioBtn,
    hasDesktopTabs,
    isMobileNavHidden,
  };
});

console.log('Desktop AI Workspace stats:', JSON.stringify(desktopStats));
results.desktopPreservation = desktopStats;
await page.screenshot({ path: path.join(SHOT_DIR, 'desktop-ai-preservation-dark-1280px.png') });

fs.writeFileSync(path.join(SHOT_DIR, 'mobile-ai-test-report.json'), JSON.stringify(results, null, 2));
console.log('\nMobile AI Assistant test suite completed successfully!');

await browser.close();
