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
 * Takes a screenshot of a DOM element on a page and creates a PDF of it.
 * Shows how to use Puppeteer to:
 *
 *   1. screenshot a DOM element
 *   2. craft an HTML page on-the-fly
 *   3. produce an image of the element and a PDF of the page with the image embedded
 *
 * Usage:
 *   node element-to-pdf.js
 *   URL=https://developer.chrome.com/ SELECTOR=.devsite-landing-row-item node element-to-pdf.js
 *
 *   --searchable makes "find in page" work:
 *   node element-to-pdf.js --searchable
 *
 * Output:
 *   element.png and element.pdf
 */

import puppeteer from 'puppeteer';

const url = process.env.URL || 'https://developer.chrome.com/';
const selector = process.env.SELECTOR || '.devsite-landing-row-item';
const searchable = process.argv.includes('--searchable');

const browser = await puppeteer.launch();

const page = await browser.newPage();
await page.setViewport({width: 1200, height: 800, deviceScaleFactor: 2});
await page.goto(url, {waitUntil: 'networkidle2'});

const element = await page.waitForSelector(selector, {visible: true});
const screenshot = await element.screenshot({path: 'element.png'});

if (searchable) {
  await page.evaluate(el => {
    const {width} = getComputedStyle(el);
    const clone = el.cloneNode(true);
    clone.style.width = width;
    document.body.innerHTML = `
      <div style="display:flex;justify-content:center;align-items:center;height:100vh;">
        ${clone.outerHTML}
      </div>
    `;
  }, element);
} else {
  const base64 = Buffer.from(screenshot).toString('base64');
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          html, body {
            height: 100vh;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            background: #fafafa;
          }
          img {
            max-width: 80%;
            box-shadow: 3px 3px 6px #eee;
            border-radius: 6px;
          }
        </style>
      </head>
      <body>
        <img src="data:image/png;base64,${base64}">
      </body>
    </html>
  `);
}

await page.pdf({path: 'element.pdf', printBackground: true});

await browser.close();
