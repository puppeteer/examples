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
 * Verifies that images on the page which are lazy loaded do not use scroll
 * events to do so. This can present a problem for search crawlers discovering
 * the images on a page.
 *
 * Usage:
 *
 *     node lazyimages_without_scroll_events.js -h
 *     node lazyimages_without_scroll_events.js --url=https://raw.githubusercontent.com/GoogleChromeLabs/puppeteer-examples/master/html/lazyload.html
 *     node lazyimages_without_scroll_events.js --url=https://css-tricks.com/examples/LazyLoading/
 *     node lazyimages_without_scroll_events.js --url=http://dinbror.dk/blazy/ -o results.html --save
 */

import {writeFile} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
import {parseArgs} from 'node:util';
import puppeteer from 'puppeteer';

const DEFAULT_VIEWPORT = {
  width: 1000,
  height: 2000,
  deviceScaleFactor: 1,
};

const PNG_NOSCROLL_FILENAME = 'page_noscroll.png';
const PNG_SCROLL_FILENAME = 'page_scroll.png';
const PNG_DIFF_FILENAME = 'page_diff.png';

const WAIT_FOR = 2000; // Additional ms to wait after page is considered loaded.
const DIFF_THRESHOLD_PERCENT = 0.01; // 1% pixel difference threshold.

const {values: argv} = parseArgs({
  options: {
    save: {type: 'boolean', short: 's', default: false},
    url: {type: 'string', short: 'u'},
    output: {type: 'string', short: 'o', default: 'results.html'},
    scroll: {type: 'string', default: PNG_SCROLL_FILENAME},
    noscroll: {type: 'string', default: PNG_NOSCROLL_FILENAME},
    diff: {type: 'string', default: PNG_DIFF_FILENAME},
    help: {type: 'boolean', short: 'h', default: false},
  },
});

if (argv.help || !argv.url) {
  console.log(`Usage: node lazyimages_without_scroll_events.js --url=<url> [options]

Options:
  -u, --url <url>        URL to load (required)
  -s, --save             Save screenshots to disk (default: false)
  -o, --output <file>    Output HTML file (default: results.html)
      --scroll <file>    Filename for scrolled screenshot (default: ${PNG_SCROLL_FILENAME})
      --noscroll <file>  Filename for non-scrolled screenshot (default: ${PNG_NOSCROLL_FILENAME})
      --diff <file>      Filename for diff screenshot (default: ${PNG_DIFF_FILENAME})
  -h, --help             Show this help message`);
  process.exit(argv.help ? 0 : 1);
}

const browser = await puppeteer.launch({
  defaultViewport: DEFAULT_VIEWPORT,
});

async function screenshotPageWithoutScroll(url) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  await page.goto(url, {waitUntil: 'networkidle2'});
  await setTimeout(WAIT_FOR); // Wait a bit more in case other things are loading.

  const buffer = await page.screenshot({
    path: argv.save ? argv.noscroll : undefined,
    fullPage: true,
  });
  await context.close();
  return Buffer.from(buffer);
}

async function screenshotPageAfterScroll(url) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.goto(url, {waitUntil: 'networkidle2'});

  await page.evaluate(() => {
    let lastScrollTop = document.scrollingElement.scrollTop;
    // Scroll to bottom of page until we can't scroll anymore.
    const scroll = () => {
      document.scrollingElement.scrollTop += 100;
      if (document.scrollingElement.scrollTop !== lastScrollTop) {
        lastScrollTop = document.scrollingElement.scrollTop;
        requestAnimationFrame(scroll);
      }
    };
    scroll();
  });

  await setTimeout(WAIT_FOR); // Wait a bit more in case other things are loading.

  const buffer = await page.screenshot({
    path: argv.save ? argv.scroll : undefined,
    fullPage: true,
  });

  await context.close();
  return Buffer.from(buffer);
}

/**
 * Diffs two PNG screenshots and produces resized thumbnails using an in-browser
 * canvas (no external image-processing dependencies required).
 */
