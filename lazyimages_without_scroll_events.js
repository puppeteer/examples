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
  *     // PASSES. Uses IntersectionObserver and lazyimages.js checks image visibility on page load without needing scroll events.
  *     node lazyimages_without_scroll_events.js --url=https://rawgit.com/GoogleChromeLabs/puppeteer-examples/master/html/lazyload.html
  *     // FAILS. uses scroll events.
  *     node lazyimages_without_scroll_events.js --url=https://css-tricks.com/examples/LazyLoading/
  *     // FAIL. Uses scroll events.
  *     node lazyimages_without_scroll_events.js --url=http://dinbror.dk/blazy/ -o results.html --save
  */

const puppeteer = require('puppeteer');
const fs = require('fs');
const PixelDiff = require('pixel-diff');
const PNG = require('pngjs').PNG;
const resizeImg = require('resize-img');

const DEFAULT_VIEWPORT = {
  width: 1000,
  height: 2000,
  deviceScaleFactor: 1,
};

const PNG_NOSCROLL_FILENAME = 'page_noscroll.png';
const PNG_SCROLL_FILENAME = 'page_scroll.png';
const PNG_DIFF_FILENAME = 'page_diff.png';

const WAIT_FOR = 2000; // Additional seconds to wait after page is considered load.

const argv = require('yargs')
.options({
  'save': {
    alias: 's',
    describe: 'Save screenshots to disk',
    default: false,
  },
  'url': {
    alias: 'u',
    describe: 'URL to load',
    demandOption: true,
    type: 'string',
  },
  'output': {
    alias: 'o',
    describe: 'Output HTML file',
    default: 'results.html',
    type: 'string',
  },
  'scroll': {
    describe: 'Filename for screenshot of scrolled page. Only worked with --save option.',
    default: PNG_SCROLL_FILENAME,
  },
  'noscroll': {
    describe: 'Filename for screenshot of non-scrolled page. Only worked with --save option.',
    default: PNG_NOSCROLL_FILENAME,
  },
  'diff': {
    describe: 'Filename for diff screenshot between pages.',
    default: PNG_DIFF_FILENAME,
  },
})
.help()
.argv;

