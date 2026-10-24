// Load off-screen lazy images through ordinary scrolling before a full-page
// screenshot. A complete HTML response alone does not mean its pixels are ready.
export async function prepareFullPageCapture(page, { timeout = 15000, maxSteps = 100 } = {}) {
  await page.evaluate(() => document.fonts.ready);
  let finished = false;
  for (let step = 0; step < maxSteps; step++) {
    await page.waitForFunction(() => [...document.images].every((image) => {
      const rect = image.getBoundingClientRect();
      return rect.bottom <= 0 || rect.top >= innerHeight || (image.complete && image.naturalWidth > 0);
    }), null, { timeout });
    finished = await page.evaluate(async () => {
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 1) return true;
      scrollBy(0, Math.max(1, innerHeight * 0.8));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return false;
    });
    if (finished) break;
  }
  if (!finished) throw new Error('Full-page capture exceeded its bounded lazy-content scroll');
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0), null, { timeout });
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((image) => image.decode()));
    scrollTo(0, 0);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
