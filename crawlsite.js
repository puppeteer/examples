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
 * Discovers all the pages in a site or single page app (SPA) and creates
 * a tree of the result in ./output/<site slug>/crawl.json. Optionally
 * takes screenshots of each page as it is visited.
 *
 * Usage:
 *   node crawlsite.js
 *   URL=https://yourspa.com node crawlsite.js
 *   URL=https://yourspa.com node crawlsite.js --screenshots
 *
 * Then open the visualizer in a browser:
 *   http://localhost:8080/html/d3tree.html
 *   http://localhost:8080/html/d3tree.html?url=../output/https___yourspa.com/crawl.json
 *
 * Start Server:
 *   node server.js
 */

import {mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const START_URL = process.env.URL || 'https://developer.chrome.com/';
const SCREENSHOTS = process.argv.includes('--screenshots');
const DEPTH = process.env.DEPTH !== undefined ? parseInt(process.env.DEPTH, 10) : 2;
const VIEWPORT = SCREENSHOTS ? {width: 1028, height: 800, deviceScaleFactor: 2} : null;
const OUT_DIR = process.env.OUTDIR || `output/${slugify(START_URL)}`;

const crawledPages = new Map();
const maxDepth = DEPTH; // Subpage depth to crawl site.

function slugify(str) {
  return str.replace(/[/:]/g, '_');
}

/**
 * Resizes a PNG buffer to the target height (preserving aspect ratio) using
 * an in-browser canvas so no native image-processing dependency is required.
 * @param {!Page} page
 * @param {!Uint8Array} imgBuff
 * @param {number} targetHeight
 * @return {!Promise<!Buffer>}
 */
async function resizePng(page, imgBuff, targetHeight) {
  const dataUrl = `data:image/png;base64,${Buffer.from(imgBuff).toString('base64')}`;
  const resizedDataUrl = await page.evaluate(async (src, height) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const width = Math.round((img.width / img.height) * height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  }, dataUrl, targetHeight);
  return Buffer.from(resizedDataUrl.split(',')[1], 'base64');
}

/**
 * Finds all anchors on the page, inclusive of those within shadow roots.
 * Note: Intended to be run in the context of the page.
 * @param {boolean=} sameOrigin When true, only considers links from the same origin as the app.
 * @return {!Array<string>} List of anchor hrefs.
 */
function collectAllSameOriginAnchorsDeep(sameOrigin = true) {
  const allElements = [];

  const findAllElements = nodes => {
    for (const el of nodes) {
      allElements.push(el);
      // If the element has a shadow root, dig deeper.
      if (el.shadowRoot) {
        findAllElements(el.shadowRoot.querySelectorAll('*'));
      }
    }
  };

  findAllElements(document.querySelectorAll('*'));

  const filtered = allElements
    .filter(el => el.localName === 'a' && el.href) // element is an anchor with an href.
    .filter(el => el.href !== location.href) // link doesn't point to page's own URL.
    .filter(el => {
      if (sameOrigin) {
        return new URL(location.href).origin === new URL(el.href).origin;
      }
      return true;
    })
    .map(a => a.href);

  return Array.from(new Set(filtered));
}

/**
 * Crawls a URL by visiting a url, then recursively visiting any child subpages.
 * @param {!Browser} browser
 * @param {{url: string, title?: string, img?: string, children?: !Array<!Object>}} page Current page.
 * @param {number=} depth Current subtree depth of crawl.
 */
async function crawl(browser, page, depth = 0) {
  if (depth > maxDepth) {
    return;
  }

  // If we've already crawled the URL, we know its children.
  if (crawledPages.has(page.url)) {
    console.log(`Reusing route: ${page.url}`);
    const item = crawledPages.get(page.url);
    page.title = item.title;
    page.img = item.img;
    page.children = item.children;
    // Fill in the children with details (if they already exist).
    for (const c of page.children) {
      const childItem = crawledPages.get(c.url);
      c.title = childItem ? childItem.title : '';
      c.img = childItem ? childItem.img : null;
    }
    return;
  }

  console.log(`Loading: ${page.url}`);

  const newPage = await browser.newPage();
  if (VIEWPORT) {
    await newPage.setViewport(VIEWPORT);
  }
  await newPage.goto(page.url, {waitUntil: 'networkidle2'});

  let anchors = await newPage.evaluate(collectAllSameOriginAnchorsDeep);
  anchors = anchors.filter(a => a !== START_URL); // link doesn't point to start url of crawl.

  page.title = await newPage.title();
  page.children = anchors.map(url => ({url}));

  if (SCREENSHOTS) {
    const filePath = path.join(OUT_DIR, `${slugify(page.url)}.png`);
    let imgBuff = await newPage.screenshot({fullPage: false});
    imgBuff = await resizePng(newPage, imgBuff, 150); // resize image to 150px height x auto.
    await writeFile(filePath, imgBuff);
    page.img = `data:image/png;base64,${imgBuff.toString('base64')}`;
  }

  crawledPages.set(page.url, page); // cache it.

  await newPage.close();

  // Crawl subpages.
  for (const childPage of page.children) {
    await crawl(browser, childPage, depth + 1);
  }
}

await rm(OUT_DIR, {recursive: true, force: true}); // cleanup after last run.
await mkdir(OUT_DIR, {recursive: true}); // create output dir.

const browser = await puppeteer.launch();

const root = {url: START_URL};
await crawl(browser, root);

await writeFile(path.join(OUT_DIR, 'crawl.json'), JSON.stringify(root, null, ' '));

await browser.close();
