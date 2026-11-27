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
 * Custom network throttling for Lighthouse testing using Puppeteer.
 *
 * Chrome is launched by Puppeteer, custom network conditions are established
 * through Puppeteer's API, and Lighthouse audits the page with those settings.
 */

import {writeFile} from 'node:fs/promises';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer';

const url = process.env.URL || 'https://chromestatus.com/roadmap';

// Use Puppeteer to launch headless Chrome.
const browser = await puppeteer.launch();
const page = await browser.newPage();

// Apply custom network throttling via Puppeteer before handing the page to Lighthouse.
await page.emulateNetworkConditions({
  offline: false,
  latency: 800,
  download: Math.floor((1.6 * 1024 * 1024) / 8), // 1.6 Mbps
  upload: Math.floor((750 * 1024) / 8), // 750 Kbps
});

// Pass the Puppeteer page directly to Lighthouse with throttlingMethod: 'provided'.
const {report} = await lighthouse(
  url,
  {
    output: 'html',
    logLevel: 'info',
    throttlingMethod: 'provided',
  },
  undefined,
  page
);

// Save HTML report.
await writeFile('results.html', report, 'utf8');
console.log('Results written to results.html.');

await browser.close();
