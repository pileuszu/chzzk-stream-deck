// NDI mode, live state and transport share one compact screen.
export const panel = {
    id: "output-panel", view: "output",
    html: String.raw`<section id="output-panel" class="module-screen ndi-workspace" data-deck-view="output" aria-label="출력 모듈 설정" hidden>
<div class="module-summary-line"><fieldset class="ndi-mode-picker"><legend>전송 대상</legend><div class="ndi-mode-options"><label><input form="ndi-settings-form" type="radio" name="ndi-output-mode" value="audio_video" checked><span>화면 + 소리</span></label><label><input form="ndi-settings-form" type="radio" name="ndi-output-mode" value="audio_only"><span>소리만</span></label></div></fieldset><span data-output-module="ndi" class="signal-state"><i aria-hidden="true"></i><strong id="ndi-state">확인 중</strong></span></div>
<div class="panel-body">
<form id="ndi-settings-form">
<p id="ndi-mode-hint" class="ndi-mode-hint"></p>
<div class="ndi-settings-workspace">
<div class="capture-controls">
<div id="ndi-video-settings">
<div class="field-grid"><label class="field">해상도<select id="ndi-resolution"><option value="1920x1080">1920 × 1080 · FHD</option><option value="1280x720">1280 × 720 · HD</option><option value="2560x1440">2560 × 1440 · QHD</option><option value="3840x2160">3840 × 2160 · UHD</option><option value="custom">직접 입력</option></select></label><label class="field">프레임 · FPS<input id="ndi-fps" type="number" min="15" max="60" step="1" required></label></div>
<div id="ndi-custom-size" class="field-grid" hidden><label class="field">가로 · px<input id="ndi-width" type="number" min="320" max="3840" step="2" required></label><label class="field">세로 · px<input id="ndi-height" type="number" min="180" max="2160" step="1" required></label></div>
<div class="field-grid"><label class="field">화면 번호<input id="ndi-monitor" type="number" min="1" max="16" step="1" required></label><div class="field capture-source"><span>오디오 입력</span><strong>A1 믹스</strong></div></div>
</div>
<div class="field-grid"><label class="field">전송 버퍼 · ms<input id="ndi-buffer" type="number" min="200" max="2000" step="1" required></label><label class="field">오디오 보정 · ms<input id="ndi-offset" type="number" step="0.1" required></label></div>
<p id="ndi-settings-help" class="compact-help"></p>
</div>
<aside class="module-live-card ndi-live-card" aria-label="현재 송출 상태"><strong>현재 송출</strong>
<div class="ndi-live-line"><span>영상</span><strong id="output-video-summary">—</strong><small id="output-fps-summary">—</small></div>
<div class="ndi-live-line"><span>A1 스테레오</span><strong id="output-audio-summary">—</strong></div>
<div class="ndi-live-line"><span>버퍼</span><strong id="output-buffer-summary">—</strong><small id="ndi-buffer-note">화면·소리 함께 대기</small></div>
<div class="meter-block"><div class="peak-header"><span>A1 오디오 레벨</span><strong id="audio-peak">—</strong></div><div class="audio-meter"><i id="audio-meter-fill"></i></div></div>
</aside></div></form>
<p class="panel-note" id="output-module-note" role="status"></p>
<div class="ndi-info-row"><button type="button" class="info-trigger" data-info-trigger aria-controls="ndi-info" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.2"/></svg>연결·진단 정보</button><span id="ndi-receivers">수신기 0</span></div>
<section id="ndi-info" class="info-popover" popover="auto" role="dialog" tabindex="-1" aria-labelledby="ndi-info-title"><header class="info-popover-heading"><h3 id="ndi-info-title">NDI 연결·진단 정보</h3><button type="button" data-info-close aria-label="진단 정보 닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button></header><div class="info-popover-body"><dl class="signal-list"><div><dt>해상도 / FPS</dt><dd><span id="video-size">—</span> / <span id="video-fps">—</span></dd></div><div><dt>실제 FPS / 누락</dt><dd><span id="video-live-fps">—</span> / <span id="video-drops">—</span></dd></div><div><dt>샘플레이트</dt><dd id="audio-rate">—</dd></div><div><dt>송출 버퍼 / 오디오 보정</dt><dd><span id="sync-buffer">—</span> / <span id="sync-offset">—</span></dd></div></dl><p id="sync-verified" class="verification-note"></p><p id="local-origin"></p><p id="ndi-capture-error"></p><p>수신 PC에서는 같은 NDI 소스를 선택하세요. 소리만 모드에서는 영상이 전송되지 않습니다. 오디오 믹스는 Voicemeeter에서 조절하세요.</p><button type="button" class="secondary-button" data-output-action="open-folder">설정 폴더 열기</button></div></section>
</div>
<footer class="panel-footer module-actions"><div class="footer-actions"><button type="button" id="ndi-mode-save" class="secondary-button" hidden>설정 저장</button><button type="button" id="ndi-mode-reset" class="text-button" hidden>되돌리기</button><span id="ndi-mode-status" class="draft-state" role="status">저장된 설정</span></div><div class="footer-actions"><button type="button" class="secondary-button" data-output-module="ndi" data-output-action="stop-ndi">송출 중지</button><button type="button" class="primary-button" data-output-module="ndi" data-output-action="start-ndi">송출 시작</button></div></footer>
</section>`
};
