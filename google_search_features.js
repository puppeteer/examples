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
 * Prints a non-exhaustive list of HTML/JS/CSS features a page is using which
 * are not supported by the Google Search bot and "Render as Google"
 * (runs Chrome 41). See developers.google.com/search/docs/guides/rendering.
 */

const fs = require('fs');
const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const chalk = require('chalk');
const caniuseDB = require('caniuse-db/data.json').data;

const url = process.env.URL || 'https://www.chromestatus.com/features';

const GOOGLE_SEARCH_CHROME_VERSION = process.env.CHROME_VERSION || 41;

const BlinkFeatureNameToCaniuseName = {
  AddEventListenerPassiveTrue: 'passive-event-listener',
  AddEventListenerPassiveFalse: 'passive-event-listener',
  PromiseConstructor: 'promises',
  PromiseResolve: 'promises',
  PromiseReject: 'promises',
  V8PromiseChain: 'promises',
  DocumentRegisterElement: 'custom-elements',
  V0CustomElementsRegisterHTMLCustomTag: 'custom-elements',
  V0CustomElementsCreateCustomTagElement: 'custom-elements',
  V0CustomElementsRegisterHTMLTypeExtension: 'custom-elements',
  V0CustomElementsCreateTypeExtensionElement: 'custom-elements',
  CSSSelectorPseudoMatches: 'css-matches-pseudo',
  CustomElementRegistryDefine: 'custom-elementsv1',
  ElementAttachShadow: 'shadowdomv1',
  ElementAttachShadowOpen: 'shadowdomv1',
  ElementAttachShadowClosed: 'shadowdomv1',
  CSSSelectorPseudoSlotted: 'shadowdomv1',
  HTMLSlotElement: 'shadowdomv1',
  CSSSelectorPseudoHost: 'shadowdom',
  ElementCreateShadowRoot: 'shadowdom',
  CSSSelectorPseudoShadow: 'shadowdom',
  CSSSelectorPseudoContent: 'shadowdom',
  CSSSelectorPseudoHostContext: 'shadowdom',
  HTMLShadowElement: 'shadowdom',
  HTMLContentElement: 'shadowdom',
  LinkRelPreconnect: 'link-rel-preconnect',
  LinkRelPreload: 'link-rel-preload',
  HTMLImports: 'imports',
  HTMLImportsAsyncAttribute: 'imports',
  LinkRelModulePreload: 'es6-module',
  V8BroadcastChannel_Constructor: 'broadcastchannel',
  Fetch: 'fetch',
  GlobalCacheStorage: 'cachestorage', // missing: https://github.com/Fyrd/caniuse/issues/3122
  OffMainThreadFetch: 'fetch',
  IntersectionObserver_Constructor: 'intersectionobserver',
  V8Window_RequestIdleCallback_Method: 'requestidlecallback',
  NotificationPermission: 'notifications',
  UnprefixedPerformanceTimeline: 'user-timing',
  V8Element_GetBoundingClientRect_Method: 'getboundingclientrect',
  AddEventListenerThirdArgumentIsObject: 'once-event-listener', // TODO: not a perfect match.
  // TODO: appears to be no UMA tracking for classes, async/await, spread, and
  // other newer js features. Those aren't being caught here.
  contain: 'css-containment',
  'tab-size': 'css3-tabsize',
  // Explicitly disabled by search https://developers.google.com/search/docs/guides/rendering
  UnprefixedIndexedDB: 'indexeddb',
  DocumentCreateEventWebGLContextEvent: 'webgl',
  CSSGridLayout: 'css-grid',
  CSSValueDisplayContents: 'css-display-contents',
  CSSPaintFunction: 'css-paint-api',
  WorkerStart: 'webworkers',
  ServiceWorkerControlledPage: 'serviceworkers',
  PrepareModuleScript: 'es6-module',
  // CookieGet:
  // CookieSet
};

/**
 * Unique items based on obj property.
 * @param {!Array} items
 * @param {string} propName Property name to filter on.
 * @return {!Array} unique array of items
 */
function uniqueByProperty(items, propName) {
  const posts = Array.from(items.reduce((map, item) => {
    return map.set(item[propName], item);
  }, new Map()).values());
  return posts;
}

/**
 * Sorts array of features by their name
 * @param {!Object} a
 * @param {!Object} b
 */
function sortByName(a, b) {
  if (a.name < b.name) {
    return -1;
  }
  if (a.name > b.name) {
    return 1;
  }
  return 0;
}

function printHeader(usage) {
  console.log('');
  console.log(`${chalk.bold(chalk.yellow('CAREFUL'))}: using ${usage.FeatureFirstUsed.length} HTML/JS, ${usage.CSSFirstUsed.length} CSS features. Some features are ${chalk.underline('not')} supported by the Google Search crawler.`);
  console.log(`The bot runs ${chalk.redBright('Chrome ' + GOOGLE_SEARCH_CHROME_VERSION)}, which may not render your page correctly when it's being indexed.`);
  console.log('');
  console.log(chalk.dim('More info at https://developers.google.com/search/docs/guides/rendering.'));
  console.log('');
  console.log(`Features used which are not supported by Google Search:`);
  console.log('');
}

/**
 * Returns true if `feature` is supported by the Google Search bot.
 * @param {string} feature caniuse.com feature name/id.
 * @return {boolean} True if the feature is (likely) supported by Google Search.
 */
function supportedByGoogleSearch(feature) {
  const data = caniuseDB[feature];
  if (!data) {
    return null;
  }
  const support = data.stats.chrome[GOOGLE_SEARCH_CHROME_VERSION];
  return support === 'y'; // TODO: consider 'p'. Partial support / polyfill.
}

