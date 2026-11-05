import { expect } from "@playwright/test";
import { addKey, start as signIn, test } from "./fixtures";

// Visual review only: run with SCREENS=1 to capture every major screen.
test.skip(!process.env.SCREENS, "screenshots only on demand");

test("capture screens", async ({ page }, testInfo) => {
  const shot = (name: string) => page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-${name}.png`), animations: "disabled" });
  await signIn(page);
  await shot("2-welcome");
  await page.getByRole("button", { name: "Create your first world" }).click();
  await shot("3-templates");
  await page.getByRole("button", { name: /Cyberpunk Neon/ }).click();
  await shot("4-details");
  await page.getByRole("button", { name: "Create world", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Forge a new world" })).toBeHidden();
  await shot("5-new-story");
  await addKey(page);
  await page.getByRole("button", { name: "Begin the story" }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeHidden();
  await page.getByRole("radio", { name: "Say" }).click();
  await page.getByLabel("Your next move", { exact: true }).fill("Who's asking?");
  await page.getByLabel("Your next move", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Lorebook", exact: true }).click();
  await page.waitForTimeout(400);
  await shot("6-chat-lorebook");
  if (testInfo.project.name === "mobile") await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Story options" }).click();
  await page.getByRole("menuitem", { name: "Storytelling settings" }).click();
  await shot("7-settings");
});
