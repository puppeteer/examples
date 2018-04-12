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
 * Shows how to use raw web sockets to send messages to the page using
 * the DevTools protocol.
 * See https://chromedevtools.github.io/devtools-protocol/
 */

const {URL} = require('url');
const WebSocket = require('ws');
const puppeteer = require('puppeteer');

const url = process.env.URL || 'https://example.com';

(async() => {

const browser = await puppeteer.launch();
const page = await browser.newPage();

// // 1. createCDPSession() is the easiest way to work with the raw DTP:
// const client = await page.target().createCDPSession();
// const version = await client.send('Browser.getVersion');
// console.log(version);

// 2.But you can also use raw websockets...

// Pull page's ws:// debugging url.
const wsUrl = new URL(browser.wsEndpoint());
const resp = await page.goto(`http://localhost:${wsUrl.port}/json`);
const {webSocketDebuggerUrl} = (await resp.json())[0];

await page.goto(url); // Navigate to actual page.

// Connect to page's ws:// endpoint.
const ws = new WebSocket(webSocketDebuggerUrl).on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {expression: 'document.title'} // return the page title.
  }));
}).on('message', async data => {
  console.log('Title of page:', JSON.parse(data).result.result.value);
  ws.close();
  await browser.close();
});

})();
