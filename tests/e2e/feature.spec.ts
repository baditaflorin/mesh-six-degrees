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
    await b.getByPlaceholder("or paste a payload (URL or mesh://)").fill(payload);
    await b.getByRole("button", { name: "use", exact: true }).click();

    await a.getByRole("button", { name: /set me as start/ }).click();
    await b.getByRole("button", { name: /set me as goal/ }).click();

    await expect(a.locator(".viral-status").last()).toContainText("degrees of separation: 1");
    await expect(b.locator(".sx-node")).toContainText(["alice"]);
  } finally {
    await cleanup();
  }
});

// Load-bearing cross-peer assertion of the advertised core claim: "find the
// shortest scan-path between ANY two people in the room." A direct 1-hop edge
// is not really "six degrees" — the meaningful case is a path that traverses
// an intermediate node. We build a 3-node chain  carol <-> alice <-> bob  where
// carol and bob NEVER scanned each other, then pick carol + bob as the two
// endpoints and assert BOTH peers compute and render the 2-hop shortest path
// carol -> alice -> bob (degrees of separation: 2).
//
// The third node (carol) is seeded by feeding alice a recorded scan payload for
// a peer id that has no live page — exactly the "simulate a third node with a
// recorded scan payload" path the playbook allows. Picking carol as an endpoint
// exercises the new any-peer endpoint picker (pre-fix the UI could only set the
// LOCAL peer as start/goal, so a carol->bob query was impossible to express).
test("3-node chain: shortest path between two NON-adjacent people is the 2-hop route on both peers", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");

    // Discover each live peer's id from its own QR payload.
    await a.locator(".mesh-qrx-payload summary").click();
    await b.locator(".mesh-qrx-payload summary").click();
    const aPayload = (await a.locator(".mesh-qrx-payload code").textContent()) ?? "";
    const bPayload = (await b.locator(".mesh-qrx-payload code").textContent()) ?? "";
    const parse = (payload: string) => {
      const room = payload.match(/[#&]r=([^&]+)/);
      const peer = payload.match(/[#&]p=([^&]+)/);
      if (!room || !peer) throw new Error(`bad payload: ${payload}`);
      return { roomId: decodeURIComponent(room[1]!), peerId: decodeURIComponent(peer[1]!) };
    };
    const aInfo = parse(aPayload);
    const bInfo = parse(bPayload);

    // Edge 1: bob scans alice  ->  alice <-> bob (the connect() helper writes
    // both directions of the edge into the shared Yjs doc).
    await b.getByPlaceholder("or paste a payload (URL or mesh://)").fill(aPayload);
    await b.getByRole("button", { name: "use", exact: true }).click();

    // Edge 2: alice scans a RECORDED payload for a third person, "carol", whose
    // peer id is a fixed seed with no live page  ->  carol <-> alice.
    // Reuse alice's payload URL base, swapping in carol's peer id + name.
    const carolId = "carol-seed-3node";
    const base = aPayload.replace(/#.*/, "");
    const carolPayload = `${base}#r=${encodeURIComponent(aInfo.roomId)}&p=${encodeURIComponent(carolId)}&x=carol`;
    await a.getByPlaceholder("or paste a payload (URL or mesh://)").fill(carolPayload);
    await a.getByRole("button", { name: "use", exact: true }).click();

    // The chain is now  carol <-> alice <-> bob : 3 people, 2 undirected edges.
    // Wait for "3 people" on BOTH peers so we know carol's edge (added on alice)
    // has propagated across the mesh to bob before we query the path.
    await expect(a.locator(".viral-status").first()).toContainText("3 people · 2 edges");
    await expect(b.locator(".viral-status").first()).toContainText("3 people · 2 edges");

    // carol and bob are NON-adjacent: there is no direct carol<->bob edge.
    // Pick carol as start and bob as goal on peer A; the shared `targets` map
    // propagates the choice to peer B as well.
    await a.locator(".sx-pick-start").selectOption(carolId);
    await a.locator(".sx-pick-goal").selectOption(bInfo.peerId);

    // BOTH peers must compute + render the SHORTEST path carol -> alice -> bob,
    // i.e. exactly 2 degrees of separation, routed through the intermediate.
    for (const page of [a, b]) {
      const nodes = page.locator(".sx-path .sx-node");
      await expect(nodes).toHaveCount(3);
      await expect(nodes.nth(0)).toContainText("carol");
      await expect(nodes.nth(1)).toContainText("alice");
      await expect(nodes.nth(2)).toContainText("bob");
      await expect(page.locator(".viral-status").last()).toContainText("degrees of separation: 2");
    }
  } finally {
    await cleanup();
  }
});
