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
  *     node lazyimages_without_scroll_events.js --url=https://rawgit.com/GoogleChromeLabs/puppeteer-examples/master/html/lazyload.html // PASSES. Uses IntersectionObserver.
  *     node lazyimages_without_scroll_events.js --url=https://css-tricks.com/examples/LazyLoading/ // FAILS. uses scroll events.
  *     node lazyimages_without_scroll_events.js --url=http://dinbror.dk/blazy/ -o results.html --save // FAIL. Uses scroll events.
  */

const puppeteer = require('puppeteer');
const fs = require('fs');
const PixelDiff = require('pixel-diff');

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
  },
  'output': {
    alias: 'o',
    describe: 'Output HTML file',
    default: 'results.html',
  },
})
.help()
// .example('$0 --url https://devwebfeed.appspot.com https://devwebfeed.appspot.com/ssr')
// .example('$0 --no-throttle --no-mobile -u https://devwebfeed.appspot.com https://devwebfeed.appspot.com/ssr')
// .example('$0 -u https://www.bing.com/ https://www.google.com/ https://www.yahoo.com/')
// .wrap(null)
.argv;

(async() => {

const defaultViewport = {
  width: 800,
  height: 2000,
  deviceScaleFactor: 2,
};

const browser = await puppeteer.launch({
  // headless: false,
  // defaultViewport,
});

async function screenshotPage(url) {
  const context = await browser.createIncognitoBrowserContext();

  const page = await context.newPage();
  await page.goto(url, {waitUntil: 'networkidle2'});
  await page.waitFor(2000); // Wait a bit more in case other things are loading.
  const buffer = await page.screenshot({
    path: argv.save ? 'page_noscroll.png': null,
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
    const viewPortHeight = document.documentElement.clientHeight;
    let lastScrollTop = document.scrollingElement.scrollTop;
    // Scroll to bottom of page until we can't scroll anymore.
    const scroll = () => {
      document.scrollingElement.scrollTop += (viewPortHeight / 2);
      if (document.scrollingElement.scrollTop !== lastScrollTop) {
        lastScrollTop = document.scrollingElement.scrollTop;
        requestAnimationFrame(scroll);
      }
    };
    scroll();
  });

  await page.waitFor(2000); // Wait a bit more in case other things are loading.

  const buffer = await page.screenshot({
    path: argv.save ? 'page_scroll.png': null,
    fullPage: true
  });

  await context.close();
  return buffer;
}

// Take screen of the page with and without scrolling it.
const screenshots = await Promise.all([
  screenshotPage(argv.url),
  screenshotPageAfterScroll(argv.url),
]);

const diff = new PixelDiff({
  imageA: screenshots[0],
  imageB: screenshots[1],
  thresholdType: PixelDiff.THRESHOLD_PERCENT, // thresholdType: PixelDiff.RESULT_DIFFERENT,
  threshold: 0.01, // 1% threshold
  imageOutputPath: argv.save ? 'page_diff.png' : null,
});

const result = await diff.runWithPromise();
const passed = diff.hasPassed(result.code);
console.log(`Lazy images loaded correctly: ${passed ? 'Passed' : 'Failed'}`);
console.log(`Found ${result.differences} differences.`);

// const diffBuffer = fs.readFileSync('page_diff.png', {encoding: 'utf8'});

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
            width: 100%;
          }
          h1 {
            color: #0D47A1;
          }
          h1, h2 {
            padding: 0;
            text-align: center;
            font-weight: inherit;
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
            min-height: 80px;
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
          use a more modern approach like
          <a href="https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API">IntersectionObserver</a> with a
          <a href="https://github.com/w3c/IntersectionObserver/tree/master/polyfill">polyfill</a>.
          If you're using library for lazy loading, find one that doesn't use scroll events.</p>
        </header>
        <h2 class="check">Site result: <span class="${passed ? 'passed' : 'failed'}">${passed ? 'PASSED' : 'FAILED'}</span></h2>
        <section>
          <div>
            <h2>Page without being scrolled</h2>
            <p class="summary">This is how the images on your page appear to a search engine.
            Does it look right? If images are missing, they might be lazy loaded
            using scroll events. Instead, consider using another approach like
            IntersectionObserver.</p>
            <img src="data:img/png;base64,${screenshots[0].toString('base64')}">
          </div>
          <div>
            <h2>Page after scrolling</h2>
            <p class="summary">If there are more images below, the page is probably using scroll
            events to lazy load images.</p>
            <img src="data:img/png;base64,${screenshots[1].toString('base64')}">
          </div>
        </section>
      </body>
    </html>
  `);

fs.writeFileSync(argv.output, await page.content(), {encoding: 'utf8'});

await page.close();
await browser.close();

})();