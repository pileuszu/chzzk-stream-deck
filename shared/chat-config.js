(function (root, factory) {
  const config = factory();
  if (typeof module === "object" && module.exports) module.exports = config;
  else root.StreamDeckConfig = config;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const THEMES = Object.freeze([
    {
      id: "maplestory",
      name: "메이플스토리",
      subtitle: "작은 모험이 시작되는 채팅창",
      tag: "NEW",
      color: "#e78738",
    },
    {
      id: "simple-purple",
      name: "Simple Purple",
      subtitle: "보랏빛 말풍선과 작은 우주",
      tag: "CLASSIC",
      color: "#a78bda",
    },
    {
      id: "unicorn-overlord",
      name: "Unicorn Overlord",
      subtitle: "모험가를 위한 양피지와 금빛 장식",
      tag: "FANTASY",
      color: "#b9995b",
    },
  ]);
  const DEFAULT_SETTINGS = Object.freeze({
    theme: "simple-purple",
    channelId: "",
    maxMessages: 5,
    alignment: "left",
    fadeTime: 0,
    maxNicknameLength: 12,
    fadeMask: false,
    fontSize: 18,
    opacity: 96,
  });
  function normalizeChannelId(value) {
    const input = String(value ?? "").trim();
    if (!input) return "";
    if (/^[a-f\d]{32}$/i.test(input)) return input.toLowerCase();
    try {
      const url = new URL(input);
      if (
        url.hostname !== "chzzk.naver.com" ||
        !["http:", "https:"].includes(url.protocol)
      )
        throw new Error();
      const match = url.pathname.match(/^\/(?:live\/)?([a-f\d]{32})(?:\/|$)/i);
      if (match) return match[1].toLowerCase();
    } catch {
      /* Report the same useful validation message for all invalid inputs. */
    }
    throw new Error("치지직 채널 주소 또는 32자리 채널 ID를 입력해주세요.");
  }
  function validateSettings(patch, current = DEFAULT_SETTINGS) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch))
      throw new Error("설정 형식이 올바르지 않습니다.");
    const next = { ...DEFAULT_SETTINGS, ...current };
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(DEFAULT_SETTINGS, key)) continue;
      if (key === "channelId") next[key] = normalizeChannelId(value);
      else if (key === "theme") {
        if (!THEMES.some((theme) => theme.id === value))
          throw new Error("지원하지 않는 테마입니다.");
        next[key] = value;
      } else if (key === "alignment") {
        next[key] = value === "default" ? "left" : value;
        if (!["left", "center", "right"].includes(next[key]))
          throw new Error("정렬 값을 확인해주세요.");
      } else if (key === "fadeMask") {
        if (typeof value !== "boolean")
          throw new Error("페이드 마스크 설정은 참 또는 거짓이어야 합니다.");
        next[key] = value;
      } else {
        const ranges = {
          maxMessages: [1, 100],
          fadeTime: [0, 300],
          maxNicknameLength: [1, 50],
          fontSize: [12, 36],
          opacity: [40, 100],
        };
        const [min, max] = ranges[key];
        const number =
          typeof value === "number" ||
          (typeof value === "string" && value.trim())
            ? Number(value)
            : NaN;
        if (!Number.isInteger(number) || number < min || number > max)
          throw new Error(`${key}: ${min}~${max} 사이의 정수를 입력해주세요.`);
        next[key] = number;
      }
    }
    return next;
  }
  return { THEMES, DEFAULT_SETTINGS, normalizeChannelId, validateSettings };
});
