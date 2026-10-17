/* global fetch, AbortSignal, getComputedStyle, document */
import { mkdir } from "node:fs/promises";
import process from "node:process";
import console from "node:console";
import { chromium, expect } from "@playwright/test";

// Health and UI only: never invokes an LLM or writes vectors/documents.
const frontend = process.env.LOCAL_FRONTEND_URL || "http://localhost:3000";
const backend = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
const response = await fetch(`${backend.replace(/\/$/, "")}/api/health`, { signal: AbortSignal.timeout(10_000) });
if (!response.ok || (await response.json()).status !== "ok") throw new Error("Backend health check failed.");
console.log("Real Python API: healthy");
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  await page.goto(frontend);
  await expect(page.getByRole("button", { name: "API connected", exact: true })).toBeVisible({ timeout: 20_000 });
  const colorScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  if (colorScheme !== "dark") throw new Error("Expected the dark theme.");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/local-dark.png", fullPage: true });
  console.log("Real browser → FastAPI: connected; dark theme verified");
} finally { await browser.close(); }
