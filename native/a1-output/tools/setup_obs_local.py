"""Prepare a separate OBS collection/profile while OBS is closed. No stream setup."""
import configparser
import copy
import datetime
import json
import os
from pathlib import Path
import shutil
import uuid
import argparse
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--relink', action='store_true', help='Back up and repoint an existing A1 Local source to this module.')
args = parser.parse_args()
if os.name == 'nt':
    listing = subprocess.check_output(['tasklist.exe', '/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq obs64.exe'])
    if b'"obs64.exe"' in listing.lower():
        raise SystemExit('Close OBS before registering or relinking the source.')

# Preserve the user-visible runtime path across launcher AppData redirection.
root = Path(__file__).absolute().parents[1]
obs_root = Path(os.environ['APPDATA']) / 'obs-studio'
collection_path = obs_root / 'basic/scenes/A1_Local.json'
profile_path = obs_root / 'basic/profiles/A1_Local'
if args.relink:
    if os.name == 'nt':
        listing = subprocess.check_output(['tasklist.exe', '/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq a1-ndi-sender.exe'])
        if b'"a1-ndi-sender.exe"' in listing.lower():
            raise SystemExit('Stop the NDI sender before moving its configuration.')
    sys.path.insert(0, str(root / 'tools'))
    from relink_obs_local import relink
    print(json.dumps(relink(root, obs_root), ensure_ascii=False))
    raise SystemExit(0)
if collection_path.exists() or profile_path.exists():
    raise SystemExit('A1 Local already exists; refusing to overwrite the existing scene/profile.')
templates = list((obs_root / 'basic/scenes').glob('*.json'))
if not templates:
    raise SystemExit('Open OBS once and create an initial scene collection first.')
template = json.loads(templates[0].read_text(encoding='utf-8-sig'))
backup = root / 'logs' / ('obs-before-local-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True)
for name in ('user.ini', 'global.ini'):
    if (obs_root / name).exists():
        shutil.copy2(obs_root / name, backup / name)

source_id, scene_id = str(uuid.uuid4()), str(uuid.uuid4())
source = {'name':'A1 Desktop + Audio', 'uuid':source_id, 'id':'a1_local_sync',
          'versioned_id':'a1_local_sync', 'settings':{'config_path':str(root/'sender.ini'), 'test_pattern':False},
          'mixers':1, 'sync':0, 'volume':1.0, 'muted':False, 'enabled':True,
          'monitoring_type':0, 'flags':0}
scene = {'name':'A1 Local Broadcast', 'uuid':scene_id, 'id':'scene', 'versioned_id':'scene',
         'settings':{'id_counter':1, 'items':[{
             'name':source['name'], 'source_uuid':source_id, 'id':1, 'visible':True, 'locked':True,
             'rot':0.0, 'pos':{'x':0.0,'y':0.0}, 'scale':{'x':1.0,'y':1.0}, 'align':5,
             'bounds_type':0, 'bounds_align':0, 'bounds':{'x':0.0,'y':0.0},
             'crop_left':0, 'crop_top':0, 'crop_right':0, 'crop_bottom':0}]},
         'mixers':0, 'sync':0, 'volume':1.0, 'muted':False}
for key in list(template):
    if key.startswith(('DesktopAudioDevice','AuxAudioDevice')):
        del template[key]
template.update(name='A1 Local', current_scene=scene['name'], current_program_scene=scene['name'],
                scene_order=[{'name':scene['name']}], sources=[source,scene],
                modules={'scripts-tool':[{'path':(root/'tools/obs-local-control.lua').as_posix(), 'settings':{}}]})
collection_path.write_text(json.dumps(template,ensure_ascii=False,indent=2),encoding='utf-8')

sender = dict(line.split('=',1) for line in (root/'sender.ini').read_text(encoding='utf-8').splitlines()
              if '=' in line and not line.startswith('#'))
recordings = root/'logs/obs-recordings'
recordings.mkdir(exist_ok=True)
profile_path.mkdir(parents=True)
profile = configparser.ConfigParser(interpolation=None)
profile.optionxform=str
profile.read_dict({
 'General':{'Name':'A1 Local'},
 'Video':{'BaseCX':sender['width'],'BaseCY':sender['height'],'OutputCX':sender['width'],'OutputCY':sender['height'],
          'FPSType':'0','FPSCommon':sender['fps'],'FPSInt':sender['fps'],'FPSNum':sender['fps'],'FPSDen':'1',
          'ScaleType':'bicubic','ColorFormat':'NV12','ColorSpace':'709','ColorRange':'Partial'},
 'Audio':{'SampleRate':'48000','ChannelSetup':'Stereo'},
 'Output':{'Mode':'Simple','FilenameFormatting':'A1-Local-%CCYY-%MM-%DD-%hh-%mm-%ss'},
 'SimpleOutput':{'FilePath':str(recordings),'RecFormat2':'mkv','RecFormat':'mkv','RecQuality':'HQ',
                 'RecEncoder':'nvenc','RecTracks':'1','ABitrate':'320','NVENCPreset2':'p5'}})
with (profile_path/'basic.ini').open('w',encoding='utf-8') as f:
    profile.write(f,space_around_delimiters=False)
user = configparser.ConfigParser(interpolation=None,strict=False)
user.optionxform=str
user.read(obs_root/'user.ini',encoding='utf-8-sig')
for section in ('Basic','NDIPlugin','BasicWindow'):
    if not user.has_section(section):user.add_section(section)
user['Basic'].update(Profile='A1 Local',ProfileDir='A1_Local',SceneCollection='A1 Local',
                     SceneCollectionFile='A1_Local',ConfigOnNewProfile='false')
user['NDIPlugin'].update(MainOutputEnabled='false',PreviewOutputEnabled='false')
user['BasicWindow']['HideOBSWindowsFromCapture']='true'
with (obs_root/'user.ini').open('w',encoding='utf-8') as f:
    user.write(f,space_around_delimiters=False)
print(json.dumps({'collection':str(collection_path),'profile':str(profile_path),'backup':str(backup)},ensure_ascii=False))
