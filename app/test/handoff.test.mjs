// src/shell/handoff.js: one tool hands a point to another ("Ölçümde A yap")
// and the receiving tool takes it once when it opens.

import assert from "node:assert/strict";
import test from "node:test";
import { createHandoffStore } from "../src/shell/handoff.js";

const ANKARA = Object.freeze({ latitude: "39.933365", longitude: "32.859742", slot: "end" });

test("send stores the point and opens the tool; consume returns it once", () => {
  const opened = [];
  const store = createHandoffStore((toolId) => opened.push(toolId));
  store.send("measure", ANKARA);
  assert.deepEqual(opened, ["measure"]);
  assert.deepEqual(store.consume("measure"), ANKARA);
  assert.equal(store.consume("measure"), null, "a point is consumed only once");
});

test("consume for another tool returns null and leaves the point waiting", () => {
  const store = createHandoffStore();
  store.send("measure", ANKARA);
  assert.equal(store.consume("positions"), null);
  assert.deepEqual(store.consume("measure"), ANKARA);
});

test("nothing sent means nothing to consume; a later send replaces an unconsumed one", () => {
  const store = createHandoffStore();
  assert.equal(store.consume("measure"), null);
  store.send("measure", { latitude: "1", longitude: "2" });
  store.send("measure", ANKARA);
  assert.deepEqual(store.consume("measure"), ANKARA);
  assert.equal(store.consume("measure"), null);
});

test("a mounted receiver is told when a point arrives, so a hidden tool still takes it", () => {
  // The workspace tool stays mounted (hidden) behind a page tool; a point
  // sent from that page must not wait for a remount that never comes.
  const store = createHandoffStore();
  const received = [];
  const unsubscribe = store.subscribe("measure", () => received.push(store.consume("measure")));
  store.send("positions", { latitude: "1", longitude: "2" });
  assert.deepEqual(received, [], "points for other tools are not announced");
  store.send("measure", ANKARA);
  assert.deepEqual(received, [ANKARA]);
  assert.equal(store.consume("measure"), null, "the listener took it");
  unsubscribe();
  store.send("measure", ANKARA);
  assert.equal(received.length, 1, "no calls after unsubscribing");
  assert.deepEqual(store.consume("measure"), ANKARA, "the point waits for the next mount");
});
