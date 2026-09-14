// NDI status and transport share one screen; only diagnostics are collapsible.
export const panel = {
    id: "output-panel", view: "output",
    html: String.raw`<section id="output-panel" class="module-screen ndi-workspace" data-deck-view="output" aria-label="출력 모듈 설정" hidden>
<div class="module-summary-line"><span data-output-module="ndi" class="signal-state"><i aria-hidden="true"></i><strong id="ndi-state">확인 중</strong></span><span class="source-tag">다른 PC · NDI</span></div>
<div class="panel-body">
<div class="metric-grid">
<div><span>영상</span><strong id="output-video-summary">—</strong><small id="output-fps-summary">—</small></div>
<div><span>오디오</span><strong>A1 스테레오</strong><small id="output-audio-summary">—</small></div>
<div><span>공통 버퍼</span><strong id="output-buffer-summary">—</strong><small>화면·소리 함께 대기</small></div>
</div>
<div class="meter-block"><div class="peak-header"><span>A1 오디오 레벨</span><strong id="audio-peak">—</strong></div><div class="audio-meter"><i id="audio-meter-fill"></i></div></div>
<dl class="output-readings"><div><dt>실제 FPS</dt><dd id="video-live-fps">—</dd></div><div><dt>누락 프레임</dt><dd id="video-drops">—</dd></div><div><dt>오디오 보정</dt><dd id="sync-offset">—</dd></div></dl>
<p id="sync-verified" class="verification-note"></p>
<p class="panel-note" id="output-module-note"></p>
<details class="advanced-details"><summary>설정 경로 · 진단 정보</summary><dl class="signal-list"><div><dt>해상도 / FPS</dt><dd><span id="video-size">—</span> / <span id="video-fps">—</span></dd></div><div><dt>샘플레이트</dt><dd id="audio-rate">—</dd></div><div><dt>공통 버퍼</dt><dd id="sync-buffer">—</dd></div></dl><p id="local-origin"></p><p id="ndi-capture-error"></p><p>상태는 3초마다 갱신됩니다. 오디오 믹스는 Voicemeeter에서 조절하세요.</p></details>
</div>
<footer class="panel-footer module-actions"><button type="button" class="secondary-button" data-output-action="open-folder">설정 폴더</button><div class="footer-actions"><button type="button" class="secondary-button" data-output-module="ndi" data-output-action="stop-ndi">송출 중지</button><button type="button" class="primary-button" data-output-module="ndi" data-output-action="start-ndi">송출 시작</button></div></footer>
</section>`
};
