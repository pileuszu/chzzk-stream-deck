"""Measure a known white-flash/997 Hz reference clip captured by receive_probe.py.
This cannot infer intended sync from arbitrary YouTube/game content. No files are
modified unless --apply is explicitly supplied. Software pattern measurement is
not a physical headphone/display or remote OBS certification.
"""
import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import shutil
import numpy as np

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('capture',type=Path)
p.add_argument('--config',type=Path,default=Path('sender.ini'))
p.add_argument('--period',type=float,default=2.0,help='seconds between reference events')
p.add_argument('--apply',action='store_true')
args=p.parse_args()
data=np.load(args.capture)
video=data['video'].astype(np.float32)
# Identify the blinking rectangle by its repeated dark/white transition.
lo=np.percentile(video,10,axis=0);hi=np.percentile(video,95,axis=0)
mask=(lo<100)&(hi>200)&(hi-lo>140)
if mask.sum()<100: raise SystemExit('No reliable flashing area. Play the known reference clip visibly, then capture again.')
score=video[:,mask].mean(axis=1)
on=score>(np.percentile(score,15)+np.percentile(score,95))/2
edges=np.flatnonzero(on & ~np.r_[True,on[:-1]])
vt=data['video_time'][edges].astype(np.float64)/1e7
if len(vt)<4: raise SystemExit('At least four complete reference flashes are required.')
if not np.all(np.abs(np.diff(vt)-args.period)<.1): raise SystemExit('Flash timing is inconsistent with the requested reference period.')
rates=data['audio_rates'];rate=int(rates[0])
if not np.all(rates==rate): raise SystemExit('Audio rate changed: re-record after the audio engine is stable.')
signal=data['audio'][0].astype(np.float64)
window=max(32,rate//100);hop=max(1,rate//1000)
windows=np.lib.stride_tricks.sliding_window_view(signal,window)[::hop]
ref=np.exp(-2j*np.pi*997*np.arange(window)/rate)
strength=np.abs(windows@ref)*2/window
threshold=max(.003,float(np.percentile(strength,99))*.35)
loud=strength>threshold
tone_edges=np.flatnonzero(loud & ~np.r_[True,loud[:-1]])
starts=np.r_[0,np.cumsum(data['audio_sizes'])]
at=[]
for edge in tone_edges:
    # Refine the rising tone with samples around the matched-filter detection.
    begin=max(0,int(edge*hop)-window);end=min(len(signal),int(edge*hop)+window)
    local=np.abs(signal[begin:end]);indices=np.flatnonzero(local>max(.003,threshold*.4))
    if not len(indices): continue
    sample=begin+int(indices[0]);block=int(np.searchsorted(starts,sample,side='right')-1)
    t=float(data['audio_time'][block])/1e7+(sample-starts[block])/rate
    if not at or t-at[-1]>.15: at.append(t)
at=np.array(at)
if len(at)<4: raise SystemExit('Insufficient clean 997 Hz pulses. Pause other audio while recording the reference clip.')
used=set();deltas=[]
for t in vt:
    i=int(np.argmin(np.abs(at-t)))
    if abs(at[i]-t)>.5 or i in used: continue
    used.add(i);deltas.append(float((at[i]-t)*1000))
if len(deltas)<4: raise SystemExit('Insufficient unique video/audio event pairs.')
median=float(np.median(deltas));spread=float(np.ptp(deltas));mad=float(np.median(np.abs(np.array(deltas)-median)))
text=args.config.read_text(encoding='utf-8')
old=float(re.search(r'^audio_offset_ms=(.+)$',text,re.M)[1])
buffer=float(re.search(r'^buffer_ms=(.+)$',text,re.M)[1])
proposal=round(old-median,3)
valid=spread<=25 and mad<=8 and abs(proposal)<buffer-100
result=dict(audio_minus_video_ms=deltas,median_ms=median,spread_ms=spread,mad_ms=mad,
    current_audio_offset_ms=old,proposed_audio_offset_ms=proposal,stable_enough_to_apply=valid,
    applied=False,physical_output_verified=False,remote_obs_verified=False)
if args.apply:
    if not valid: raise SystemExit('Variable or excessive delay: refusing to hide this with a constant offset. '+json.dumps(result))
    backup=args.config.with_suffix('.before-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'.ini')
    shutil.copy2(args.config,backup)
    text=re.sub(r'^audio_offset_ms=.+$',f'audio_offset_ms={proposal}',text,flags=re.M)
    text=re.sub(r'^calibration_verified=.+$','calibration_verified=true',text,flags=re.M)
    args.config.write_text(text,encoding='utf-8');result['applied']=True;result['backup']=str(backup)
report=args.capture.with_suffix('.sync.json');report.write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
if not valid: raise SystemExit(2)
