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
 * @author rahulkumar66@ (Rahul Kumar)
 */

/**
* Demonstrates how to reuse browser instances across multiple tasks
* resulting in improved load times for subsequent requests.
* This has huge load time improvements in case of SPAs
*/

const genericPool = require('generic-pool');
const puppeteer = require('puppeteer');

const VIEWPORT = { width: 1028, height: 800, deviceScaleFactor: 2 };
const HACKER_NEWS_SPA_URL = 'https://hn.algolia.com/';
const HACKER_NEWS_QUERY_SPA_URL = 'https://hn.algolia.com/?query=angular';


const factory = {
    create: async () => {
        const browser = await puppeteer.launch(puppeteerArgs);
        const page = await browser.newPage();
        return page;
    },
    destroy: (browser) => {
        browser.close();
    },
};

const browserPool = genericPool.createPool(factory, {
    max: 5, // maximum number of browser instances that can be created at any given time 
    min: 2, // minimum number of browser instances to keep in pool at any given time
    maxWaitingClients: 50
});

async function getContent(url) {
    const page = await browserPool.acquire();
    await page.setViewport(VIEWPORT);

    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    // release browser instance back to pool so it can be reused
    await browserPool.release(page);
    return response.text();
}

(async () => {
    const responseHackerNews = await getContent(HACKER_NEWS_SPA_URL);
    console.log(responseHackerNews);

    // this request will use the instance from the current browser pool resulting in faster response 
    // resulting in faster response
    const responseHackerNewsWithQuery = await getContent(HACKER_NEWS_QUERY_SPA_URL);
    console.log(responseHackerNewsWithQuery);
})();