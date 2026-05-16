import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("two peers connect via paste; shortest path of length 2 with 1 degree", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");

    await a.locator(".mesh-qrx-payload summary").click();
    const payload = (await a.locator(".mesh-qrx-payload code").textContent()) ?? "";
    await b.getByPlaceholder("or paste a mesh:// payload").fill(payload);
    await b.getByRole("button", { name: "use", exact: true }).click();

    await a.getByRole("button", { name: /set me as start/ }).click();
    await b.getByRole("button", { name: /set me as goal/ }).click();

    await expect(a.locator(".viral-status").last()).toContainText("degrees of separation: 1");
    await expect(b.locator(".sx-node")).toContainText(["alice"]);
  } finally {
    await cleanup();
  }
});
