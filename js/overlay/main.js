(() => {
  "use strict";
  const preview = new URLSearchParams(location.search).get("preview") === "1";
  const renderer = new ChatRenderer.Renderer(document.getElementById("chat"));
  let stream;
  const sample = () => renderer.replace(ChatRenderer.SAMPLE_MESSAGES);
  if (preview) {
    sample();
    window.addEventListener("message", (event) => {
      if (
        event.origin !== location.origin ||
        event.source !== parent ||
        event.data?.type !== "preview-settings"
      )
        return;
      try {
        renderer.configure({ ...event.data.settings, fadeTime: 0 });
        sample();
      } catch {
        /* Ignore invalid preview input. */
      }
    });
    parent.postMessage({ type: "preview-ready" }, location.origin);
  } else {
    stream = new EventSource("/api/chat/stream");
    stream.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "snapshot") {
          renderer.configure(data.settings);
          renderer.replace(data.messages);
        } else if (data.type === "chat") renderer.add(data);
        else if (data.type === "settings") renderer.configure(data.settings);
        else if (data.type === "clear") renderer.replace([]);
      } catch (error) {
        console.warn("오버레이 업데이트 실패:", error.message);
      }
    };
  }
  window.addEventListener(
    "pagehide",
    () => {
      stream?.close();
      renderer.destroy();
    },
    { once: true },
  );
})();
