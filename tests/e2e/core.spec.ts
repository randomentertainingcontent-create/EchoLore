import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { addKey, createWorld, noOverflow, openDrawerIfMobile, reply, start, test, waitForReply } from "./fixtures";

const closeSheet = async (page: import("@playwright/test").Page) => page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

test("no sign-up: create a world, stream a reply, switch worlds and survive a reload", async ({ page, mock }, testInfo) => {
  await start(page);
  await createWorld(page, "Lantern Vale");
  const composer = page.getByLabel("Your next move", { exact: true });
  await expect(composer).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin the story" })).toBeDisabled();
  await addKey(page);
  await page.keyboard.press("Control+k");
  await expect(composer).toBeFocused();
  await composer.fill("I follow the lantern.");
  await composer.press("Shift+Enter");
  await composer.press("End");
  await composer.type("What lies ahead?");
  await expect(composer).toHaveValue("I follow the lantern.\nWhat lies ahead?");
  await composer.press("Enter");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(composer).toHaveValue("");
  const conversation = page.getByRole("region", { name: "Conversation" });
  await expect(conversation).toContainText(reply);
  await waitForReply(page);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  expect(mock.chatBodies).toHaveLength(1);
  expect(mock.chatBodies[0]).toMatchObject({
    world: { worldDescription: "A quiet forest with silver paths and lanterns.", userPersona: "A curious cartographer." },
    worldState: { location: "Lantern gate" },
    history: [],
    message: "I follow the lantern.\nWhat lies ahead?",
    options: { responseLength: "medium" },
  });
  await page.getByRole("button", { name: "Lorebook", exact: true }).click();
  await expect(page.getByRole("region", { name: "World lorebook" })).toContainText("Lantern gate");
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-chat.png`), fullPage: true, animations: "disabled" });
  if (testInfo.project.name === "mobile") await closeSheet(page);
  await createWorld(page, "Silver Harbor");
  await expect(page.getByRole("heading", { name: "Silver Harbor", exact: true })).toBeVisible();
  await openDrawerIfMobile(page);
  await page.getByRole("button", { name: /^Lantern Vale/ }).click();
  await expect(page.getByRole("dialog", { name: "Your worlds", exact: true })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Lantern Vale", exact: true })).toBeVisible();
  await expect(conversation).toContainText(reply);
  await noOverflow(page);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Lantern Vale", exact: true })).toBeVisible();
  await expect(conversation).toContainText("I follow the lantern.");
  await expect(conversation).toContainText(reply);
  await openDrawerIfMobile(page);
  await expect(page.getByRole("button", { name: /^Silver Harbor/ })).toBeVisible();
  expect(mock.requests.some((r) => r.includes("auth"))).toBe(false);
});

test("a failed reply keeps the draft, saves nothing, and recovers", async ({ page, mock }, testInfo) => {
  await start(page);
  await createWorld(page, "Resilient Vale");
  await addKey(page);
  const composer = page.getByLabel("Your next move", { exact: true });
  mock.failChat = true;
  await composer.fill("Keep this draft after failure.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Your draft is kept/ })).toContainText("Mock narrator unavailable");
  await expect(composer).toHaveValue("Keep this draft after failure.");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-failure-recovery.png`), fullPage: true, animations: "disabled" });
  mock.failChat = false;
  await composer.press("Enter");
  await expect(page.getByRole("region", { name: "Conversation" })).toContainText(reply);
  await waitForReply(page);
  await expect(composer).toHaveValue("");
  await expect(page.getByRole("alert").filter({ hasText: /Your draft is kept/ })).toHaveCount(0);
  expect(mock.chatBodies).toHaveLength(2);
  expect(mock.chatBodies[1].history).toEqual([]);
});

