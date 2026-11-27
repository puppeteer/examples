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
 * are not supported by a target Chrome version (originally Google Search bot's
 * Chrome 41). See https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics.
 */

import {setTimeout} from 'node:timers/promises';
import {styleText} from 'node:util';
import puppeteer from 'puppeteer';

const url = process.env.URL || 'https://chromestatus.com/roadmap';
const GOOGLE_SEARCH_CHROME_VERSION = process.env.CHROME_VERSION || '41';

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
  GlobalCacheStorage: 'cachestorage',
  OffMainThreadFetch: 'fetch',
  IntersectionObserver_Constructor: 'intersectionobserver',
  V8Window_RequestIdleCallback_Method: 'requestidlecallback',
  NotificationPermission: 'notifications',
  UnprefixedPerformanceTimeline: 'user-timing',
  V8Element_GetBoundingClientRect_Method: 'getboundingclientrect',
  AddEventListenerThirdArgumentIsObject: 'once-event-listener',
  contain: 'css-containment',
  'tab-size': 'css3-tabsize',
  UnprefixedIndexedDB: 'indexeddb',
  DocumentCreateEventWebGLContextEvent: 'webgl',
  CSSGridLayout: 'css-grid',
  CSSValueDisplayContents: 'css-display-contents',
  CSSPaintFunction: 'css-paint-api',
  WorkerStart: 'webworkers',
  ServiceWorkerControlledPage: 'serviceworkers',
  PrepareModuleScript: 'es6-module',
};

/**
 * Unique items based on obj property.
 * @param {!Array} items
 * @param {string} propName Property name to filter on.
 * @return {!Array} unique array of items
 */
function uniqueByProperty(items = [], propName) {
  return Array.from(
    items.reduce((map, item) => map.set(item[propName], item), new Map()).values()
  );
}

/**
 * Sorts array of features by their name.
 */
function sortByName(a, b) {
  return String(a.name).localeCompare(String(b.name));
}

function printHeader(usage) {
  console.log('');
  console.log(
    `${styleText(['bold', 'yellow'], 'CAREFUL')}: using ${usage.FeatureFirstUsed.length} HTML/JS, ` +
    `${usage.CSSFirstUsed.length} CSS features. Some features are ${styleText('underline', 'not')} ` +
    `supported by Chrome ${GOOGLE_SEARCH_CHROME_VERSION}.`
  );
  console.log(
    `Target version: ${styleText('redBright', `Chrome ${GOOGLE_SEARCH_CHROME_VERSION}`)}.`
  );
  console.log('');
  console.log(styleText('dim', 'More info at https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics.'));
  console.log('');
  console.log(`Features used which are not supported by Chrome ${GOOGLE_SEARCH_CHROME_VERSION}:`);
  console.log('');
}

/**
 * Fetches caniuse database directly from GitHub (no npm dependency needed).
 * @return {!Promise<!Object>}
 */
async function fetchCaniuseDB() {
  const resp = await fetch('https://raw.githubusercontent.com/Fyrd/caniuse/main/data.json');
  if (!resp.ok) {
    throw new Error(`Failed to fetch caniuse data: ${resp.status}`);
  }
  const {data} = await resp.json();
  return data;
}

/**
 * Returns true if `feature` is supported by the target Chrome version.
 * @param {!Object} caniuseDB
 * @param {string} feature caniuse.com feature name/id.
 * @return {?boolean}
 */
function isSupportedInChrome(caniuseDB, feature) {
  const data = caniuseDB[feature];
  if (!data) {
    return null;
  }
  const support = data.stats.chrome[GOOGLE_SEARCH_CHROME_VERSION];
  return support === 'y';
}

/**
 * Fetches HTML/JS feature id/names from chromestatus.com.
 * @return {!Promise<!Map<number, string>>}
 */
async function fetchFeatureToNameMapping() {
  const resp = await fetch('https://www.chromestatus.com/data/blink/features');
  return new Map(await resp.json());
}

/**
 * Fetches CSS property id/names from chromestatus.com.
 * @return {!Promise<!Map<number, string>>}
 */
async function fetchCSSFeatureToNameMapping() {
  const resp = await fetch('https://www.chromestatus.com/data/blink/cssprops');
  return new Map(await resp.json());
}

/**
 * Start a trace during load to capture web platform features used by the page.
 * @param {!Browser} browser
 * @return {!Promise<!Array<!Object>>}
 */
