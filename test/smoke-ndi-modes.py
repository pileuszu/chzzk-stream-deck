"""Optional Windows integration check: real A1 input, NDI runtime and local decoding.
No recording is saved. Requires Voicemeeter and no other A1 capture owner.
"""
import ctypes as C
import json
import os
import pathlib
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXE = ROOT / 'native/a1-output/build-obs/Release/a1-ndi-sender.exe'
DLL = pathlib.Path(r'C:\Program Files\NDI\NDI 6 Tools\Runtime\Processing.NDI.Lib.x64.dll')
os.add_dll_directory(str(DLL.parent))
ndi = C.CDLL(str(DLL))

class Source(C.Structure):
    _fields_ = [('name', C.c_char_p), ('url', C.c_char_p)]
class FindSettings(C.Structure):
    _fields_ = [('local', C.c_bool), ('groups', C.c_char_p), ('ips', C.c_char_p)]
class RecvSettings(C.Structure):
    _fields_ = [('source', Source), ('color', C.c_int), ('bandwidth', C.c_int), ('fields', C.c_bool), ('name', C.c_char_p)]
class Video(C.Structure):
    _fields_ = [('width', C.c_int), ('height', C.c_int), ('fourcc', C.c_uint32), ('fps_n', C.c_int), ('fps_d', C.c_int), ('aspect', C.c_float), ('format', C.c_int), ('timecode', C.c_int64), ('data', C.c_void_p), ('stride', C.c_int), ('metadata', C.c_char_p), ('timestamp', C.c_int64)]
class Audio(C.Structure):
    _fields_ = [('rate', C.c_int), ('channels', C.c_int), ('samples', C.c_int), ('timecode', C.c_int64), ('data', C.c_void_p), ('stride', C.c_int), ('metadata', C.c_char_p), ('timestamp', C.c_int64)]
def fn(name, result, args):
    f = getattr(ndi, 'NDIlib_' + name); f.restype = result; f.argtypes = args; return f
init = fn('initialize', C.c_bool, [])
find = fn('find_create_v2', C.c_void_p, [C.POINTER(FindSettings)])
wait = fn('find_wait_for_sources', C.c_bool, [C.c_void_p, C.c_uint32])
sources = fn('find_get_current_sources', C.POINTER(Source), [C.c_void_p, C.POINTER(C.c_uint32)])
find_destroy = fn('find_destroy', None, [C.c_void_p])
recv = fn('recv_create_v3', C.c_void_p, [C.POINTER(RecvSettings)])
capture = fn('recv_capture_v2', C.c_int, [C.c_void_p, C.POINTER(Video), C.POINTER(Audio), C.c_void_p, C.c_uint32])
free_v = fn('recv_free_video_v2', None, [C.c_void_p, C.POINTER(Video)])
free_a = fn('recv_free_audio_v2', None, [C.c_void_p, C.POINTER(Audio)])
recv_destroy = fn('recv_destroy', None, [C.c_void_p])
assert init(), 'NDI runtime failed'
results = []
for mode in ['audio_only', 'audio_video']:
    with tempfile.TemporaryDirectory(prefix='ndi-mode-') as folder:
        directory = pathlib.Path(folder)
        # An invalid display index proves audio-only never initializes desktop capture.
        name = f'A1 mode verification {mode}'
        config = directory / 'sender.ini'
        buffer_ms = 0 if mode == 'audio_only' else 500
        text = f'name={name}\nwidth=1920\nheight=1080\nfps=60\nmonitor={999 if mode == "audio_only" else 0}\nbuffer_ms={buffer_ms}\naudio_offset_ms=0\n'
        # Omit the key in the AV case to exercise backward-compatible old settings.
        if mode == 'audio_only': text += 'output_mode=audio_only\n'
        config.write_text(text, encoding='utf8')
        with (directory / 'stdout.log').open('w') as out, (directory / 'stderr.log').open('w') as err:
            proc = subprocess.Popen([str(EXE), '--config', str(config), '--log-dir', str(directory), '--duration', '16', '--no-tray'], stdout=out, stderr=err, creationflags=subprocess.CREATE_NO_WINDOW)
            finder = receiver = None
            try:
                finder = find(C.byref(FindSettings(True, None, None)))
                selected = None; deadline = time.monotonic() + 7
                while time.monotonic() < deadline and selected is None:
                    if proc.poll() is not None: raise RuntimeError((directory/'stderr.log').read_text())
                    wait(finder, 300); count = C.c_uint32(); entries = sources(finder, C.byref(count))
                    for i in range(count.value):
                        if (entries[i].name or b'').endswith(('(' + name + ')').encode()):
                            selected = (entries[i].name, entries[i].url); break
                assert selected, 'Source not discovered'
                receiver = recv(C.byref(RecvSettings(Source(*selected), 0, 100, False, b'Audio-only verification')))
                assert receiver
                videos = audios = samples = backwards = 0; last_a = None; audio_format = None
                deadline = time.monotonic() + 7
                while time.monotonic() < deadline:
                    v, a = Video(), Audio(); kind = capture(receiver, C.byref(v), C.byref(a), None, 100)
                    if kind == 1:
                        videos += 1; free_v(receiver, C.byref(v))
                    elif kind == 2:
                        try:
                            audios += 1; samples += a.samples; audio_format = [a.rate, a.channels]
                            if last_a is not None and a.timecode <= last_a: backwards += 1
                            last_a = a.timecode
                        finally: free_a(receiver, C.byref(a))
                status = json.loads((directory/'status.json').read_text())
                assert status['healthy'], status
                assert audios > 100 and audio_format == [48000, 2] and backwards == 0
                assert status['output_mode'] == mode
                assert status['buffer_ms'] == buffer_ms
                if mode == 'audio_only':
                    assert videos == status['video_sent'] == status['video_captures'] == status['video_queue_frames'] == 0, status
                    assert status['late_video_drops'] == 0 and status['capture_error'] == ''
                else:
                    assert videos > 200 and status['video_captures'] > 0
                results.append({'mode': mode, 'received_video_frames': videos, 'received_audio_blocks': audios, 'audio_format': audio_format, 'audio_samples': samples, 'video_captures': status['video_captures'], 'video_sent': status['video_sent'], 'working_set_mb': status['working_set_mb'], 'cpu_percent_machine': status['cpu_percent_machine'], 'timestamp_backwards': backwards})
            finally:
                if receiver: recv_destroy(receiver)
                if finder: find_destroy(finder)
                if proc.poll() is None:
                    # Our process owns the sender singleton; use its graceful stop event.
                    subprocess.run([str(EXE), '--stop'], creationflags=subprocess.CREATE_NO_WINDOW, timeout=5, check=False)
                proc.wait(timeout=10)
            assert proc.returncode == 0, (directory/'stderr.log').read_text()
(ROOT/'test-results/ndi-modes.json').write_text(json.dumps(results, indent=2), encoding='utf8')
print(json.dumps(results), flush=True)