/**
 * Fetches HTML/JS feature id/names from chromestatus.com.
 * @param {!Browser} browser
 * @return {!Map<number, string>} key/val pairs of ids -> feature name
 */
async function fetchFeatureToNameMapping() {
  const resp = await fetch('https://www.chromestatus.com/data/blink/features');
  return new Map(await resp.json());
}

/**
 * Fetches CSS property id/names from chromestatus.com
 * @param {!Browser} browser
 * @return {!Map<number, string>} key/val pairs of ids -> feature name
 */
async function fetchCSSFeatureToNameMapping(browser) {
  const resp = await fetch('https://www.chromestatus.com/data/blink/cssprops');
  return new Map(await resp.json());
}

/**
 * Start a trace during load to capture web platform features used by the page.
 * @param {!Browser} browser
 * @return {!Object}
 */
async function collectFeatureTraceEvents(browser) {
  const page = await browser.newPage();

  console.log(chalk.cyan(`Trace started.`));

  await page.tracing.start({
    categories: [
      '-*',
      'disabled-by-default-devtools.timeline', // for TracingStartedInPage
      'disabled-by-default-blink.feature_usage'
    ],
  });
  console.log(chalk.cyan(`Navigating to ${url}`));
  await page.goto(url, {waitUntil: 'networkidle2'});
  console.log(chalk.cyan(`Waiting for page to be idle...`));
  await page.waitFor(5000); // add a little more time in case other features are used.
  const trace = JSON.parse(await page.tracing.stop());
  console.log(chalk.cyan(`Trace complete.`));

  // Filter out all trace events that aren't 1. blink feature usage
  // and 2. from the same process/thread id as our test page's main thread.
  const traceStartEvent = findTraceStartEvent(trace.traceEvents);
  const events = trace.traceEvents.filter(e => {
    return e.cat === 'disabled-by-default-blink.feature_usage' &&
           e.pid === traceStartEvent.pid && e.tid === traceStartEvent.tid;
  });

  // // Gut check.
  // console.assert(events.every((entry, i, arr) => {
  //   // const nextIdx = Math.min(i + 1, arr.length - 1);
  //   // return entry.pid === arr[nextIdx].pid && entry.tid === arr[nextIdx].tid;
  //   return entry.pid === traceStartEvent.pid && entry.tid === traceStartEvent.tid;
  // }), 'Trace event is not from the same process/thread id as the page being tested.');

  await page.close();

  return events;
}

/**
 * @param {Array} events
 * @return {Object}
 */
function findTraceStartEvent(events) {
  const startedInBrowserEvt = events.find(e => e.name === 'TracingStartedInBrowser');
  if (startedInBrowserEvt && startedInBrowserEvt.args.data && startedInBrowserEvt.args.data.frames) {
    const mainFrame = startedInBrowserEvt.args.data.frames.find(frame => !frame.parent);
    const pid = mainFrame && mainFrame.processId;
    const threadNameEvt = events.find(e => e.pid === pid && e.ph === 'M' &&
      e.cat === '__metadata' && e.name === 'thread_name' && e.args.name === 'CrRendererMain');

    const tid = threadNameEvt && threadNameEvt.tid;
    if (pid && tid) {
      return {
        pid,
        tid
      };
    }
  }

  // // Support legacy browser versions
  const startedInPageEvt = events.find(e => e.name === 'TracingStartedInPage');
  if (startedInPageEvt && startedInPageEvt.args && startedInPageEvt.args.data) {
    return {
      pid: startedInPageEvt.pid,
      tid: startedInPageEvt.tid
    };
  }
}

/**
 * @param {!Object} feature
 */
function printFeatureName(feature, url= null) {
  const suffix = url ? `: ${url}` : '';
  if (feature.css) {
    console.log(chalk.grey('-'), `CSS \`${feature.name}\`${suffix}`);
  } else {
    console.log(chalk.grey('-'), `${feature.name}${suffix}`);
  }
}

(async() => {

const browser = await puppeteer.launch({
  // headless: false,
});

// Parallelize the separate page loads.
const [featureMap, cssFeatureMap, traceEvents] = await Promise.all([
  fetchFeatureToNameMapping(),
  fetchCSSFeatureToNameMapping(),
  collectFeatureTraceEvents(browser),
]);

const usage = traceEvents.reduce((usage, e) => {
  if (!(e.name in usage)) {
    usage[e.name] = [];
  }
  const isCSS = e.name === 'CSSFirstUsed';
  const id = e.args.feature;
  const name = isCSS ? cssFeatureMap.get(id) : featureMap.get(id);
  usage[e.name].push({id, name, ts: e.ts, css: isCSS});

  return usage;
}, {});

// Unique events based on feature property id.
usage.FeatureFirstUsed = uniqueByProperty(usage.FeatureFirstUsed, 'id');
usage.CSSFirstUsed = uniqueByProperty(usage.CSSFirstUsed, 'id');

printHeader(usage);

const allFeaturesUsed = Object.entries([...usage.FeatureFirstUsed, ...usage.CSSFirstUsed].sort(sortByName));
for (const [id, feature] of allFeaturesUsed) {
  const caniuseName = BlinkFeatureNameToCaniuseName[feature.name];
  const supported = supportedByGoogleSearch(caniuseName);
  if (caniuseName && !supported) {
    const url = chalk.magentaBright(`https://caniuse.com/#feat=${caniuseName}`);
    printFeatureName(feature, url);
  }
}
console.log('');
console.log('All features used on the page:');
console.log('');
for (const [id, feature] of allFeaturesUsed) {
  printFeatureName(feature);
}
console.log('');

await browser.close();

})();
