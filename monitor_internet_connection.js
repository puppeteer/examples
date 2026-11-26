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
 * Uses Puppeteer and the browser's online/offline events to monitor internet
 * connection status.
 */

import {lookupService} from 'node:dns/promises';
import {EventEmitter} from 'node:events';
import puppeteer from 'puppeteer';

async function isConnected() {
  try {
    await lookupService('8.8.8.8', 53);
    return true;
  } catch {
    return false;
  }
}

const browser = await puppeteer.launch();
const page = await browser.newPage();
const events = new EventEmitter();

events.on('online', () => console.info('Online!'));
events.on('offline', () => console.info('Offline!'));

// Adds window.connectionChange in page.
await page.exposeFunction('connectionChange', async () => {
  // Since online/offline events aren't 100% reliable, do an
  // actual dns lookup to verify connectivity.
  const isReallyConnected = await isConnected();
  events.emit(isReallyConnected ? 'online' : 'offline');
});

// Monitor browser online/offline events in the page.
await page.evaluateOnNewDocument(() => {
  window.addEventListener('online', () => window.connectionChange(navigator.onLine));
  window.addEventListener('offline', () => window.connectionChange(navigator.onLine));
});

// Kick off a navigation so evaluateOnNewDocument runs.
await page.goto('data:text/html,hi');

// ... do other stuff ...
// await browser.close(); // Don't close the browser so we can monitor!