async function diffAndResizeScreenshots(bufA, bufB, scale = 0.25) {
  const page = await browser.newPage();
  const dataUrlA = `data:image/png;base64,${bufA.toString('base64')}`;
  const dataUrlB = `data:image/png;base64,${bufB.toString('base64')}`;

  const result = await page.evaluate(async (srcA, srcB, resizeScale) => {
    const loadImg = async src => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return img;
    };

    const [imgA, imgB] = await Promise.all([loadImg(srcA), loadImg(srcB)]);
    const width = imgA.width;
    const height = imgA.height;

    const getPixels = img => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, width, height);
    };

    const dataA = getPixels(imgA).data;
    const dataB = getPixels(imgB).data;

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffCtx = diffCanvas.getContext('2d');
    const diffImageData = diffCtx.createImageData(width, height);
    const diffData = diffImageData.data;

    let differences = 0;
    const colorDeltaThreshold = 15;
    for (let i = 0; i < dataA.length; i += 4) {
      const dr = Math.abs(dataA[i] - dataB[i]);
      const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
      const db = Math.abs(dataA[i + 2] - dataB[i + 2]);
      if (dr > colorDeltaThreshold || dg > colorDeltaThreshold || db > colorDeltaThreshold) {
        differences++;
        diffData[i] = 255;
        diffData[i + 1] = 0;
        diffData[i + 2] = 0;
        diffData[i + 3] = 255;
      } else {
        // Dim unchanged pixels so differences stand out.
        diffData[i] = dataA[i];
        diffData[i + 1] = dataA[i + 1];
        diffData[i + 2] = dataA[i + 2];
        diffData[i + 3] = 40;
      }
    }
    diffCtx.putImageData(diffImageData, 0, 0);

    const resize = source => {
      const w = Math.round(source.width * resizeScale);
      const h = Math.round(source.height * resizeScale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(source, 0, 0, w, h);
      return {dataUrl: c.toDataURL('image/png'), width: w, height: h};
    };

    return {
      differences,
      totalPixels: width * height,
      diffFullDataUrl: diffCanvas.toDataURL('image/png'),
      resizedA: resize(imgA),
      resizedB: resize(imgB),
      resizedDiff: resize(diffCanvas),
    };
  }, dataUrlA, dataUrlB, scale);

  await page.close();
  return result;
}

const screenshotB = await screenshotPageAfterScroll(argv.url);
const screenshotA = await screenshotPageWithoutScroll(argv.url);

const {
  differences,
  totalPixels,
  diffFullDataUrl,
  resizedA,
  resizedB,
  resizedDiff,
} = await diffAndResizeScreenshots(screenshotA, screenshotB, 0.25);

await writeFile(argv.diff, Buffer.from(diffFullDataUrl.split(',')[1], 'base64'));

const passed = (differences / totalPixels) <= DIFF_THRESHOLD_PERCENT;
console.log(`Lazy images loaded correctly: ${passed ? 'Passed' : 'Failed'}`);
console.log(`Found ${differences} pixels differences.`);
console.log(`Dimension image A: ${resizedA.width}x${resizedA.height}`);
console.log(`Dimension image B: ${resizedB.width}x${resizedB.height}`);

const html = `<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Google+Sans:400,500,600">
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        margin: 70px;
        font-weight: 300;
        font-family: "Google Sans", sans-serif;
        line-height: 1.6;
      }
      section {
        display: flex;
        justify-content: space-evenly;
        align-items: flex-start;
      }
      body > section > div {
        padding: 8px;
        flex: 1;
        text-align: center;
      }
      h1 {
        color: #0D47A1;
      }
      h1, h2 {
        padding: 0;
        text-align: center;
        font-weight: inherit;
      }
      .url {
        text-align: center;
      }
      .url a {
        color: #0D47A1;
      }
      .check {
        padding: 8px;
        background-color: #eee;
      }
      img {
        max-width: 100%;
        border: 1px solid #333;
      }
      .summary {
        color: #757575;
        min-height: 100px;
      }
      .passed {
        color: #00C853;
        font-weight: 600;
      }
      .failed {
        color: #D50000;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Do your lazy loaded images work in search crawlers?</h1>
      <p>The two screenshots below should look more or less the same.
      If there are missing images in the left screenshot, it's likely they
      are being lazy loaded using scroll events. This can present a problem
      for search engines which often do not run JavaScript, and therefore,
      do not run scroll handlers. Images need to be fully loaded when they're
      "in the viewport", without scrolling the page. Instead of scroll events,
      use native <code>loading="lazy"</code> or
      <a href="https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API">IntersectionObserver</a>.</p>
    </header>
    <h2 class="check">Site result: <span class="${passed ? 'passed' : 'failed'}">${passed ? 'PASSED' : 'FAILED'}</span></h2>
    <div class="url"><a href="${argv.url}">${argv.url}</a></div>
    <section>
      <div>
        <h2>Page without being scrolled</h2>
        <p class="summary">This is how the lazy loaded images on your page appear to a search engine.
        Does it look right? If images are missing, they might be lazy loaded
        using scroll events.</p>
        <img src="${resizedA.dataUrl}" class="screenshot">
      </div>
      <div>
        <h2>&nbsp;</h2>
        <p class="summary">( difference between two screenshots )</p>
        <img src="${resizedDiff.dataUrl}" class="screenshot">
      </div>
      <div>
        <h2>Page after scrolling</h2>
        <p class="summary">If there are more images in the screenshot below,
        the page is using scroll events to lazy load images. Instead, consider using another approach like
        IntersectionObserver.</p>
        <img src="${resizedB.dataUrl}" class="screenshot">
      </div>
    </section>
  </body>
</html>`;

await writeFile(argv.output, html, 'utf8');
await browser.close();
