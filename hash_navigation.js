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
 * Hash (#) changes aren't considered navigations in Chrome. This makes it
 * tricky to test a SPA that uses hashes to change views.
 *
 * This script shows how to observe the view of a SPA changing in Puppeteer
 * by injecting code into the page that listens for `hashchange` events.
 *
 * Run:
 *   node hash_navigation.js
 */

import {EventEmitter} from 'node:events';
import http from 'node:http';
import puppeteer from 'puppeteer';

const SPA_HTML = `<!DOCTYPE html>
<html>
  <head>
    <style>
      section { display: none; }
      section:target { display: block; }
    </style>
  </head>
  <body>
    <section id="page1">View 1</section>
    <section id="page2">View 2</section>
    <script>
      const update = () => {
        if (!location.hash) location.hash = '#page1';
        document.body.dataset.page = location.hash;
      };
      addEventListener('hashchange', update);
      update();
    </script>
  </body>
</html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(SPA_HTML);
});

await new Promise(resolve => server.listen(0, resolve));
const {port} = server.address();
const url = process.env.URL || `http://localhost:${port}/`;

async function printVisibleView(page) {
  console.log('Visible panel:', await page.$eval(':target', el => el.textContent));
}

const browser = await puppeteer.launch();
const page = await browser.newPage();
const events = new EventEmitter();

// Catch + "forward" hashchange events from page to Node.
await page.exposeFunction('onHashChange', href => events.emit('hashchange', href));
await page.evaluateOnNewDocument(() => {
  addEventListener('hashchange', () => window.onHashChange(location.href));
});

// Listen for hashchange events in Node Puppeteer code.
events.on('hashchange', href => console.log('hashchange event:', new URL(href).hash));

await page.goto(url);
await page.waitForSelector('[data-page="#page1"]'); // wait for view 1 to be "loaded".
await printVisibleView(page);

// "Navigate" to view 2 in SPA.
await page.goto(`${url}#page2`);

await page.waitForSelector('[data-page="#page2"]'); // wait for view 2 to be "loaded".
await printVisibleView(page);

await browser.close();
server.close();