async function collectFeatureTraceEvents(browser) {
  const page = await browser.newPage();

  console.log(styleText('cyan', 'Trace started.'));

  await page.tracing.start({
    categories: [
      '-*',
      'disabled-by-default-devtools.timeline', // for TracingStartedInPage
      'disabled-by-default-blink.feature_usage',
    ],
  });
  console.log(styleText('cyan', `Navigating to ${url}`));
  await page.goto(url, {waitUntil: 'networkidle2'});
  console.log(styleText('cyan', 'Waiting for page to be idle...'));
  await setTimeout(5000); // add a little more time in case other features are used.
  const traceBuffer = await page.tracing.stop();
  const trace = JSON.parse(new TextDecoder().decode(traceBuffer));
  console.log(styleText('cyan', 'Trace complete.'));

  // Filter out all trace events that aren't 1. blink feature usage
  // and 2. from the same process/thread id as our test page's main thread.
  const traceStartEvent = findTraceStartEvent(trace.traceEvents);
  const events = trace.traceEvents.filter(e =>
    e.cat === 'disabled-by-default-blink.feature_usage' &&
    e.pid === traceStartEvent?.pid &&
    e.tid === traceStartEvent?.tid
  );

  await page.close();

  return events;
}

/**
 * @param {!Array<!Object>} events
 * @return {?{pid: number, tid: number}}
 */
function findTraceStartEvent(events) {
  const startedInBrowserEvt = events.find(e => e.name === 'TracingStartedInBrowser');
  if (startedInBrowserEvt?.args?.data?.frames) {
    const mainFrame = startedInBrowserEvt.args.data.frames.find(frame => !frame.parent);
    const pid = mainFrame?.processId;
    const threadNameEvt = events.find(e =>
      e.pid === pid &&
      e.ph === 'M' &&
      e.cat === '__metadata' &&
      e.name === 'thread_name' &&
      e.args.name === 'CrRendererMain'
    );

    const tid = threadNameEvt?.tid;
    if (pid && tid) {
      return {pid, tid};
    }
  }

  // Support legacy browser versions.
  const startedInPageEvt = events.find(e => e.name === 'TracingStartedInPage');
  if (startedInPageEvt?.args?.data) {
    return {
      pid: startedInPageEvt.pid,
      tid: startedInPageEvt.tid,
    };
  }
  return null;
}

/**
 * @param {!Object} feature
 * @param {?string=} featureUrl
 */
function printFeatureName(feature, featureUrl = null) {
  const suffix = featureUrl ? `: ${featureUrl}` : '';
  if (feature.css) {
    console.log(styleText('gray', '-'), `CSS \`${feature.name}\`${suffix}`);
  } else {
    console.log(styleText('gray', '-'), `${feature.name}${suffix}`);
  }
}

const browser = await puppeteer.launch();

// Parallelize the separate fetches and trace collection.
const [caniuseDB, featureMap, cssFeatureMap, traceEvents] = await Promise.all([
  fetchCaniuseDB(),
  fetchFeatureToNameMapping(),
  fetchCSSFeatureToNameMapping(),
  collectFeatureTraceEvents(browser),
]);

const usage = traceEvents.reduce((acc, e) => {
  if (!(e.name in acc)) {
    acc[e.name] = [];
  }
  const isCSS = e.name === 'CSSFirstUsed';
  const id = e.args.feature;
  const name = (isCSS ? cssFeatureMap.get(id) : featureMap.get(id)) || `Feature #${id}`;
  acc[e.name].push({id, name, ts: e.ts, css: isCSS});

  return acc;
}, {FeatureFirstUsed: [], CSSFirstUsed: []});

// Unique events based on feature property id.
usage.FeatureFirstUsed = uniqueByProperty(usage.FeatureFirstUsed, 'id');
usage.CSSFirstUsed = uniqueByProperty(usage.CSSFirstUsed, 'id');

printHeader(usage);

const allFeaturesUsed = [...usage.FeatureFirstUsed, ...usage.CSSFirstUsed].sort(sortByName);
for (const feature of allFeaturesUsed) {
  const caniuseName = BlinkFeatureNameToCaniuseName[feature.name];
  const supported = isSupportedInChrome(caniuseDB, caniuseName);
  if (caniuseName && !supported) {
    const featUrl = styleText('magentaBright', `https://caniuse.com/#feat=${caniuseName}`);
    printFeatureName(feature, featUrl);
  }
}
console.log('');
console.log('All features used on the page:');
console.log('');
for (const feature of allFeaturesUsed) {
  printFeatureName(feature);
}
console.log('');

await browser.close();
