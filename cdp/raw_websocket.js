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
 * Shows how to use raw WebSockets (via Node's built-in WebSocket) to send
 * messages to the page using the Chrome DevTools Protocol.
 * See https://chromedevtools.github.io/devtools-protocol/
 */

import puppeteer from 'puppeteer';

const url = process.env.URL || 'https://developer.chrome.com/';

const browser = await puppeteer.launch();
const page = await browser.newPage();

// 1. page.createCDPSession() is the easiest way to work with raw CDP:
// const client = await page.createCDPSession();
// const version = await client.send('Browser.getVersion');
// console.log(version);

// 2. Or you can use raw WebSockets directly:

// Pull the page's ws:// debugging URL.
const wsUrl = new URL(browser.wsEndpoint());
const resp = await fetch(`http://localhost:${wsUrl.port}/json`);
const targets = await resp.json();
const {webSocketDebuggerUrl} = targets.find(t => t.type === 'page');

await page.goto(url); // Navigate to actual page.

// Connect to the page's ws:// endpoint using Node's built-in WebSocket.
const ws = new WebSocket(webSocketDebuggerUrl);

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {expression: 'document.title'}, // return the page title.
  }));
});

ws.addEventListener('message', async event => {
  const {result} = JSON.parse(event.data);
  console.log('Title of page:', result.result.value);
  ws.close();
  await browser.close();
});
