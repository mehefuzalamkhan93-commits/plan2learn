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
  dashboardShortcuts: {},
  avatarOpensProfile: {},
  moreOpensSettings: {},
  profilePersistence: {},
  desktopPreservation: {},
};

// ====================================================================
// TEST 1: DASHBOARD HEADER SHORTCUTS
// ====================================================================
console.log('\n--- Test 1: Verifying Mobile Dashboard Shortcuts ---');
await page.goto(`${APP_URL}/dashboard`);
await sleep(2000);

await page.evaluate(() => {
  localStorage.setItem('theme', 'dark');
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await sleep(500);

const dashCheck = await page.evaluate(() => {
  const header = document.querySelector('header');
  const headerButtons = Array.from(header ? header.querySelectorAll('button') : []).map(b => b.innerText.trim());
  const hasSettingsCard = headerButtons.some(txt => txt.includes('Settings'));
  const hasFocusRoom = headerButtons.some(txt => txt.includes('Focus Room'));
  const hasAiAssistant = headerButtons.some(txt => txt.includes('AI Assistant'));
  
  // Check if Focus Room is an inline-flex compact button rather than an oversized card
  const focusBtn = Array.from(header?.querySelectorAll('button') || []).find(b => b.innerText.includes('Focus Room'));
  const focusBtnRect = focusBtn ? focusBtn.getBoundingClientRect() : null;

  return {
    headerButtons,
    hasSettingsCard,
    hasFocusRoom,
    hasAiAssistant,
    focusBtnWidth: focusBtnRect?.width,
    focusBtnHeight: focusBtnRect?.height,
  };
});

console.log('Dashboard shortcuts check:', JSON.stringify(dashCheck));
results.dashboardShortcuts = dashCheck;

await page.screenshot({ path: path.join(SHOT_DIR, 'dashboard-no-settings-dark-390px.png') });

// In Light Mode
await page.evaluate(() => {
  localStorage.setItem('theme', 'light');
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.add('light');
  document.documentElement.setAttribute('data-theme', 'light');
});
await sleep(500);
await page.screenshot({ path: path.join(SHOT_DIR, 'dashboard-no-settings-light-390px.png') });

// Switch back to Dark Mode
await page.evaluate(() => {
  localStorage.setItem('theme', 'dark');
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-theme', 'dark');
});
await sleep(500);

// ====================================================================
// TEST 2: PROFILE AVATAR OPENS STUDENT PROFILE
// ====================================================================
console.log('\n--- Test 2: Clicking Profile Avatar at Upper-Right ---');
const avatarBtn = page.locator('button[aria-label="Open Student Profile"]');
await avatarBtn.click();
await sleep(1000);

const profileModalCheck = await page.evaluate(() => {
  const modal = document.querySelector('[role="dialog"]');
  const modalTitle = document.querySelector('#settings-modal-title')?.innerText?.trim();
  const profileTab = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.innerText.includes('Student Profile'));
  const isProfileTabActive = profileTab ? profileTab.className.includes('border-indigo-500') : false;
  const hasFullNameInput = !!document.querySelector('input[placeholder="e.g. Mahafuz Alam Khan"]');
  const hasEducationLevel = !!document.querySelector('select');
  const hasSaveButton = !!document.querySelector('button[form="profile-form"]');

  return {
    modalFound: !!modal,
    modalTitle,
    isProfileTabActive,
    hasFullNameInput,
    hasEducationLevel,
    hasSaveButton,
  };
});

console.log('Profile Avatar modal check:', JSON.stringify(profileModalCheck));
results.avatarOpensProfile = profileModalCheck;
await page.screenshot({ path: path.join(SHOT_DIR, 'avatar-opens-student-profile-dark.png') });

// Close the modal
await page.locator('button[aria-label="Close modal"]').click();
await sleep(600);

// ====================================================================
// TEST 3: MORE → SETTINGS & PREFERENCES OPENS SETTINGS TAB
// ====================================================================
console.log('\n--- Test 3: Opening More Drawer and Clicking Settings & Preferences ---');
// Open More drawer
await page.locator('nav[aria-label="Mobile Navigation"] button:has-text("More")').click();
await sleep(600);
await page.screenshot({ path: path.join(SHOT_DIR, 'more-drawer-dark-390px.png') });

// Click Settings & Preferences in More drawer
await page.locator('button:has-text("Settings & Preferences")').first().click();
await sleep(1000);

const settingsTabCheck = await page.evaluate(() => {
  const modal = document.querySelector('[role="dialog"]');
  const modalTitle = document.querySelector('#settings-modal-title')?.innerText?.trim();
  const settingsTab = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.innerText.includes('Settings & Preferences'));
  const isSettingsTabActive = settingsTab ? settingsTab.className.includes('border-indigo-500') : false;
  const hasThemeCard = Array.from(document.querySelectorAll('[role="dialog"] h4')).some(h => h.innerText.includes('Theme Appearance'));
  const hasLogoutSection = Array.from(document.querySelectorAll('[role="dialog"] button')).some(b => b.innerText.includes('Confirm & Log Out'));

  return {
    modalFound: !!modal,
    modalTitle,
    isSettingsTabActive,
    hasThemeCard,
    hasLogoutSection,
  };
});

