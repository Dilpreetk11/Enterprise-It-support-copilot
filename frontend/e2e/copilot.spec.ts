import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-admin-key", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let body: unknown;
    if (path === "/api/health") body = { status: "ok", llm_model: "test-model", embedding_model: "test-embedding", groq_configured: true, pinecone_configured: true, tavily_configured: true };
    else if (path === "/api/chat") body = { answer: "**VPN guidance**\n\n1. Open NovaSecure.\n2. Sign in with MFA.", source_used: "private_kb", citations: [{ title: "company_it_handbook.md", type: "private_kb" }], trace: ["Router -> KB", "Answer generation -> PRIVATE KB"], retry_count: 0, status: "success" };
    else if (path === "/api/ingest") { expect(route.request().headers()["x-admin-key"]).toBe("test-admin"); body = { file: "policy.md", chunks: 2, vectors_created: 2 }; }
    else if (path === "/api/admin/audit") body = { entries: [] };
    else body = { files: 2, chunks: 4, vectors_created: 4 };
    await route.fulfill({ json: body, headers });
  });
});
test("chat, citations, trace, clearing and responsive layout", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "API connected" })).toBeVisible();
  if (testInfo.project.name === "desktop") await expect(page.getByRole("button", { name: /Request new hardware/ })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath("welcome.png"), fullPage: true });
  await page.getByRole("button", { name: /Connect to the VPN/ }).click();
  await expect(page.getByText("VPN guidance", { exact: true })).toBeVisible();
  await expect(page.getByText("company_it_handbook.md", { exact: true })).toBeVisible();
  await page.getByText("View decision path").click();
  await expect(page.getByText("Router -> KB", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const trace = await page.getByText("Router -> KB", { exact: true }).boundingBox();
    const composer = await page.locator(".composer-wrap").boundingBox();
    return trace!.y + trace!.height < composer!.y;
  }).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("conversation.png"), fullPage: true });
  const prompts = page.getByRole("navigation", { name: "Suggested questions" });
  await expect(prompts.getByRole("button")).toHaveCount(4);
  await expect(prompts.getByRole("button", { name: "Connect to the VPN", exact: true })).toBeEnabled();
  await prompts.getByRole("button", { name: "Reset my password", exact: true }).click();
  await expect(page.getByText("What are the company password policy requirements and self-service reset steps?", { exact: true })).toBeVisible();
  await expect(page.getByText("VPN guidance", { exact: true })).toHaveCount(2);
  await expect(prompts.getByRole("button", { name: "Request new hardware", exact: true })).toBeEnabled();
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: /New conversation/ }).click();
  await expect(page.getByRole("heading", { name: "How can I help you today?" })).toBeVisible();
});
test("uploads through the real multipart contract and shows empty audit", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add knowledge" }).click();
  await page.getByLabel("Admin key", { exact: true }).fill("test-admin");
  await page.getByLabel("Company document", { exact: true }).setInputFiles({ name: "policy.md", mimeType: "text/markdown", buffer: Buffer.from("VPN policy") });
  await page.getByRole("button", { name: "Index document", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2 chunks, 2 vectors indexed");
  await expect(page.getByLabel("Admin key", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Close panel" }).click();
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Recent audit log", exact: true }).click();
  await page.getByLabel("Admin key", { exact: true }).fill("test-admin");
  await page.getByRole("button", { name: "Load recent queries" }).click();
  await expect(page.getByText("No queries recorded yet.")).toBeVisible();
});
test("offline state and failed chat can recover", async ({ page }) => {
  await page.route("**/api/health", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("API offline · Retry", { exact: true })).toBeVisible();
  await page.route("**/api/chat", (route) => route.fulfill({ status: 500, headers: { "access-control-allow-origin": "*" }, json: { detail: "Temporary backend failure" } }));
  await page.getByLabel("Ask an IT support question").fill("VPN help");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Temporary backend failure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry question" })).toBeEnabled();
});
