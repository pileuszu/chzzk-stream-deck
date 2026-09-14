(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const { THEMES, DEFAULT_SETTINGS, validateSettings, normalizeChannelId } =
    StreamDeckConfig;
  let settings = { ...DEFAULT_SETTINGS },
    dirty = false,
    previewMode = "sample",
    stream;
  const form = $("settings-form");
  const previewResize = new ResizeObserver(() => {
    const width = $("preview-stage").clientWidth;
    $("preview-stage").style.height = `${width * 1.5}px`;
    Object.assign($("preview").style, {
      width: "400px",
      height: "600px",
      transform: `scale(${width / 400})`,
      transformOrigin: "top left",
    });
  });
  previewResize.observe($("preview-stage"));
  async function api(path, body) {
    const response = await fetch(
      path,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    const data = await response.json();
    if (!response.ok || !data.success)
      throw new Error(data.error || "요청을 처리하지 못했습니다.");
    return data;
  }
  function notice(message, error = false) {
    $("notice").textContent = message;
    $("notice").hidden = !message;
    $("notice").classList.toggle("error", error);
  }
  function getDraft() {
    const values = Object.fromEntries(new FormData(form));
    values.fadeMask = form.elements.fadeMask.checked;
    return validateSettings(values, settings);
  }
  function fillForm(next) {
    settings = next;
    for (const [key, value] of Object.entries(next)) {
      const input = form.elements.namedItem(key);
      if (!input) continue;
      if (key === "fadeMask") input.checked = value;
      else input.value = value;
    }
    $("channelId").value = next.channelId;
    dirty = false;
    $("save-state").textContent = "저장된 설정을 사용 중이에요.";
    updatePreview();
  }
  function updatePreview() {
    let draft;
    try {
      draft = getDraft();
    } catch {
      return;
    }
    const theme = THEMES.find((theme) => theme.id === draft.theme);
    $("preview-theme").textContent = theme.name;
    $("preview-stage").dataset.theme = draft.theme;
    if (previewMode === "sample")
      $("preview").contentWindow?.postMessage(
        { type: "preview-settings", settings: draft },
        location.origin,
      );
  }
  function updateStatus(status) {
    const chat = status.chat;
    const titles = {
      idle: "연결 대기",
      connecting: "채널 연결 중",
      connected: "채팅 연결됨",
      reconnecting: "재연결 중",
      error: "연결 확인 필요",
    };
    $("chat-state").lastChild.textContent =
      ` ${titles[chat.state] || "연결 대기"}`;
    $("chat-state").dataset.state = chat.state;
    $("channel-name").textContent = chat.channelName || "CHZZK";
    $("connect").hidden = chat.active;
    $("disconnect").hidden = !chat.active;
    $("connection-detail").textContent =
      chat.error ||
      (chat.connected
        ? `실시간 채팅 ${chat.messageCount}개를 받았어요. 채널: ${chat.channelName || chat.channelId}`
        : chat.state === "reconnecting"
          ? `자동 재연결 ${chat.retryCount}회째 시도 중이에요.`
          : "방송 중인 채널의 채팅을 읽어옵니다. 스트림 키는 필요 없어요.");
    $("connection-detail").classList.toggle(
      "error-text",
      chat.state === "error",
    );
  }
  for (const theme of THEMES) {
    const label = document.createElement("label");
    label.className = `theme-option ${theme.id}`;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "theme";
    input.value = theme.id;
    const art = document.createElement("span");
    art.className = "theme-art";
    const illustration = document.createElement("span");
    illustration.className = "theme-illustration";
    illustration.textContent =
      theme.id === "maplestory"
        ? "작은 모험의 시작"
        : theme.id === "simple-purple"
          ? "Hello, little star ✧"
          : "A new journey awaits";
    const tag = document.createElement("small");
    tag.textContent = theme.tag;
    art.append(tag, illustration);
    const title = document.createElement("strong");
    title.textContent = theme.name;
    const subtitle = document.createElement("span");
    subtitle.className = "theme-subtitle";
    subtitle.textContent = theme.subtitle;
    label.append(input, art, title, subtitle);
    $("theme-options").append(label);
  }
  form.addEventListener("input", () => {
    dirty = true;
    $("save-state").textContent =
      "미리보기 중 · 적용하면 방송 화면이 바뀌어요.";
    updatePreview();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    $("save-settings").disabled = true;
    try {
      const data = await api("/api/chat/settings", getDraft());
      const channelDraft = $("channelId").value;
      fillForm(data.settings);
      $("channelId").value = channelDraft;
      notice("설정을 저장했어요. OBS 오버레이에도 적용됩니다.");
    } catch (error) {
      notice(error.message, true);
    } finally {
      $("save-settings").disabled = false;
    }
  });
  $("reset-settings").onclick = () => {
    const channelDraft = $("channelId").value;
    fillForm({ ...DEFAULT_SETTINGS, channelId: settings.channelId });
    $("channelId").value = channelDraft;
    dirty = true;
    $("save-state").textContent =
      "기본값 미리보기 중 · 적용 버튼을 눌러 저장하세요.";
  };
  $("connect").onclick = async () => {
    $("connect").disabled = true;
    try {
      const channelId = normalizeChannelId($("channelId").value);
      if (!channelId) throw new Error("채널 주소 또는 ID를 입력해주세요.");
      const data = await api("/api/chat/start", { channelId });
      settings.channelId = channelId;
      updateStatus(data.status);
      notice("");
    } catch (error) {
      notice(error.message, true);
    } finally {
      $("connect").disabled = false;
    }
  };
  $("disconnect").onclick = async () => {
    try {
      updateStatus((await api("/api/chat/stop", {})).status);
    } catch (error) {
      notice(error.message, true);
    }
  };
  function mode(next) {
    previewMode = next;
    for (const id of ["sample", "live"]) {
      $(id + "-mode").classList.toggle("active", next === id);
      $(id + "-mode").setAttribute("aria-pressed", String(next === id));
    }
    $("preview").src =
      "/chat-overlay.html" + (next === "sample" ? "?preview=1" : "");
    $("preview-caption").textContent =
      next === "sample"
        ? "샘플은 이 미리보기에만 표시돼요."
        : "저장된 설정과 실제 수신 채팅을 표시해요.";
  }
  $("sample-mode").onclick = () => mode("sample");
  $("live-mode").onclick = () => mode("live");
  $("refresh-preview").onclick = () => mode(previewMode);
  window.addEventListener("message", (event) => {
    if (
      event.origin === location.origin &&
      event.source === $("preview").contentWindow &&
      event.data?.type === "preview-ready"
    )
      updatePreview();
  });
  $("copy-url").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("overlay-url").value);
      $("copy-url").textContent = "복사됨 ✓";
    } catch {
      $("overlay-url").select();
      notice("주소를 선택했어요. ⌘C 또는 Ctrl+C로 복사해주세요.");
    }
  };
  $("clear-chat").onclick = async () => {
    try {
      await api("/api/chat/clear", {});
      notice("표시 중인 채팅을 비웠어요. 새 채팅은 계속 표시됩니다.");
    } catch (error) {
      notice(error.message, true);
    }
  };
  async function init() {
    try {
      const [saved, config, status] = await Promise.all([
        api("/api/chat/settings"),
        api("/api/config"),
        api("/api/status"),
      ]);
      fillForm(saved.settings);
      updateStatus(status.status);
      const overlayUrl = new URL("/chat-overlay.html", location.origin).href;
      $("overlay-url").value = overlayUrl;
      $("open-overlay").href = overlayUrl;
      stream = new EventSource("/api/chat/stream");
      stream.onopen = () => {
        $("server-state").textContent = "● 서버 연결됨";
        $("server-state").classList.remove("offline");
      };
      stream.onerror = () => {
        $("server-state").textContent = "● 서버 재연결 중";
        $("server-state").classList.add("offline");
      };
      stream.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "status" || data.type === "snapshot")
            updateStatus(data.status);
          if ((data.type === "settings" || data.type === "snapshot") && !dirty)
            fillForm(data.settings);
        } catch (error) {
          notice(error.message, true);
        }
      };
    } catch (error) {
      $("server-state").textContent = "서버 연결 실패";
      notice(
        error.message + " · 서버를 실행하고 페이지를 새로고침해주세요.",
        true,
      );
    }
  }
  window.addEventListener(
    "pagehide",
    () => {
      stream?.close();
      previewResize.disconnect();
    },
    { once: true },
  );
  init();
})();