(async() => {

const browser = await puppeteer.launch({
  // headless: false,
  defaultViewport: DEFAULT_VIEWPORT,
});

// async function waitForNetworkIdle(page, idle='networkidle0') {
//   return new Promise(resolve => {
//     page._client.on('Page.lifecycleEvent', e => {
//       if (e.name === 'networkIdle' && idle === 'networkidle0') {
//         resolve();
//       } else if (e.name === 'networkAlmostIdle' && idle === 'networkidle2') {
//         resolve();
//       }
//     });
//   });
// }

async function screenshotPageWithoutScroll(url) {
  const context = await browser.createIncognitoBrowserContext();

  const page = await context.newPage();

  // Set viewport height to same as the page when it's completely scrolled
  // so final screenshot is same height.
  // const viewport = Object.assign({}, DEFAULT_VIEWPORT);
  // viewport.height = maxScrollHeight;
  // await page.setViewport(viewport);

  // Prevent page from scrolling.
  // page.on('console', msg => console.log(msg.text()));
  // await page.evaluate(() => {
  //   document.addEventListener('scroll', e => {
  //     console.log('scroll!');
  //     e.stopImmediatePropagation();
  //     e.stopPropagation();
  //   });
  // });

  await page.goto(url, {waitUntil: 'networkidle2'});
  await page.waitFor(WAIT_FOR); // Wait a bit more in case other things are loading.
  // await waitForNetworkIdle(page, 'networkidle0'); // wait for network to be idle.
  const buffer = await page.screenshot({
    path: argv.save ? argv.noscroll : null,
    fullPage: true
  });
  await context.close();
  return buffer;
}

async function screenshotPageAfterScroll(url) {
  const context = await browser.createIncognitoBrowserContext();

  const page = await context.newPage();
  await page.goto(url, {waitUntil: 'networkidle2'});

  await page.evaluate(() => {
    // const viewPortHeight = document.documentElement.clientHeight;
    let lastScrollTop = document.scrollingElement.scrollTop;
    // Scroll to bottom of page until we can't scroll anymore.
    const scroll = () => {
      document.scrollingElement.scrollTop += 100;//(viewPortHeight / 2);
      if (document.scrollingElement.scrollTop !== lastScrollTop) {
        lastScrollTop = document.scrollingElement.scrollTop;
        requestAnimationFrame(scroll);
      }
    };
    scroll();
  });

  await page.waitFor(WAIT_FOR); // Wait a bit more in case other things are loading.
  // await waitForNetworkIdle(page, 'networkidle0'); // wait for network to be idle.

  // const maxScrollHeight = await page.evaluate(
  //     'document.scrollingElement.scrollHeight');

  const buffer = await page.screenshot({
    path: argv.save ? argv.scroll : null,
    fullPage: true
  });

  await context.close();
  return {screenshot: buffer};
}

async function resizeImage(pngBuffer, scale = 0.5) {
  const png = PNG.sync.read(pngBuffer);
  pngBuffer = await resizeImg(pngBuffer, {
    width: Math.round(png.width * scale),
    height: Math.round(png.height * scale),
  });
  return {buffer: pngBuffer, png: PNG.sync.read(pngBuffer)};
}

// First take screenshot of page scrolling it. This will also allow us to
// determine the total scroll height of the page and set the viewport for
// the unscrolled page.
let {screenshot: screenshotB} = await screenshotPageAfterScroll(argv.url);
let screenshotA = await screenshotPageWithoutScroll(argv.url);

let pngA = PNG.sync.read(screenshotA);
let pngB = PNG.sync.read(screenshotB);
// const sameDimensions = pngA.height === pngB.height && pngA.width === pngB.width;

const diff = new PixelDiff({
  imageA: screenshotA,
  imageB: screenshotB,
  thresholdType: PixelDiff.THRESHOLD_PERCENT, // thresholdType: PixelDiff.RESULT_DIFFERENT,
  threshold: 0.01, // 1% threshold
  imageOutputPath: argv.diff,
  // composeTopToBottom: true,
  // copyImageBToOutput: true,
  // copyImageAToOutput: false,
  cropImageB: {
    x: 0,
    y: 0,
    width: pngA.width,
    height: pngA.height,
  },
});

const result = await diff.runWithPromise();

const passed = diff.hasPassed(result.code);// && sameDimensions;
console.log(`Lazy images loaded correctly: ${passed ? 'Passed' : 'Failed'}`);
console.log(`Found ${result.differences} pixels differences.`);

({png: pngA, buffer: screenshotA} = await resizeImage(screenshotA, 0.25));
({png: pngB, buffer: screenshotB} = await resizeImage(screenshotB, 0.25));

console.log(`Dimension image A: ${pngA.width}x${pngA.height}`);
console.log(`Dimension image B: ${pngB.width}x${pngB.height}`);

const {png: pngDiff, buffer: diffBuffer} = await resizeImage(fs.readFileSync(argv.diff), 0.25);

const page = await browser.newPage();
await page.setContent(`
    <!DOCTYPE html>
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
          .screenshot {
            /*max-height: ${pngDiff.height}px;*/
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
          use a more modern approach like
          <a href="https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API">IntersectionObserver</a> with a
          <a href="https://github.com/w3c/IntersectionObserver/tree/master/polyfill">polyfill</a>.
          If you're using library for lazy loading, find one that doesn't use scroll events.</p>
        </header>
        <h2 class="check">Site result: <span class="${passed ? 'passed' : 'failed'}">${passed ? 'PASSED' : 'FAILED'}</span></h2>
        <div class="url"><a href="${argv.url}">${argv.url}</a></div>
        <section>
          <div>
            <h2>Page without being scrolled</h2>
            <p class="summary">This is how the lazy loaded images on your page appear to a search engine.
            Does it look right? If images are missing, they might be lazy loaded
            using scroll events.</p>
            <img src="data:img/png;base64,${screenshotA.toString('base64')}" class="screenshot">
          </div>
          <div>
            <h2>&nbsp;</h2>
            <p class="summary">( difference between two screenshots )</p>
            <img src="data:img/png;base64,${diffBuffer.toString('base64')}" class="screenshot">
          </div>
          <div>
            <h2>Page after scrolling</h2>
            <p class="summary">If there are more images in the screenshot below,
            the page is using scroll events to lazy load images. Instead, consider using another approach like
            IntersectionObserver.</p>
            <img src="data:img/png;base64,${screenshotB.toString('base64')}" class="screenshot">
          </div>
        </section>
      </body>
    </html>
  `);

fs.writeFileSync(argv.output, await page.content(), {encoding: 'utf8'});

await page.close();
await browser.close();

})();