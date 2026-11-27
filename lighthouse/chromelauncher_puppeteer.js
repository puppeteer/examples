/**
 * Copyright 2018 Google Inc. All rights reserved.
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
 *
 * @author ebidel@ (Eric Bidelman)
 */

/**
 * How to:
 * 1. Use chrome-launcher to launch Chrome.
 * 2. Connect to that browser instance using Puppeteer.
 * 3. Run Lighthouse on the page.
 */

import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer';

const URL = process.env.URL || 'https://chromestatus.com/roadmap';

const opts = {
  chromeFlags: ['--headless=new'],
  logLevel: 'info',
  output: 'json',
};

// Launch Chrome using chrome-launcher.
const chrome = await chromeLauncher.launch(opts);
opts.port = chrome.port;

// Connect to it using puppeteer.connect().
const resp = await fetch(`http://localhost:${opts.port}/json/version`);
const {webSocketDebuggerUrl} = await resp.json();
const browser = await puppeteer.connect({browserWSEndpoint: webSocketDebuggerUrl});

// Run Lighthouse.
const {lhr} = await lighthouse(URL, opts);
console.log(
  `Lighthouse scores: ${Object.values(lhr.categories).map(c => `${c.title} ${c.score}`).join(', ')}`
);

await browser.disconnect();
await chrome.kill();
