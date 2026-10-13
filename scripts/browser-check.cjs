const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { mkdtemp, copyFile, mkdir, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const root = resolve(__dirname, "..");
const screenshotDir = join(root, "docs", "screenshots");
const log = [];
const record = (message) => {
  log.push("PASS " + message);
  console.log("PASS", message);
};
(async () => {
  let browser, server, vite, directory;
  const consoleErrors = [];
  try {
    directory = await mkdtemp(join(tmpdir(), "finops-browser-"));
    for (const name of ["clients", "accounts", "transactions"])
      await copyFile(
        join(root, "backend", "data", name + ".json"),
        join(directory, name + ".json"),
      );
    const { createApp } = await import(
      pathToFileURL(join(root, "backend", "src", "app.js"))
    );
    server = createApp({
      dataDirectory: directory,
      frontendOrigin: "http://127.0.0.1:5175",
    }).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const api = `http://127.0.0.1:${server.address().port}/api/v1`;
    vite = spawn(
      process.execPath,
      [
        join(root, "frontend", "node_modules", "vite", "bin", "vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        "5175",
      ],
      {
        cwd: join(root, "frontend"),
        env: { ...process.env, VITE_API_BASE_URL: api },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch("http://127.0.0.1:5175")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, "Vite must start");
    browser = await chromium.launch({
      headless: true,
      ...(process.env.BROWSER_EXECUTABLE
        ? { executablePath: process.env.BROWSER_EXECUTABLE }
        : {}),
      args: process.env.BROWSER_ARGS
        ? JSON.parse(process.env.BROWSER_ARGS)
        : ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (e) => consoleErrors.push(e.message));
    await mkdir(screenshotDir, { recursive: true });
    const url = (path) => "http://127.0.0.1:5175" + path;
    const waitText = (text) =>
      page.getByText(text, { exact: true }).first().waitFor();
    await page.goto(url("/"));
    await waitText("Operations overview");
    await page.locator(".metric strong").first().waitFor();
    assert.equal(
      await page.locator(".metric strong").first().textContent(),
      "10",
    );
    assert.equal(await page.locator("tbody tr").count(), 5);
    record("dashboard totals and five recent transactions");
    await page.screenshot({
      path: join(screenshotDir, "01-dashboard-desktop.png"),
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Corporate clients", exact: true })
      .click();
    await waitText("Maple Ridge Manufacturing");
    await page.screenshot({
      path: join(screenshotDir, "02-clients-desktop.png"),
      fullPage: true,
    });
    record("directory navigation and loaded API records");
    await page.getByLabel("Search clients").fill("MAPLE");
    await page.waitForFunction(
      () =>
        document.querySelectorAll("tbody tr").length === 1 &&
        document.querySelector("tbody")?.textContent.includes("Maple Ridge"),
    );
    await page.getByLabel("Status", { exact: true }).selectOption("Active");
    await page
      .getByLabel("Industry", { exact: true })
      .selectOption("Manufacturing");
    await waitText("Maple Ridge Manufacturing");
    record("combined client search and filters");
    await page.goto(url("/clients/new"));
    await page.getByLabel("Registered company name").waitFor();
    await page
      .getByLabel("Registered company name")
      .fill("Browser Test Corporation");
    await page
      .getByLabel("Business registration number")
      .fill("BROWSER-TEST-001");
    await page
      .getByLabel("Industry", { exact: true })
      .selectOption("Technology");
    await page.getByLabel("Country", { exact: true }).selectOption("Canada");
    await page.getByLabel("Contact email").fill("browser@example.com");
    await page.getByLabel("Contact phone (optional)").fill("+1 555 010 9998");
    let clientPosts = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url() === api + "/clients") clientPosts++;
    });
    await page
      .getByRole("button", { name: "Register client", exact: true })
      .dblclick();
    await waitText("Client registered successfully.");
    assert.equal(clientPosts, 1);
    await waitText("Browser Test Corporation");
    const profileUrl = page.url();
    record("registration, confirmation, profile and duplicate-submission lock");
    await page.getByRole("link", { name: "Edit client", exact: true }).click();
    await page
      .getByLabel("Registered company name")
      .fill("Updated Browser Corporation");
    await page.getByRole("button", { name: "Save changes" }).click();
    await waitText("Client updated successfully.");
    await waitText("Updated Browser Corporation");
    record("client editing and refreshed profile");
    await page
      .getByRole("link", { name: "+ Register account", exact: true })
      .click();
    await page.getByLabel("Account type").selectOption("Operating");
    await page.getByLabel("Currency", { exact: true }).selectOption("CAD");
    await page.getByLabel("Opening balance").fill("12500.751");
    await page
      .getByRole("button", { name: "Register account", exact: true })
      .click();
    await waitText(
      "Enter a non-negative amount with at most two decimal places.",
    );
    record("fractional-cent form validation");
    await page.getByLabel("Opening balance").fill("12500.75");
    await page
      .getByRole("button", { name: "Register account", exact: true })
      .click();
    await waitText("Account registered successfully.");
    await waitText("CAD 12,500.75");
    record("account registration, ownership and exact cents display");
    await page.screenshot({
      path: join(screenshotDir, "03-account-details.png"),
      fullPage: true,
    });
    await page.goto(profileUrl);
    await page.locator("tbody tr").waitFor();
    assert.equal(await page.locator("tbody tr").count(), 1);
    record("client-account relationship");
    await page.goto(url("/transactions"));
    await page.getByLabel("Reference number").fill("TXN-2026-000001");
    await page
      .getByRole("link", { name: "TXN-2026-000001", exact: true })
      .waitFor();
    await page
      .getByRole("link", { name: "TXN-2026-000001", exact: true })
      .click();
    await page.getByRole("heading", { name: "TXN-2026-000001" }).waitFor();
    const related = page.locator(".details a");
    assert.equal(await related.count(), 2);
    await related.first().click();
    await waitText("Related transactions");
    record("transaction investigation and related account navigation");
    await page.goto(url("/transactions"));
    await page.getByLabel("Reference number").fill("DOES-NOT-EXIST");
    await waitText("No matching records found.");
    record("empty transaction search state");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByLabel("From date (UTC)").fill("2026-10-10");
    await page.getByLabel("To date (UTC)").fill("2026-09-02");
    await waitText("Start date must not follow end date.");
    record("invalid date range error and retry state");
    await page.goto(url("/accounts"));
    await page.getByLabel("Currency", { exact: true }).selectOption("USD");
    await page.waitForFunction(() =>
      document.querySelector("tbody")?.textContent.includes("USD"),
    );
    assert.ok((await page.locator("tbody").textContent()).includes("USD"));
    await page.getByLabel("Status", { exact: true }).selectOption("Closed");
    await page.waitForFunction(
      () => document.querySelectorAll("tbody tr").length === 1,
    );
    await page.locator("tbody .badge.closed").waitFor();
    record("account currency and status filtering");
    await page.goto(url("/"));
    await page.locator(".metric strong").first().waitFor();
    assert.equal(
      await page.locator(".metric strong").first().textContent(),
      "11",
    );
    assert.equal(
      await page.locator(".metric strong").nth(2).textContent(),
      "19",
    );
    record("dashboard refresh after client and account creation");
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.screenshot({
      path: join(screenshotDir, "04-dashboard-tablet.png"),
      fullPage: true,
    });
    assert.ok(await page.locator("main").isVisible());
    assert.ok(await page.locator("nav").isVisible());
    assert.ok(
      await page
        .locator(".table-wrap")
        .evaluate((e) => e.scrollWidth > e.clientWidth),
    );
    record("tablet dashboard layout, navigation and scrollable table");
    await page.goto(url("/transactions"));
    await page.locator("tbody tr").first().waitFor();
    await page.screenshot({
      path: join(screenshotDir, "05-transactions-tablet.png"),
      fullPage: true,
    });
    await page.goto(url("/not-a-page"));
    await page.getByRole("heading", { name: "Page not found" }).waitFor();
    record("frontend Not Found route");
    await page.route(api + "/dashboard/summary", (route) => route.abort());
    await page.goto(url("/"));
    await waitText("Unable to load this view");
    await page.unroute(api + "/dashboard/summary");
    await page.getByRole("button", { name: "Try again" }).click();
    await page.locator(".metric strong").first().waitFor();
    record("failed API loading and successful retry");
    await page.route(api + "/dashboard/summary", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.reload();
    await waitText("Loading records…");
    await page.locator(".metric strong").first().waitFor();
    record("visible asynchronous loading state");
    assert.deepEqual(consoleErrors, []);
    record("no browser runtime errors");
    await writeFile(
      join(root, "docs", "browser-test-results.txt"),
      new Date().toISOString() + "\n" + log.join("\n") + "\n",
    );
  } catch (error) {
    console.error(error);
    log.push("FAIL " + error.message);
    await writeFile(
      join(root, "docs", "browser-test-results.txt"),
      log.join("\n") + "\n",
    );
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (vite) vite.kill("SIGTERM");
    if (server) await new Promise((r) => server.close(r));
    if (directory) await rm(directory, { recursive: true, force: true });
  }
})();
