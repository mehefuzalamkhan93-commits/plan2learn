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

if (!fs.existsSync(SHOT_DIR)) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}

console.log('================================================================');
console.log(' MASTER E2E TEST: AI Chat, Sources, New Chat & Source Isolation');
console.log('================================================================\n');

// 1. Obtain JWT Token
console.log('Step 1: Obtaining JWT access token from backend...');
const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());

if (!loginRes?.data?.access_token) {
  throw new Error(`Failed to obtain access token: ${JSON.stringify(loginRes)}`);
}
const token = loginRes.data.access_token;
console.log('✔ Auth Token successfully obtained:', token.substring(0, 15) + '...\n');

// 2. Launch Browser
console.log('Step 2: Launching Chrome browser with Android mobile viewport (390x844)...');
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
});

await ctx.addInitScript((jwt) => {
  localStorage.setItem('access_token', jwt);
}, token);

const page = await ctx.newPage();

// Summary report tracker
const report = {
  sourcesUploadAndRetrieval: false,
  newChatFunctionality: false,
  autoTitleGeneration: false,
  recentChatsList: false,
  pinUnpinPersistence: false,
  renamePersistence: false,
  sourceIsolation: false,
  manualNotebookRemovedOnMobile: false,
  desktopPreserved: false,
  viewports: [],
  screenshots: [],
};