test("templates, say mode, memory, regenerate, rewind, edits, lorebook keeper and editing", async ({ page, mock }, testInfo) => {
  await start(page);
  await page.getByRole("button", { name: /Cozy Mystery/ }).click();
  await expect(page.getByLabel("World title", { exact: true })).toHaveValue("Pinewood Hollow");
  await page.getByRole("button", { name: "Create world", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Forge a new world" })).toBeHidden();
  await addKey(page);
  const conversation = page.getByRole("region", { name: "Conversation" });
  const composer = page.getByLabel("Your next move", { exact: true });

  await page.getByRole("button", { name: "Begin the story" }).click();
  await expect(conversation).toContainText(reply);
  await waitForReply(page);
  expect(mock.chatBodies.at(-1)!.message).toMatch(/^\[Direction: Set the opening scene/);
  expect(mock.chatBodies.at(-1)!.worldState).toMatchObject({ day: 1, location: "Pinewood Hollow — Main Street Books" });
  await expect(conversation).toContainText("Direction");

  await page.getByRole("radio", { name: "Say" }).click();
  await composer.fill("Morning, Sheriff.");
  await composer.press("Enter");
  await expect(conversation).toContainText("\"Morning, Sheriff.\"");
  await waitForReply(page);
  expect(mock.chatBodies.at(-1)!.message).toBe("\"Morning, Sheriff.\"");
  expect(mock.chatBodies.at(-1)!.history.map((m) => m.role)).toEqual(["user", "assistant"]);
  await expect.poll(() => mock.loreCalls).toBe(1);

  const regenerate = page.getByRole("button", { name: "Regenerate reply" });
  await expect(regenerate).toBeEnabled();
  await regenerate.click();
  await expect(conversation).toContainText(reply);
  await waitForReply(page);
  expect(mock.chatBodies.at(-1)!.message).toBe("\"Morning, Sheriff.\"");
  expect(mock.chatBodies.at(-1)!.history).toHaveLength(2);

  await page.getByRole("button", { name: "Edit message" }).last().click();
  await page.getByLabel("Edited message text", { exact: true }).fill("The sheriff tips his hat and says nothing.");
  await page.getByRole("button", { name: "Save edit" }).click();
  await expect(conversation).toContainText("The sheriff tips his hat and says nothing.");

  await page.getByRole("radio", { name: "Do" }).click();
  await composer.fill("I ask the sheriff about the lighthouse keeper.");
  await composer.press("Enter");
  await waitForReply(page);
  expect(mock.chatBodies.at(-1)!.history.map((m) => m.content)).toContain("The sheriff tips his hat and says nothing.");

  await page.getByRole("button", { name: "Rewind to here and rewrite" }).last().click();
  await page.getByRole("button", { name: "Rewind", exact: true }).click();
  await expect(composer).toHaveValue("I ask the sheriff about the lighthouse keeper.");
  await expect(page.getByRole("radio", { name: "Do" })).toHaveAttribute("aria-checked", "true");
  await expect(conversation).not.toContainText("I ask the sheriff about the lighthouse keeper.");
  await expect(conversation).toContainText("tips his hat");

  await page.getByRole("button", { name: "Lorebook", exact: true }).click();
  const lore = page.getByRole("region", { name: "World lorebook" });
  await expect(lore).toContainText("Keeper noted");
  await lore.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Lorebook JSON").fill('{"location":"The lighthouse","clues":["wet footprints"]}');
  await lore.getByRole("button", { name: "Save", exact: true }).click();
  await expect(lore).toContainText("The lighthouse");
  await expect(lore).toContainText("wet footprints");
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-lorebook.png`), fullPage: true, animations: "disabled" });
  if (testInfo.project.name === "mobile") await closeSheet(page);

  await page.getByRole("button", { name: "Story options" }).click();
  await page.getByRole("menuitem", { name: "Edit world" }).click();
  await page.getByLabel("World title", { exact: true }).fill("Pinewood Hollow Redux");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Pinewood Hollow Redux", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Story options" }).click();
  await page.getByRole("menuitem", { name: "Change model" }).click();
  await page.getByRole("combobox", { name: /Story model/ }).click();
  await page.getByRole("option", { name: /Claude Test/ }).click();
  await expect(page.getByRole("combobox", { name: /Story model/ })).toContainText("anthropic/claude-test");
  await page.getByRole("tab", { name: "Connection" }).click();
  await page.getByRole("button", { name: "Test key" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Key works" })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Pinewood Hollow Redux", exact: true })).toBeVisible();
  await expect(conversation).toContainText("tips his hat");
  await expect(conversation).not.toContainText("I ask the sheriff about the lighthouse keeper.");
  await page.getByRole("button", { name: "Lorebook", exact: true }).click();
  await expect(page.getByRole("region", { name: "World lorebook" })).toContainText("wet footprints");
});

test("backup, erase and restore all worlds", async ({ page }) => {
  await start(page);
  await createWorld(page, "Backup Vale");
  await addKey(page);
  await page.getByRole("button", { name: "Story options" }).click();
  await page.getByRole("menuitem", { name: "Storytelling settings" }).click();
  await page.getByRole("tab", { name: "Data" }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const file = await (await downloading).path();
  const backup = JSON.parse(await readFile(file, "utf8"));
  expect(backup).toMatchObject({ app: "echolore", campaigns: [{ title: "Backup Vale", worldState: { location: "Lantern gate" } }] });

  await page.getByRole("button", { name: "Erase all data" }).click();
  await page.getByRole("button", { name: "Erase everything" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create your first world" })).toBeVisible();

  await openDrawerIfMobile(page);
  await page.getByRole("button", { name: /^Settings/ }).filter({ visible: true }).click();
  await page.getByRole("tab", { name: "Data" }).click();
  await page.getByLabel("Restore backup file").setInputFiles(file);
  await expect(page.getByText("Backup restored", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await openDrawerIfMobile(page);
  await expect(page.getByRole("button", { name: /^Backup Vale/ })).toBeVisible();
});
