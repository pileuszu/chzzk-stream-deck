// Bundled panel template; user values are assigned through DOM properties.
export const panel = {
    id: "chat-panel", view: "chat",
    html: String.raw`<section id="chat-panel" class="module-screen chat-workspace" data-deck-view="chat" aria-label="채팅 모듈 설정" hidden>
<form id="chat-settings-form">
<div class="chat-connection-bar">
<label class="chat-channel-field"><span>채널</span><input type="text" id="chat-channel-id" aria-label="CHZZK 채널 ID" placeholder="CHZZK 채널 ID · 32자리" maxlength="32" pattern="[a-zA-Z0-9]{32}" spellcheck="false" autocomplete="off"></label>
<span class="connection-status" id="chat-connection-state" data-state="off">연결 안 됨</span><button type="button" class="secondary-button" id="chat-connect">연결</button>
</div>
<div class="panel-body settings-panel" id="chat-settings">
<div class="chat-display-layout" data-chat-display>
<div class="chat-display-controls">
<label class="field">채팅 테마<select id="chat-theme-select"></select></label>
<label class="field">정렬<select id="chat-alignment"><option value="default">기본</option><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
<div class="field-grid">
<label class="field">메시지 수<input type="number" id="chat-max-messages" min="1" max="100" required></label>
<label class="field">닉네임 길이<input type="number" id="chat-max-nickname-length" min="1" max="50" required></label>
</div>
<label class="field chat-time-field"><span>유지 시간 <small>초 · 0은 계속 표시</small></span><input type="number" id="chat-fade-time" min="0" max="300" required></label>
<p class="chat-draft-note">저장 전에는 미리보기에만 반영돼요.</p>
</div>
<div class="chat-preview-card" aria-label="채팅 미리보기">
<div class="chat-preview-toolbar"><strong>미리보기 <span>예시 채팅</span></strong><button type="button" id="chat-preview-play" title="메시지 등장과 유지 시간 재생" aria-label="채팅 애니메이션 재생"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg><span>재생</span></button></div>
<div class="chat-preview-stage" id="chat-preview-stage"><iframe id="chat-preview-frame" title="선택한 설정의 채팅 모습" tabindex="-1" sandbox="allow-scripts allow-same-origin"></iframe><span class="chat-preview-empty" id="chat-preview-empty" hidden>메시지가 사라졌어요<br><small>재생을 누르면 다시 볼 수 있어요.</small></span></div>
<div class="chat-preview-caption"><span id="chat-preview-description">설정에 맞춰 바로 반영됩니다.</span><button type="button" id="chat-preview-background" aria-label="미리보기 밝은 배경" aria-pressed="false" title="미리보기 배경 변경"><span></span></button></div>
</div>
</div>
</div>
<footer class="panel-footer"><button type="button" id="copy-chat-source" class="text-button source-copy-button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 2 2-2a4 4 0 0 0-6-6l-2 2" transform="translate(3 3) scale(.8)"/></svg>OBS 주소 복사</button><div class="footer-actions"><span id="chat-draft-state" class="draft-state" role="status">저장된 설정</span><button type="submit" class="primary-button" id="save-chat-settings">설정 저장</button></div></footer>
<input id="chat-url" type="hidden">
</form></section>`
};