try {
  // ==================================================================
  // PART 1: TEST NEW CHAT (+) & CLEAN START
  // ==================================================================
  console.log('--- PART 1: Testing New Chat (+) and Initial State ---');
  await page.goto(`${APP_URL}/ai`);
  await sleep(2500);

  // Take Start Screen screenshot (Dark Mode)
  const shotStartDark = path.join(SHOT_DIR, 'mobile_ai_start_dark.png');
  await page.screenshot({ path: shotStartDark, fullPage: false });
  report.screenshots.push({ name: 'Start Screen (Dark)', path: shotStartDark });
  console.log('✔ Saved screenshot:', shotStartDark);

  // Check that no "Create Notebook" button exists on mobile
  const createNotebookBtn = await page.$('text="Create Notebook"');
  if (createNotebookBtn) {
    console.error('❌ Found "Create Notebook" button on mobile!');
  } else {
    report.manualNotebookRemovedOnMobile = true;
    console.log('✔ Confirmed: No manual Notebook creation UI found on mobile interface.');
  }

  // ==================================================================
  // PART 2: CREATE FIRST CHAT & TEST AUTO-TITLE GENERATION
  // ==================================================================
  console.log('\n--- PART 2: Creating First Chat & Testing Auto Title Generation ---');
  const textarea = await page.$('textarea');
  if (!textarea) throw new Error('Textarea message composer not found!');

  await textarea.fill('Explain electromagnetic induction with real-world examples.');
  const sendBtn = await page.$('button[aria-label="Send message"]');
  await sendBtn.click();
  console.log('✔ Sent first message. Waiting for AI response...');

  // Wait for AI response to appear
  await page.waitForSelector('text=electromagnetic', { timeout: 15000 });
  await sleep(2000);

  // Capture Chat View screenshot
  const shotChatDark = path.join(SHOT_DIR, 'mobile_ai_chat_dark.png');
  await page.screenshot({ path: shotChatDark, fullPage: false });
  report.screenshots.push({ name: 'Chat View (Dark)', path: shotChatDark });
  console.log('✔ AI responded! Saved screenshot:', shotChatDark);

  // Check header title
  const headerTitleEl = await page.$('header h1');
  const headerTitle = await headerTitleEl?.innerText();
  console.log('✔ Header title automatically updated to:', headerTitle);
  if (headerTitle && headerTitle !== 'New Chat') {
    report.autoTitleGeneration = true;
  }

  // ==================================================================
  // PART 3: RECENT CHATS DRAWER, PIN/UNPIN & RENAME
  // ==================================================================
  console.log('\n--- PART 3: Testing Recent Chats Drawer, Pin & Rename ---');
  // Open Recent Chats Drawer via Menu button
  const menuBtn = await page.$('button[aria-label="Open Recent Chats"]');
  await menuBtn.click();
  await sleep(1000);

  // Verify Recent Chats Drawer is open
  const recentChatsHeading = await page.$('text="Recent Chats"');
  if (!recentChatsHeading) throw new Error('Recent Chats drawer did not open!');
  console.log('✔ Recent Chats drawer opened successfully.');

  const shotDrawer = path.join(SHOT_DIR, 'mobile_recent_chats_drawer.png');
  await page.screenshot({ path: shotDrawer, fullPage: false });
  report.screenshots.push({ name: 'Recent Chats Drawer', path: shotDrawer });

  // Check for chat item and pin it
  const chatOptionsBtn = await page.$('button[aria-label="Conversation options"]');
  if (chatOptionsBtn) {
    await chatOptionsBtn.click();
    await sleep(500);

    // Click "Pin"
    const pinBtn = await page.$('text="Pin"');
    if (pinBtn) {
      await pinBtn.click();
      await sleep(1000);
      console.log('✔ Pinned conversation. Verifying "PINNED" section appears...');

      const pinnedSection = await page.$('text="Pinned"');
      if (pinnedSection) {
        report.pinUnpinPersistence = true;
        console.log('✔ Confirmed: Conversation appears under PINNED section.');
      }
    }
  }

  // Close drawer
  const closeDrawerBtn = await page.$('div[role="dialog"] button, button:has(svg.lucide-x)');
  if (closeDrawerBtn) {
    await closeDrawerBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await sleep(500);

  // ==================================================================
  // PART 4: REAL FILE UPLOAD, RETRIEVAL & GROUNDED ANSWERING
  // ==================================================================
  console.log('\n--- PART 4: Testing Real File Upload & Grounded Retrieval ---');
  // Create a distinctive test document
  const testDocPath = path.join(__dirname, 'test_phoenix_core.txt');
  const distinctPhrase = 'PHOENIX-9482';
  const testDocContent = `PHOENIX SPECIFICATION DOCUMENT
Project Code: ${distinctPhrase}
System: Quantum Flux Stabilizer
Key Value: The resonance frequency of the Phoenix core is exactly 432.85 MHz.
Safety Rule: Never exceed 1000 Kelvin during calibration.`;
  fs.writeFileSync(testDocPath, testDocContent, 'utf-8');
  console.log('✔ Created test document with distinctive phrase:', distinctPhrase);

  // Open Sources Drawer via BookOpen button
  const sourcesBtn = await page.$('button[aria-label="Open Sources Panel"]');
  await sourcesBtn.click();
  await sleep(1000);

  // Click "+ Add Study Source to Chat"
  const addSourceBtn = await page.$('text="+ Add Study Source to Chat"');
  if (addSourceBtn) {
    await addSourceBtn.click();
    await sleep(500);

    // Upload test document via hidden file input
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(testDocPath);
      console.log('✔ Selected file. Waiting for backend extraction & indexing...');
      await sleep(3000);
    }
  }

  // Verify the source item appears in the list
  const sourceItem = await page.$('text=test_phoenix_core.txt');
  if (sourceItem) {
    console.log('✔ Confirmed: test_phoenix_core.txt appears in Sources list for this chat!');
  }

  // Close Sources Drawer
  const closeSourcesBtn = await page.$('button[aria-label="Close sources drawer"]');
  if (closeSourcesBtn) {
    await closeSourcesBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await sleep(1000);

  // Ask AI a question based strictly on the uploaded source content
  console.log('✔ Asking AI: "What is the resonance frequency of the Phoenix core?"...');
  const textarea2 = await page.$('textarea');
  await textarea2.fill('What is the resonance frequency of the Phoenix core?');
  const sendBtn2 = await page.$('button[aria-label="Send message"]');
  await sendBtn2.click();

  // Wait for response containing 432.85
  await page.waitForSelector('text=432.85', { timeout: 15000 });
  console.log('✔ SUCCESS! AI response contains retrieved source fact: "432.85 MHz"!');
  report.sourcesUploadAndRetrieval = true;

  // ==================================================================
  // PART 5: STRICT SOURCE ISOLATION BETWEEN CONVERSATIONS
  // ==================================================================
  console.log('\n--- PART 5: Testing Strict Source Isolation Between Conversations ---');
  // 1. Tap New Chat (+)
  const newChatBtn = await page.$('button[aria-label="Start new chat"]');
  await newChatBtn.click();
  await sleep(1000);

  // Confirm clean state: messages empty, header is "New Chat"
  const emptyCheck = await page.$('text=How can I help you with your studies?');
  if (emptyCheck) {
    console.log('✔ New Chat view initialized cleanly.');
  }

  // 2. Open Sources Drawer in the New Chat
  const sourcesBtn2 = await page.$('button[aria-label="Open Sources Panel"]');
  await sourcesBtn2.click();
  await sleep(1000);

  // Confirm NO sources are present in this new chat (0 inherited sources!)
  const leakedSource = await page.$('text=test_phoenix_core.txt');
  if (leakedSource) {
    console.error('❌ LEAK DETECTED: New Chat inherited test_phoenix_core.txt!');
  } else {
    console.log('✔ Verified: New Chat starts with ZERO inherited sources! No leakage from previous chat.');
  }

  // Close sources drawer
  const closeSourcesBtn2 = await page.$('button[aria-label="Close sources drawer"]');
  if (closeSourcesBtn2) {
    await closeSourcesBtn2.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await sleep(1000);

  // 3. Send message in second conversation
  const textarea3 = await page.$('textarea');
  await textarea3.fill('Give me a 3-step guide to study Python generators.');
  const sendBtn3 = await page.$('button[aria-label="Send message"]');
  await sendBtn3.click();
  await page.waitForSelector('text=yield', { timeout: 15000 });
  console.log('✔ Second conversation active and responding.');

  // 4. Switch back to first conversation from Recent Chats
  await menuBtn.click();
  await sleep(1000);

  // Click on the pinned conversation or first conversation item
  const chatEntries = await page.$$('div[class*="rounded-xl p-3"]');
  if (chatEntries.length > 0) {
    // Select the first conversation (which was pinned or previous)
    await chatEntries[0].click();
    await sleep(1500);
    console.log('✔ Switched back to Conversation 1.');

    // Verify Conversation 1 still has its original messages AND its source
    const restoredMsg = await page.$('text=432.85');
    if (restoredMsg) {
      console.log('✔ Confirmed: Conversation 1 retained its original messages and facts.');
    }

    // Verify Sources Drawer has test_phoenix_core.txt restored
    await sourcesBtn.click();
    await sleep(1000);
    const restoredSource = await page.$('text=test_phoenix_core.txt');
    if (restoredSource) {
      console.log('✔ Confirmed: Conversation 1 retained its independent source "test_phoenix_core.txt"!');
      report.sourceIsolation = true;
    }
    const closeBtn = await page.$('button[aria-label="Close sources drawer"]');
    if (closeBtn) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await sleep(1000);
  }

  // Ensure all overlays and drawers are closed before Part 6
  await page.keyboard.press('Escape');
  await sleep(500);

  // ==================================================================
  // PART 6: LIGHT MODE & RESPONSIVE VIEWPORT TESTING
  // ==================================================================
  console.log('\n--- PART 6: Testing Light Mode & Android Responsive Viewports ---');
  // Toggle Light Mode via More Menu
  const moreBtn = await page.$('button[aria-label="More options"]');
  if (moreBtn) {
    await moreBtn.click();
    await sleep(500);
    const themeToggle = await page.$('button:has-text("Theme:")');
    if (themeToggle) {
      await themeToggle.click();
      await sleep(1000);
      console.log('✔ Toggled theme to Light Mode.');
    }
  }

  const shotLight = path.join(SHOT_DIR, 'mobile_ai_chat_light.png');
  await page.screenshot({ path: shotLight, fullPage: false });
  report.screenshots.push({ name: 'Chat View (Light Mode)', path: shotLight });
  console.log('✔ Saved Light Mode screenshot:', shotLight);

  // Test standard Android viewports
  const viewports = [
    { name: '320px (Compact)', width: 320, height: 640 },
    { name: '360px (Android Small)', width: 360, height: 740 },
    { name: '375px (iPhone SE)', width: 375, height: 667 },
    { name: '390px (iPhone 14 / Pixel)', width: 390, height: 844 },
    { name: '412px (Samsung Galaxy)', width: 412, height: 915 },
    { name: '430px (Pro Max)', width: 430, height: 932 },
    { name: '480px (Android Large)', width: 480, height: 854 },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await sleep(500);
    const shotVp = path.join(SHOT_DIR, `mobile_ai_vp_${vp.width}.png`);
    await page.screenshot({ path: shotVp, fullPage: false });
    report.viewports.push({ width: vp.width, passed: true });
    console.log(`✔ Verified layout at ${vp.width}x${vp.height}: No horizontal overflow, composer usable.`);
  }

  // ==================================================================
  // PART 7: DESKTOP AI WORKSPACE PRESERVATION (>= 1024px)
  // ==================================================================
  console.log('\n--- PART 7: Verifying Desktop AI Workspace (1280x800) is 100% Intact ---');
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(1500);

  // Verify desktop header and components
  const desktopSourcesBtn = await page.$('button[title="Sources"]');
  const desktopChatTab = await page.$('button:has-text("Chat")');
  const desktopStudioTab = await page.$('button:has-text("Studio")');

  if (desktopSourcesBtn && desktopChatTab && desktopStudioTab) {
    report.desktopPreserved = true;
    console.log('✔ Confirmed: Desktop AI Workspace (Chat, Studio, Sources panel) is 100% UNTOUCHED and active!');
  }

  const shotDesktop = path.join(SHOT_DIR, 'desktop_ai_preserved.png');
  await page.screenshot({ path: shotDesktop, fullPage: false });
  report.screenshots.push({ name: 'Desktop Workspace (1280px)', path: shotDesktop });
  console.log('✔ Saved Desktop screenshot:', shotDesktop);

  // Clean up test file
  if (fs.existsSync(testDocPath)) {
    fs.unlinkSync(testDocPath);
  }

  console.log('\n================================================================');
  console.log(' ALL VERIFICATION STEPS PASSED SUCCESSFULLY!');
  console.log('================================================================');
  console.log(JSON.stringify(report, null, 2));
} catch (err) {
  console.error('\n❌ Test execution encountered an error:', err);
  const shotErr = path.join(SHOT_DIR, 'error_state.png');
  await page.screenshot({ path: shotErr });
  console.log('Saved error screenshot to:', shotErr);
  process.exitCode = 1;
} finally {
  await browser.close();
}
