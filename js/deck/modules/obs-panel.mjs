// Settings stay beside the next action; setup and broadcast guidance use the same compact screen.
export const panel = {
    id: "local-capture-panel", view: "obs",
    html: String.raw`<section id="local-capture-panel" class="module-screen local-capture-panel" data-deck-view="obs" aria-label="로컬 캡처 설정" hidden>
<ol class="capture-journey" aria-label="화면 송출 순서">
<li data-capture-step="0"><b>1</b> OBS 소스 준비</li><li data-capture-step="1"><b>2</b> 화면·소리 전달</li><li data-capture-step="2"><b>3</b> OBS 방송 시작</li>
</ol>
<form id="local-capture-form">
<div class="panel-body">
<section id="capture-setup" class="capture-setup" aria-label="처음 사용 준비" hidden>
<div class="capture-setup-heading"><span class="capture-kicker">처음 한 번 준비하면 됩니다</span><h2 id="capture-setup-title"></h2><p id="capture-setup-detail"></p></div>
<ul class="capture-checklist"><li id="capture-check-engine"></li><li id="capture-check-obs"></li><li id="capture-check-source"></li></ul>
<p class="compact-help">Voicemeeter를 실행하고 A1으로 소리가 들리는지 확인해 주세요.<br>준비 버튼은 캡처 소스를 추가합니다. 방송·녹화는 시작하지 않습니다.</p>
</section>
<div id="capture-config-workspace" class="capture-workspace">
<div class="capture-controls">
<div class="field-grid">
<label class="field">해상도<select id="capture-resolution"><option value="1920x1080">1920 × 1080 · FHD</option><option value="1280x720">1280 × 720 · HD</option><option value="2560x1440">2560 × 1440 · QHD</option><option value="3840x2160">3840 × 2160 · UHD</option><option value="custom">직접 입력</option></select></label>
<label class="field">프레임<select id="capture-fps" required><option value="30">30 FPS</option><option value="60">60 FPS</option></select></label>
</div>
<div id="capture-custom-size" class="field-grid" hidden><label class="field">가로 · px<input id="capture-width" type="number" min="320" max="3840" step="2" required></label><label class="field">세로 · px<input id="capture-height" type="number" min="180" max="2160" step="1" required></label></div>
<div class="field-grid">
<label class="field">화면 번호<input id="capture-monitor" type="number" min="1" max="16" step="1" required></label>
<div class="field capture-source"><span>함께 전달할 소리</span><strong>Voicemeeter A1 믹스</strong></div>
<label class="field">공통 버퍼 · ms<input id="capture-buffer" type="number" min="200" max="2000" step="1" required></label>
<label class="field">오디오 보정 · ms<input id="capture-offset" type="number" step="0.1" required></label>
</div>
<p class="compact-help">화면 번호는 1부터 · 보정 ＋는 소리를 늦춥니다.<br>버퍼는 헤드폰 지연에 영향을 주지 않습니다.</p>
</div>
<aside class="capture-next-card" aria-label="다음 할 일">
<div class="capture-card-status"><span id="capture-state" class="connection-status" role="status">확인 중</span><span id="capture-obs-activity"></span></div>
<h2 id="capture-next-title"></h2><p id="capture-next-detail"></p>
<div class="capture-destination"><strong id="capture-destination-name">OBS 현재 선택된 장면</strong><small>소스: A1 Desktop + Audio · 자동 연결</small></div>
<div class="capture-live-meter"><div class="peak-header"><span>A1 오디오</span><strong id="capture-peak">—</strong></div><div class="audio-meter"><i id="capture-meter"></i></div></div>
</aside>
</div>
<p id="capture-connection-note" class="capture-connection-note" role="status" hidden></p>
<div class="capture-extras">
<details id="capture-help" class="advanced-details capture-help"><summary id="capture-help-title">OBS에서 방송하는 방법</summary>
<div id="capture-install-guide" hidden>
<ol><li>OBS Studio 32.0.1 x64를 설치합니다. 연결 도구를 처음 설치하거나 업데이트할 때는 OBS를 종료해 주세요.</li><li>Voicemeeter A1에서 마이크·기타·컴퓨터 소리가 들리는지 확인합니다.</li><li>클론한 경우 <code>npm ci</code> → <code>npm run build:native</code> → <code>npm run app</code> 순서로 실행합니다. 빌드에는 VS 2022 C++ Build Tools·Windows SDK·CMake가 필요합니다.</li><li><b>OBS 연결 준비</b> 후 <b>OBS 열고 연결</b>을 누르세요. 현재 장면에 소스를 자동으로 만듭니다. Python 설치나 장면 모음 선택은 필요하지 않습니다.</li></ol>
<p>플러그인 설치 권한 오류가 나면 모듈 폴더의 <code>Install-OBSPlugin.ps1</code>만 관리자 PowerShell에서 실행한 뒤 앱에서 다시 준비하세요. 장면 등록은 현재 사용자 계정으로 진행합니다.</p>
<p>기존 A1 Local 설정이 있으면 그대로 유지합니다. 연결 복구·이동 절차는 모듈 폴더의 OUTPUT-MODULES.md에서 확인할 수 있습니다.</p>
<button type="button" class="secondary-button" data-local-action="open-folder">모듈 폴더 열기</button>
</div>
<div id="capture-broadcast-guide">
<ol><li>아래 <b>OBS 열고 연결</b>을 누릅니다. 현재 선택된 OBS 장면에 소스를 자동으로 추가합니다. 소스 목록이 비어 있어도 됩니다.</li><li><b>A1 Desktop + Audio</b> 소스의 화면과 오디오 미터를 확인합니다. 마이크·기타·컴퓨터 소리는 Voicemeeter A1 믹스로 들어옵니다.</li><li>OBS의 <b>설정 → 방송</b>에서 서비스를 연결하고 인코더를 확인한 뒤 <b>방송 시작</b>을 누르세요.</li></ol><p>연결 도중 실패하면 입력한 설정은 유지됩니다. 원인을 해결한 뒤 아래 <b>다시 시도</b>를 누르세요. 소스가 중복 생성되지 않습니다.</p>
<p>이 패널의 <b>전달 중지</b>는 캡처 공급을 끕니다. 방송·녹화를 끝내려면 OBS에서 각각 중지하세요. 중복되는 데스크톱·마이크 오디오 소스는 꺼두세요.</p>
<button type="button" class="secondary-button" data-local-action="open-obs">OBS 열기</button>
</div>
</details>
<details id="capture-diagnostics" class="advanced-details"><summary>연결·진단 정보</summary>
<p id="capture-live-video"></p><p id="capture-live-audio"></p>
<dl class="signal-list"><div><dt>실제 FPS / 누락</dt><dd id="capture-live-fps">—</dd></div><div><dt>버퍼 / 보정</dt><dd id="capture-live-sync">—</dd></div></dl>
<p id="capture-path"></p><p id="capture-error"></p><p>원본 비율을 유지합니다. OBS 출력 해상도·FPS는 OBS에서 설정하세요. 실제 화면·소리 시간차는 측정 후 보정하세요.</p>
</details></div>
</div>
<div id="capture-save-line" class="capture-save-line"><span id="capture-draft-state" role="status">저장된 설정</span><span id="capture-apply-note">다음 전달 시작에 적용됩니다.</span></div>
<footer class="panel-footer"><button type="button" id="capture-toggle" class="primary-button">OBS로 전달 시작</button><button type="button" id="capture-stop" class="text-button" data-local-action="stop-local" hidden>전달 중지</button><div id="capture-save-actions" class="footer-actions"><button type="button" id="capture-reload" class="text-button" title="편집 내용을 버리고 저장된 설정을 불러옵니다">되돌리기</button><button type="submit" id="capture-save" class="secondary-button" value="save">저장</button><button type="submit" id="capture-apply" class="primary-button" value="apply">저장 후 적용</button></div><button type="button" id="capture-check-again" class="text-button" hidden>준비 상태 확인</button></footer>
</form></section>`
};
