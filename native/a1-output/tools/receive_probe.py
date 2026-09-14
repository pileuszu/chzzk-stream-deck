"""Read-only NDI receiver probe; requires numpy and Pillow, never edits the sender.

python tools/receive_probe.py --name 'A1 Desktop Sync' --seconds 20 --out logs/live
Add --expect-pulses only for the sender's --self-test source.
"""
import argparse
import ctypes as C
import json
import os
from pathlib import Path
import time
import threading
import numpy as np
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('--name', default='A1 Desktop Sync')
p.add_argument('--seconds', type=float, default=20)
p.add_argument('--out', default='logs/probe')
p.add_argument('--expect-pulses', action='store_true')
p.add_argument('--dll', default=r'C:\Program Files\NDI\NDI 6 Tools\Runtime\Processing.NDI.Lib.x64.dll')
args = p.parse_args()
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
dll_dir = os.add_dll_directory(str(Path(args.dll).parent))
ndi = C.CDLL(args.dll)

class Source(C.Structure):
    _fields_ = [('name', C.c_char_p), ('url', C.c_char_p)]
class Find(C.Structure):
    _fields_ = [('local', C.c_bool), ('groups', C.c_char_p), ('ips', C.c_char_p)]
class Recv(C.Structure):
    _fields_ = [('source', Source), ('color', C.c_int), ('bandwidth', C.c_int), ('fields', C.c_bool), ('name', C.c_char_p)]
class Video(C.Structure):
    _fields_ = [('w', C.c_int), ('h', C.c_int), ('fourcc', C.c_uint32), ('fn', C.c_int), ('fd', C.c_int),
                ('aspect', C.c_float), ('format', C.c_int), ('timecode', C.c_int64), ('data', C.c_void_p),
                ('stride', C.c_int), ('metadata', C.c_char_p), ('timestamp', C.c_int64)]
class Audio(C.Structure):
    _fields_ = [('rate', C.c_int), ('channels', C.c_int), ('samples', C.c_int), ('timecode', C.c_int64),
                ('data', C.c_void_p), ('stride', C.c_int), ('metadata', C.c_char_p), ('timestamp', C.c_int64)]
def fn(name, result, types):
    f = getattr(ndi, name); f.restype = result; f.argtypes = types; return f
