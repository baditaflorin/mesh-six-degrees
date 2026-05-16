import { useEffect, useState } from "react";
import {
  QRExchange,
  shortestPath,
  makeScanPayload,
  type MeshConfig,
  type YRoom,
  type Edge,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };
const NAME_KEY = (p: string) => `${p}:displayName`;

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="viral-screen">
        <h1>six degrees</h1>
        <p className="viral-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY(config.storagePrefix)) ?? "",
  );
  const [, rerender] = useState(0);

  useEffect(() => {
    if (name) localStorage.setItem(NAME_KEY(config.storagePrefix), name);
  }, [name, config.storagePrefix]);

  useEffect(() => {
    const edges = room.doc.getArray<Edge>("edges");
    const names = room.doc.getMap<string>("names");
    const targets = room.doc.getMap<string>("targets");
    const cb = () => rerender((n) => n + 1);
    edges.observe(cb);
    names.observe(cb);
    targets.observe(cb);
    return () => {
      edges.unobserve(cb);
      names.unobserve(cb);
      targets.unobserve(cb);
    };
  }, [room]);

  const edges = room.doc.getArray<Edge>("edges");
  const names = room.doc.getMap<string>("names");
  const targets = room.doc.getMap<string>("targets");

  useEffect(() => {
    if (name.trim()) names.set(room.peerId, name.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, room.peerId]);

  const edgeList = edges.toArray();
  const has = (from: string, to: string) => edgeList.some((e) => e.from === from && e.to === to);

  const connect = (otherPeerId: string, otherName?: string) => {
    const t = name.trim();
    if (!t || otherPeerId === room.peerId) return;
    room.doc.transact(() => {
      names.set(room.peerId, t);
      if (otherName) names.set(otherPeerId, otherName);
      if (!has(room.peerId, otherPeerId))
        edges.push([{ from: room.peerId, to: otherPeerId, ts: Date.now() }]);
      if (!has(otherPeerId, room.peerId))
        edges.push([{ from: otherPeerId, to: room.peerId, ts: Date.now() }]);
    });
  };

  const setStart = () => targets.set("start", room.peerId);
  const setGoal = () => targets.set("goal", room.peerId);

  const start = targets.get("start") ?? null;
  const goal = targets.get("goal") ?? null;
  const path = start && goal ? shortestPath(edgeList, start, goal) : null;

  const myPayload = makeScanPayload(room.roomId, room.peerId, name.trim() || "anon");

  const knownPeers: string[] = [];
  names.forEach((_v, k) => knownPeers.push(k));

  return (
    <div className="viral-screen">
      <header>
        <h1>six degrees</h1>
        <p className="viral-status">
          {knownPeers.length} people · {edgeList.length / 2} edges
        </p>
      </header>

      <input
        className="viral-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="your name"
        maxLength={48}
        aria-label="your name"
      />

      <QRExchange
        myPayload={myPayload}
        showLabel="your QR — meet someone to scan"
        scanLabel="scan to add an edge"
        onScan={(parsed) => connect(parsed.peerId, parsed.extra ?? undefined)}
      />

      <section>
        <h2 className="viral-section-title">pick the two endpoints</h2>
        <div className="sx-targets">
          <button type="button" className="viral-ghost" onClick={setStart} disabled={!name.trim()}>
            🅰 set me as start
          </button>
          <button type="button" className="viral-ghost" onClick={setGoal} disabled={!name.trim()}>
            🅱 set me as goal
          </button>
        </div>
        <p className="viral-status" style={{ marginTop: "0.4rem" }}>
          start: <strong>{start ? (names.get(start) ?? start.slice(0, 6)) : "—"}</strong> · goal:{" "}
          <strong>{goal ? (names.get(goal) ?? goal.slice(0, 6)) : "—"}</strong>
        </p>
      </section>

      <section>
        <h2 className="viral-section-title">shortest path</h2>
        {!start || !goal ? (
          <p className="viral-empty">pick a start and a goal</p>
        ) : path === null ? (
          <p className="viral-empty">no path yet — need more scans</p>
        ) : (
          <ol className="sx-path">
            {path.map((p, i) => (
              <li key={p} className={p === room.peerId ? "is-me" : ""}>
                {i > 0 && <span className="sx-arrow">→</span>}
                <span className="sx-node">
                  {names.get(p) ?? p.slice(0, 6)}
                  {p === room.peerId ? " (you)" : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
        {path && (
          <p className="viral-status">
            degrees of separation: <strong>{path.length - 1}</strong>
          </p>
        )}
      </section>
    </div>
  );
}
