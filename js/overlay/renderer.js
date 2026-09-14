(function (root, factory) {
  const config =
    typeof module === "object" && module.exports
      ? require("../../shared/chat-config")
      : root.StreamDeckConfig;
  const api = factory(config);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ChatRenderer = api;
})(typeof globalThis === "object" ? globalThis : this, function (config) {
  "use strict";
  const SAMPLE_MESSAGES = [
    {
      id: "demo-1",
      username: "초록달팽이",
      message: "오늘도 헤네시스에서 출석 체크! 🍁",
    },
    {
      id: "demo-2",
      username: "단풍모험가",
      message: "이번 보스는 느낌이 좋은데요?",
    },
    { id: "demo-3", username: "주황버섯", message: "레벨 업 축하해요!! ✨" },
    {
      id: "demo-4",
      username: "피레의모험",
      message: "함께하는 작은 모험, 반가워요 ☺",
    },
  ];
  function imageUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        /(^|\.)(pstatic\.net|naver\.net|naver\.com)$/.test(url.hostname) &&
        !url.username &&
        !url.password
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
  function appendMessageText(document, target, text, emojis = {}) {
    let cursor = 0;
    for (const match of text.matchAll(/\{:(.*?):\}/g)) {
      target.append(document.createTextNode(text.slice(cursor, match.index)));
      const url = Object.hasOwn(emojis, match[1]) && imageUrl(emojis[match[1]]);
      if (url) {
        const image = document.createElement("img");
        image.className = "chat-emote";
        image.alt = match[0];
        image.src = url;
        image.referrerPolicy = "no-referrer";
        image.addEventListener(
          "error",
          () => image.replaceWith(document.createTextNode(match[0])),
          { once: true },
        );
        target.append(image);
      } else target.append(document.createTextNode(match[0]));
      cursor = match.index + match[0].length;
    }
    target.append(document.createTextNode(text.slice(cursor)));
  }
  class Renderer {
    constructor(container, settings = {}) {
      this.container = container;
      this.document = container.ownerDocument;
      this.messages = [];
      this.settings = config.validateSettings(settings);
      this.timer = setInterval(() => this.expire(), 500);
      this.timer.unref?.();
      this.render();
    }
    configure(settings) {
      this.settings = config.validateSettings(settings, this.settings);
      this.render();
    }
    replace(messages) {
      const seen = new Set();
      this.messages = messages
        .filter((message) => message && typeof message.message === "string")
        .filter((message) => {
          if (message.id && seen.has(message.id)) return false;
          seen.add(message.id);
          return true;
        })
        .slice(-200)
        .map((message) => ({
          ...message,
          receivedAt: Date.parse(message.timestamp) || Date.now(),
        }));
      this.render();
    }
    add(message) {
      if (
        !message ||
        typeof message.message !== "string" ||
        (message.id && this.messages.some((item) => item.id === message.id))
      )
        return;
      this.messages.push({
        ...message,
        receivedAt: Date.parse(message.timestamp) || Date.now(),
      });
      if (this.messages.length > 200) this.messages.shift();
      this.render();
    }
    expire() {
      if (!this.settings.fadeTime) return;
      const next = this.messages.filter(
        (message) =>
          Date.now() - message.receivedAt < this.settings.fadeTime * 1000,
      );
      if (next.length !== this.messages.length) {
        this.messages = next;
        this.render();
      }
    }
    render() {
      const s = this.settings;
      this.container.className = `chat-stack theme-${s.theme} align-${s.alignment}${s.fadeMask ? " fade-mask" : ""}`;
      this.container.style.setProperty("--chat-font-size", `${s.fontSize}px`);
      this.container.style.setProperty("--chat-opacity", s.opacity / 100);
      const fragment = this.document.createDocumentFragment();
      const visible = this.messages
        .filter(
          (message) =>
            !s.fadeTime || Date.now() - message.receivedAt < s.fadeTime * 1000,
        )
        .slice(-s.maxMessages);
      for (const data of visible) {
        const card = this.document.createElement("article");
        card.className = "chat-card";
        const header = this.document.createElement("div");
        header.className = "chat-name";
        const name = Array.from(String(data.username || "익명"));
        header.textContent =
          name.slice(0, s.maxNicknameLength).join("") +
          (name.length > s.maxNicknameLength ? "…" : "");
        const body = this.document.createElement("div");
        body.className = "chat-text";
        appendMessageText(
          this.document,
          body,
          data.message.slice(0, 10000),
          data.extras?.emojis || {},
        );
        card.append(header, body);
        fragment.append(card);
      }
      this.container.replaceChildren(fragment);
    }
    destroy() {
      clearInterval(this.timer);
      this.container.replaceChildren();
    }
  }
  return { Renderer, SAMPLE_MESSAGES, imageUrl };
});
