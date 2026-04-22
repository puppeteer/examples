/**
 * Copyright 2026 Human Pages. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Demonstrates a human-in-the-loop fallback pattern for Puppeteer automations.
 *
 * When the browser hits a blocker it can't handle (CAPTCHA, Cloudflare
 * challenge, login wall, or age gate), the script posts a job to the
 * Human Pages API (https://humanpages.ai) so a real person can solve it,
 * then resumes automation once the task is complete.
 *
 * Usage:
 *   HUMAN_PAGES_API_KEY=hp_xxx URL=https://example.com node human_fallback.js
 *
 * Environment variables:
 *   URL                   - The page to navigate to (default: https://example.com)
 *   HUMAN_PAGES_API_KEY   - Your Human Pages API key (required for fallback)
 *   POLL_INTERVAL_MS      - How often to check job status (default: 10000)
 *   DEADLINE_HOURS        - Deadline for the human task (default: 1)
 */

const puppeteer = require('puppeteer');
const fetch = require('node-fetch');

const URL = process.env.URL || 'https://example.com';
const API_KEY = process.env.HUMAN_PAGES_API_KEY;
const BASE_URL = 'https://humanpages.ai';
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MS) || 10_000;
const DEADLINE_HOURS = Number(process.env.DEADLINE_HOURS) || 1;

// ---------------------------------------------------------------------------
// Blocker detection
// ---------------------------------------------------------------------------

/**
 * Inspects the current page and returns a description of the blocker if one
 * is detected, or null if the page looks clear.
 */
async function detectBlocker(page) {
  return page.evaluate(() => {
    const body = document.body ? document.body.innerText.toLowerCase() : '';
    const html = document.documentElement.innerHTML.toLowerCase();

    // Cloudflare challenge / interstitial
    if (
      html.includes('cf-challenge') ||
      html.includes('cloudflare') && html.includes('ray id') ||
      body.includes('checking your browser')
    ) {
      return 'Cloudflare challenge detected';
    }

    // Generic CAPTCHA (reCAPTCHA, hCaptcha, Turnstile)
    if (
      html.includes('recaptcha') ||
      html.includes('hcaptcha') ||
      html.includes('cf-turnstile') ||
      document.querySelector('iframe[src*="recaptcha"]') ||
      document.querySelector('iframe[src*="hcaptcha"]')
    ) {
      return 'CAPTCHA detected';
    }

    // Login / sign-in wall
    if (
      document.querySelector('form[action*="login"]') ||
      document.querySelector('form[action*="signin"]') ||
      document.querySelector('input[type="password"]') &&
        (body.includes('sign in') || body.includes('log in'))
    ) {
      return 'Login wall detected';
    }

    // Age verification gate
    if (
      body.includes('verify your age') ||
      body.includes('age verification') ||
      body.includes('are you over')
    ) {
      return 'Age verification gate detected';
    }

    return null;
  });
}

// ---------------------------------------------------------------------------
// Human Pages API helpers
// ---------------------------------------------------------------------------

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Agent-Key': API_KEY,
  };
}

async function searchHumans() {
  const res = await fetch(
    `${BASE_URL}/api/humans/search?skill=web+task&available=true`,
    {headers: apiHeaders()}
  );
  if (!res.ok) throw new Error(`Search failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function createJob(humanId, blockerDescription, pageUrl) {
  const res = await fetch(`${BASE_URL}/api/jobs`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      humanId,
      title: `Solve page blocker on ${new globalThis.URL(pageUrl).hostname}`,
      description: [
        `URL: ${pageUrl}`,
        `Blocker: ${blockerDescription}`,
        '',
        'Please navigate to the URL above, solve the blocker (CAPTCHA, login,',
        'challenge, etc.), and paste the resulting page content or confirm when',
        'the page is accessible.',
      ].join('\n'),
      priceUsdc: 2,
      deadlineHours: DEADLINE_HOURS,
    }),
  });
  if (!res.ok) throw new Error(`Job creation failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function pollJobUntilDone(jobId) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${BASE_URL}/api/jobs/${jobId}`, {
      headers: apiHeaders(),
    });
    if (!res.ok) throw new Error(`Job status check failed: ${res.status}`);

    const job = await res.json();
    console.log(`  Job ${jobId} status: ${job.status}`);

    if (job.status === 'completed') return job;
    if (job.status === 'cancelled' || job.status === 'expired') {
      throw new Error(`Job ${jobId} ended with status: ${job.status}`);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

async function getJobMessages(jobId) {
  const res = await fetch(`${BASE_URL}/api/jobs/${jobId}/messages`, {
    headers: apiHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  console.log(`Navigating to ${URL} ...`);
  await page.goto(URL, {waitUntil: 'networkidle2'});

  const blocker = await detectBlocker(page);

  if (!blocker) {
    console.log('No blocker detected. Page loaded successfully.');
    const title = await page.title();
    console.log(`Page title: ${title}`);
    await browser.close();
    return;
  }

  console.log(`Blocker found: ${blocker}`);

  if (!API_KEY) {
    console.error(
      'HUMAN_PAGES_API_KEY is not set. Cannot request human help.\n' +
      'Get an API key at https://humanpages.ai and set the env variable.'
    );
    await browser.close();
    process.exit(1);
  }

  // 1. Find an available human
  console.log('Searching for available humans on Human Pages ...');
  const humans = await searchHumans();
  if (!humans.length) {
    console.error('No humans available right now. Try again later.');
    await browser.close();
    process.exit(1);
  }
  const human = humans[0];
  console.log(`  Found human: ${human.name || human.id}`);

  // 2. Create a job
  console.log('Creating job ...');
  const job = await createJob(human.id, blocker, URL);
  console.log(`  Job created: ${job.id}`);

  // 3. Wait for completion
  console.log(`Waiting for human to solve the blocker (polling every ${POLL_INTERVAL / 1000}s) ...`);
  await pollJobUntilDone(job.id);
  console.log('Human completed the task!');

  // 4. Fetch messages for context the human may have left
  const messages = await getJobMessages(job.id);
  if (messages.length) {
    console.log('Messages from the human:');
    for (const msg of messages) {
      console.log(`  [${msg.role}] ${msg.content}`);
    }
  }

  // 5. Retry the page now that the blocker should be resolved
  console.log('Retrying page navigation ...');
  await page.goto(URL, {waitUntil: 'networkidle2'});

  const retryBlocker = await detectBlocker(page);
  if (retryBlocker) {
    console.warn(`Blocker still present after human intervention: ${retryBlocker}`);
  } else {
    console.log('Page loaded successfully after human intervention.');
    const title = await page.title();
    console.log(`Page title: ${title}`);
  }

  await browser.close();
})();
