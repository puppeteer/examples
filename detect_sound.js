/**
 * @author ebidel@ (Eric Bidelman)
 * License Apache-2.0
 */

 /**
  * Trivially detect if media elements on the page are producing audio on page load.
  * Note: approach doesn't work in headless Chrome (which doesn't play sound).
  */

const puppeteer = require('puppeteer');

const URL = process.env.URL || 'https://www.youtube.com/watch?v=sK1ODp0nDbM';

(async() => {

// Note: headless doesn't play audio. Launch headful chrome.
const browser = await puppeteer.launch({headless: false});

const page = await browser.newPage();
await page.goto(URL, {waitUntil: 'networkidle2'});

const playingAudio = await page.evaluate(() => {
  const mediaEls = Array.from(document.querySelectorAll('audio,video'));
  return mediaEls.every(el => el.duration > 0 && !el.paused);
});

console.log('Playing audio:', playingAudio);

await browser.close();

})();
