const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { Renderer } = require("../js/overlay/renderer");
function fixture(t, settings) {
  const dom = new JSDOM('<main id="chat"></main>');
  const node = dom.window.document.getElementById("chat");
  const renderer = new Renderer(node, settings);
  t.after(() => {
    renderer.destroy();
    dom.window.close();
  });
  return { renderer, node };
}
test("chat and nickname markup stays literal; unsafe emoji URLs cannot execute", (t) => {
  const { renderer, node } = fixture(t);
  renderer.add({
    id: "1",
    username: "<img onerror=boom>",
    message: "<script>boom()</script> {:bad:} {:good:}",
    extras: {
      emojis: {
        bad: "javascript:boom()",
        good: "https://ssl.pstatic.net/example.png",
      },
    },
  });
  assert.equal(node.querySelectorAll("script").length, 0);
  assert.equal(node.querySelectorAll("img").length, 1);
  assert.match(node.textContent, /<script>boom\(\)<\/script>/);
  assert.match(node.textContent, /\{:bad:\}/);
  assert.equal(node.querySelector("img").getAttribute("onerror"), null);
});
test("limits, deduplication, live theme changes and Unicode truncation", (t) => {
  const { renderer, node } = fixture(t, {
    maxMessages: 2,
    maxNicknameLength: 2,
  });
  for (let i = 0; i < 3; i++)
    renderer.add({ id: String(i), username: "😀😀😀", message: `메시지 ${i}` });
  renderer.add({ id: "2", message: "duplicate" });
  assert.equal(node.children.length, 2);
  assert.equal(node.querySelector(".chat-name").textContent, "😀😀…");
  assert.doesNotMatch(node.textContent, /duplicate|메시지 0/);
  renderer.configure({ theme: "maplestory", alignment: "right" });
  assert(node.classList.contains("theme-maplestory"));
  assert.equal(node.children.length, 2);
  renderer.replace([]);
  assert.equal(node.children.length, 0);
});
test("expired messages stay hidden after settings changes and reconnect snapshots", (t) => {
  const { renderer, node } = fixture(t, { fadeTime: 1 });
  renderer.replace([
    {
      id: "old",
      message: "old",
      timestamp: new Date(Date.now() - 5000).toISOString(),
    },
  ]);
  assert.equal(node.children.length, 0);
  renderer.add({ id: "new", message: "new" });
  assert.equal(node.children.length, 1);
  renderer.messages[1].receivedAt -= 5000;
  renderer.expire();
  assert.equal(node.children.length, 0);
});
