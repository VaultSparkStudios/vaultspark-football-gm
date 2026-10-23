import { test, expect } from "@playwright/test";
import { revealTable } from "./helpers/static-client.js";

// S120: the Pages release gate failed twice on a saved-slot row that read
// "hidden". The setup page opens Saved Leagues by itself when deferred saves
// arrive, and that open landed between revealTable's read and its click, so
// the click closed the section. This reproduces the interleaving exactly: the
// page opens the section on the summary's mousedown, before the click toggles.
test("revealTable leaves a section open when the page opens it mid-click", async ({ page }) => {
  await page.setContent(`
    <details id="saved"><summary>Saved Leagues</summary>
      <table id="savesTable"><tr><td><button data-resume="slot">Resume</button></td></tr></table>
    </details>
    <script>
      const details = document.getElementById("saved");
      details.querySelector("summary").addEventListener("mousedown", () => { details.open = true; }, { once: true });
    </script>`);
  await revealTable(page, "#savesTable");
  await expect(page.locator('[data-resume="slot"]')).toBeVisible();
});

test("revealTable opens a closed section and keeps an open one open", async ({ page }) => {
  await page.setContent(`
    <details id="a"><summary>A</summary><table id="aTable"><tr><td id="aCell">a</td></tr></table></details>
    <details id="b" open><summary>B</summary><table id="bTable"><tr><td id="bCell">b</td></tr></table></details>`);
  await revealTable(page, "#aTable");
  await revealTable(page, "#bTable");
  await expect(page.locator("#aCell")).toBeVisible();
  await expect(page.locator("#bCell")).toBeVisible();
});
