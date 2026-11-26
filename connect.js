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
 * @fileoverview
 *
 * Demonstrates how to use puppeteer.connect() to re-connect to an instance of
 * Chrome that's already running with remote debugging enabled.
 *
 * The first time you run this script, it will launch Chrome and print
 * the remote debugging websocket url.
 *
 *     node connect.js
 *
 * The second time you run the script, pass the websocket URL as an env variable.
 * Puppeteer will reconnect to the running browser instance instead of
 * launching a new browser.
 *
 *     wsURL=ws://127.0.0.1:9222/devtools/browser/72775377-7f73-4436 node connect.js
 */

import path from 'node:path';
import puppeteer from 'puppeteer';

const browserWSEndpoint = process.env.wsURL || null;

if (!browserWSEndpoint) {
  const browser = await puppeteer.launch({
    handleSIGINT: false, // so Chrome doesn't exit when we quit Node.
    headless: false, // to see what's happening
  });

  console.log('1. Quit this script (cmd/ctrl+C).');
  console.log('2. Chrome will still be running.');
  console.log('3. Re-run the script with:');
  console.log(`   wsURL=${browser.wsEndpoint()} node ${path.basename(import.meta.filename)}`);
  console.log('4. Puppeteer will reconnect to the existing Chrome instead of launching a new browser.');
} else {
  console.log('Reconnecting to existing Chrome....');
  const browser = await puppeteer.connect({browserWSEndpoint});
  const page = await browser.newPage();
  await page.goto('https://developer.chrome.com/');

  console.log('Page title:', await page.title());

  await browser.close();
}