initialize = fn('NDIlib_initialize', C.c_bool, [])
destroy = fn('NDIlib_destroy', None, [])
find = fn('NDIlib_find_create_v2', C.c_void_p, [C.POINTER(Find)])
find_wait = fn('NDIlib_find_wait_for_sources', C.c_bool, [C.c_void_p, C.c_uint32])
find_sources = fn('NDIlib_find_get_current_sources', C.POINTER(Source), [C.c_void_p, C.POINTER(C.c_uint32)])
find_free = fn('NDIlib_find_destroy', None, [C.c_void_p])
recv_create = fn('NDIlib_recv_create_v3', C.c_void_p, [C.POINTER(Recv)])
recv_free = fn('NDIlib_recv_destroy', None, [C.c_void_p])
capture = fn('NDIlib_recv_capture_v2', C.c_int, [C.c_void_p, C.POINTER(Video), C.POINTER(Audio), C.c_void_p, C.c_uint32])
video_free = fn('NDIlib_recv_free_video_v2', None, [C.c_void_p, C.POINTER(Video)])
audio_free = fn('NDIlib_recv_free_audio_v2', None, [C.c_void_p, C.POINTER(Audio)])
assert initialize(), 'NDI initialization failed'
finder = find(C.byref(Find(True, None, None)))
receiver = None
try:
    selected = None
    suffix = ('(' + args.name + ')').encode()
    for _ in range(15):
        find_wait(finder, 500)
        count = C.c_uint32()
        sources = find_sources(finder, C.byref(count))
        for i in range(count.value):
            if (sources[i].name or b'').endswith(suffix):
                selected = (sources[i].name, sources[i].url)
                break
        if selected: break
    assert selected, 'Source not found: ' + args.name
    receiver = recv_create(C.byref(Recv(Source(*selected), 0, 100, False, b'A1 sender verification')))
    assert receiver
    print('READY ' + selected[0].decode(), flush=True)
    start = time.monotonic()
    frames, vt, vsubmit, audio, at, asubmit, sizes, rates = [], [], [], [], [], [], [], []
    formats = set()
    first_pixels = None
    audio_stop = threading.Event()
    audio_errors = []
    def receive_audio():
        try:
            while not audio_stop.is_set():
                a = Audio()
                kind = capture(receiver, None, C.byref(a), None, 100)
                if kind != 2: continue
                try:
                    assert a.channels == 2 and a.samples > 0
                    channels = [np.ctypeslib.as_array((C.c_float*a.samples).from_address(a.data+c*a.stride)).copy() for c in range(2)]
                    audio.append(np.stack(channels)); at.append(a.timecode); asubmit.append(a.timestamp); sizes.append(a.samples); rates.append(a.rate)
                finally: audio_free(receiver, C.byref(a))
        except BaseException as error:
            audio_errors.append(error)
    audio_thread = threading.Thread(target=receive_audio)
    audio_thread.start()
    while time.monotonic() - start < args.seconds:
        v, a = Video(), Audio()
        kind = capture(receiver, C.byref(v), None, None, 100)
        if kind == 1:
            try:
                fourcc = int(v.fourcc).to_bytes(4, 'little').decode()
                assert fourcc in ('BGRA', 'BGRX'), fourcc
                raw = np.ctypeslib.as_array((C.c_uint8 * (v.stride * v.h)).from_address(v.data)).reshape(v.h, v.stride)
                pixels = raw[:, :v.w*4].reshape(v.h, v.w, 4)
                if first_pixels is None:
                    first_pixels = pixels[:, :, [2, 1, 0]].copy()
                ys = np.linspace(0, v.h-1, 180, dtype=int)
                xs = np.linspace(0, v.w-1, 320, dtype=int)
                reduced = pixels[ys[:, None], xs, :3].astype(np.float32)
                gray = (reduced[:,:,0]*.114+reduced[:,:,1]*.587+reduced[:,:,2]*.299).astype(np.uint8)
                frames.append(gray); vt.append(v.timecode); vsubmit.append(v.timestamp)
                formats.add(('video', v.w, v.h, v.fn, v.fd, fourcc))
            finally: video_free(receiver, C.byref(v))
    capture_seconds = time.monotonic()-start
    audio_stop.set(); audio_thread.join()
    if audio_errors: raise audio_errors[0]
    assert frames and audio, 'Missing video or audio'
    formats.update(('audio', rate, 2) for rate in rates)
    Image.fromarray(first_pixels).save(str(out) + '.png')
    np.savez_compressed(str(out)+'.npz', video=np.stack(frames), video_time=np.array(vt, dtype=np.int64),
        video_submit=np.array(vsubmit, dtype=np.int64), audio=np.concatenate(audio, axis=1),
        audio_time=np.array(at, dtype=np.int64), audio_submit=np.array(asubmit, dtype=np.int64),
        audio_sizes=np.array(sizes), audio_rates=np.array(rates))
    vdiff = np.diff(vt)/1e7
    adiff = np.diff(at)/1e7
    result = dict(source=selected[0].decode(), seconds=capture_seconds, video_frames=len(frames),
        audio_blocks=len(audio), audio_peak=float(max(np.abs(x).max() for x in audio)), formats=sorted(formats),
        video_monotonic=bool(np.all(vdiff>0)), audio_monotonic=bool(np.all(adiff>0)),
        video_interval_ms_median=float(np.median(vdiff)*1000), video_interval_ms_max=float(vdiff.max()*1000),
        audio_interval_ms_max=float(adiff.max()*1000),
        scope='Local SDK receive. This does not verify the other PC OBS output or physical monitor/headphones.')
    if args.expect_pulses:
        bright = np.array([f.mean()>200 for f in frames])
        video_edges = np.flatnonzero(bright & ~np.r_[True, bright[:-1]])
        video_pulses = np.array(vt)[video_edges]
        audio_pulses = []
        was_loud = True
        for samples, t, rate in zip(audio, at, rates):
            mask = np.abs(samples[0]) > .005
            loud = bool(mask.any())
            if loud and not was_loud:
                audio_pulses.append(t + int(np.flatnonzero(mask)[0])*10000000/rate)
            was_loud = loud
        errors = []
        used = set()
        for t in video_pulses:
            if not audio_pulses: break
            index = int(np.argmin(np.abs(np.array(audio_pulses)-t)))
            delta = (audio_pulses[index]-t)/10000
            if abs(delta) < 200 and index not in used:
                errors.append(float(delta)); used.add(index)
        result['synthetic_av_errors_ms'] = errors
        result['synthetic_sync_pass'] = len(errors)>=3 and max(abs(x) for x in errors)<(1000/60+1)
    Path(str(out)+'.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2), flush=True)
    if args.expect_pulses and not result['synthetic_sync_pass']: raise SystemExit(2)
finally:
    if 'audio_stop' in globals(): audio_stop.set()
    if 'audio_thread' in globals() and audio_thread.is_alive(): audio_thread.join()
    if receiver: recv_free(receiver)
    if finder: find_free(finder)
    destroy()
