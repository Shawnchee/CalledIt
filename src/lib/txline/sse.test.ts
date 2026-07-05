import { test } from "node:test";
import assert from "node:assert/strict";

// Node's native TypeScript execution needs a real, resolvable extension on
// relative ESM specifiers ("./sse.ts"), but this repo's tsconfig uses
// "bundler" module resolution, which rejects a literal ".ts" import
// specifier unless `allowImportingTsExtensions` is set. Building the
// specifier at runtime keeps both tools happy: tsc only sees an opaque
// string (no static specifier to reject), and Node still resolves it to
// sse.ts. The type import below (with the tsc-idiomatic ".js" extension)
// keeps this file fully typed despite the dynamic value import.
type SseModule = typeof import("./sse.js");
const { parseSseFrames }: SseModule = await import("./sse" + ".ts");

test("parses a single-line data frame", () => {
  const { frames, rest } = parseSseFrames('data: {"a":1}\n\n');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].data, '{"a":1}');
  assert.equal(frames[0].id, undefined);
  assert.equal(rest, "");
});

test("joins multi-line data lines with \\n before returning", () => {
  const raw = 'data: {"a":1,\ndata: "b":2}\n\n';
  const { frames, rest } = parseSseFrames(raw);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].data, '{"a":1,\n"b":2}');
  assert.equal(rest, "");
  // and it really is valid JSON once joined
  assert.deepEqual(JSON.parse(frames[0].data), { a: 1, b: 2 });
});

test("forwards the id: field alongside data:", () => {
  const { frames } = parseSseFrames('id: evt-42\ndata: {"ok":true}\n\n');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].id, "evt-42");
  assert.equal(frames[0].data, '{"ok":true}');
});

test("leaves a partial trailing frame in rest instead of parsing it early", () => {
  const { frames, rest } = parseSseFrames(
    'data: {"a":1}\n\ndata: {"b":2}\nid: 7',
  );
  assert.equal(frames.length, 1);
  assert.equal(frames[0].data, '{"a":1}');
  assert.equal(rest, 'data: {"b":2}\nid: 7');

  // feeding `rest` back in with the closing blank line completes the frame
  const next = parseSseFrames(rest + "\n\n");
  assert.equal(next.frames.length, 1);
  assert.equal(next.frames[0].data, '{"b":2}');
  assert.equal(next.frames[0].id, "7");
  assert.equal(next.rest, "");
});

test("ignores blank/keep-alive-only segments", () => {
  const { frames, rest } = parseSseFrames(":\n\ndata: {\"x\":1}\n\n");
  assert.equal(frames.length, 1);
  assert.equal(frames[0].data, '{"x":1}');
  assert.equal(rest, "");
});

test("returns no frames and passes the whole buffer through as rest when no blank line has arrived yet", () => {
  const { frames, rest } = parseSseFrames('data: {"a":1}');
  assert.equal(frames.length, 0);
  assert.equal(rest, 'data: {"a":1}');
});