console.log('More -> Settings check:', JSON.stringify(settingsTabCheck));
results.moreOpensSettings = settingsTabCheck;
await page.screenshot({ path: path.join(SHOT_DIR, 'more-opens-settings-preferences-dark.png') });

// ====================================================================
// TEST 4: THEME TOGGLE INSIDE SETTINGS & PREFERENCES
// ====================================================================
console.log('\n--- Test 4: Testing Theme Toggle inside Settings & Preferences ---');
const themeToggleBtn = page.locator('[role="dialog"] button:has-text("Switch to")').first();
if (await themeToggleBtn.count() > 0) {
  await themeToggleBtn.click();
  await sleep(600);
  console.log('Switched theme via Settings Modal');
  await page.screenshot({ path: path.join(SHOT_DIR, 'settings-modal-light-mode.png') });

  // Switch back
  await themeToggleBtn.click();
  await sleep(600);
  console.log('Switched back theme via Settings Modal');
}

// Close Settings Modal with Cancel or Close button
await page.locator('[role="dialog"] button:has-text("Cancel")').first().click();
await sleep(600);

// ====================================================================
// TEST 5: PROFILE EDITING & DATABASE PERSISTENCE
// ====================================================================
console.log('\n--- Test 5: Testing Profile Edit & Backend Persistence ---');
await page.locator('button[aria-label="Open Student Profile"]').click();
await sleep(1000);

// Change Score Goal
const scoreInput = page.locator('input[placeholder="e.g. 90"]');
await scoreInput.fill('94');
await sleep(300);

// Save Changes
await page.locator('button[form="profile-form"]').click();
await sleep(2500);

// Reload the page completely
await page.reload();
await sleep(2000);

// Check if scoreGoal persisted in profile
await page.locator('button[aria-label="Open Student Profile"]').click();
await sleep(1000);

const persistedScore = await page.locator('input[placeholder="e.g. 90"]').inputValue();
console.log('Persisted Score Goal after reload:', persistedScore);
results.profilePersistence = {
  scoreGoalValue: persistedScore,
  persisted: persistedScore === '94',
};

// Reset score goal to 90
await page.locator('input[placeholder="e.g. 90"]').fill('90');
await page.locator('button[form="profile-form"]').click();
await sleep(2500);
await page.keyboard.press('Escape');
await sleep(600);

// ====================================================================
// TEST 6: DESKTOP PRESERVATION (1280px)
// ====================================================================
console.log('\n--- Test 6: Verifying Desktop Dashboard Preservation (1280px) ---');
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${APP_URL}/dashboard`);
await sleep(1500);

const desktopStats = await page.evaluate(() => {
  const hasSettingsButton = !!document.querySelector('.hidden.lg\\:block button[title="Settings & Profile"]');
  const hasFocusRoomLink = Array.from(document.querySelectorAll('.hidden.lg\\:block a')).some(a => a.innerText.includes('Focus Room'));
  const hasAiAssistantLink = Array.from(document.querySelectorAll('.hidden.lg\\:block a')).some(a => a.innerText.includes('AI Assistant'));
  const mobileNav = document.querySelector('nav[aria-label="Mobile Navigation"]');
  const isMobileNavHidden = !mobileNav || getComputedStyle(mobileNav).display === 'none';

  return {
    hasSettingsButton,
    hasFocusRoomLink,
    hasAiAssistantLink,
    isMobileNavHidden,
  };
});

console.log('Desktop Dashboard stats:', JSON.stringify(desktopStats));
results.desktopPreservation = desktopStats;
await page.screenshot({ path: path.join(SHOT_DIR, 'desktop-dashboard-settings-preserved-1280px.png') });

fs.writeFileSync(path.join(SHOT_DIR, 'settings-fix-test-report.json'), JSON.stringify(results, null, 2));
console.log('\nSettings entry point fix test suite completed successfully!');

await browser.close();
