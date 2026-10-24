import { test } from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from '@playwright/test';
import { prepareFullPageCapture } from '../scripts/lib/capture-readiness.mjs';

test('full-page evidence waits for off-screen lazy pixels and returns to the top', async () => {
  let requested = false;
  const server = http.createServer((request, response) => {
    if (request.url === '/image.svg') {
      requested = true;
      setTimeout(() => { response.writeHead(200, { 'content-type': 'image/svg+xml' }); response.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="red"/></svg>'); }, 300);
    } else {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<div style="height:5000px"></div><img loading="lazy" src="/image.svg" width="100" height="60"><div style="height:1000px"></div>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('img').evaluate(image => image.complete), false);
    await prepareFullPageCapture(page);
    assert.equal(requested, true);
    assert.deepEqual(await page.evaluate(() => ({ width: document.images[0].naturalWidth, top: scrollY })), { width: 100, top: 0 });
    await assert.rejects(prepareFullPageCapture(page, { maxSteps: 1 }), /bounded lazy-content scroll/);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
