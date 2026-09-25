"""Move an existing A1 registration and its settings without resetting the mix."""
import datetime
import json
from pathlib import Path
import re


def _rebase(value, previous, target):
    normalized = value.replace('\\', '/')
    normalized = re.sub('/+', '/', normalized).rstrip('/')
    prefix = previous.as_posix().rstrip('/')
    if normalized.casefold() == prefix.casefold():
        tail = ''
    elif normalized.casefold().startswith(prefix.casefold() + '/'):
        tail = normalized[len(prefix) + 1:]
    else:
        return value
    result = str(target / tail)
    # OBS INI paths may escape each backslash; retain the existing convention.
    if '\\\\' in value:
        return result.replace('\\', '\\\\')
    if '/' in value:
        return result.replace('\\', '/')
    return result


def relink(root, obs_root):
    root, obs_root = Path(root).absolute(), Path(obs_root).absolute()
    collection_path = obs_root / 'basic/scenes/A1_Local.json'
    original = collection_path.read_bytes()
    collection = json.loads(original.decode('utf-8-sig'))
    sources = [s for s in collection.get('sources', [])
               if 'a1_local_sync' in (s.get('id'), s.get('versioned_id'))]
    if len(sources) != 1:
        raise SystemExit('Expected exactly one A1 local source; nothing was changed.')
    settings = sources[0].setdefault('settings', {})
    saved = settings.get('config_path') or settings.get('deck_config_path')
    if not saved or not Path(saved).is_absolute():
        raise SystemExit('The existing A1 configuration must have an absolute path.')
    previous = Path(saved).absolute().parent
    changes = {}
    for key in ('config_path', 'deck_config_path'):
        value = settings.get(key)
        if not value:
            continue  # Empty config_path means capture is stopped. Keep it stopped.
        file = Path(value).absolute()
        if file.parent != previous or file.name not in ('sender.ini', 'local-capture.ini'):
            raise SystemExit('Unexpected A1 configuration path; nothing was changed.')
        if not file.is_file():
            raise SystemExit('The previous A1 configuration is missing; nothing was changed.')
        settings[key] = str(root / file.name)
    for name in ('sender.ini', 'local-capture.ini'):
        source = previous / name
        if source.is_file() and source != root / name:
            changes[root / name] = source.read_bytes()
    for script in collection.get('modules', {}).get('scripts-tool', []):
        old = script.get('path', '')
        if old.replace('\\', '/').rsplit('/', 1)[-1] in ('obs-local-control.lua', 'deck-local-control.lua'):
            destination = root / 'tools' / old.replace('\\', '/').rsplit('/', 1)[-1]
            if not destination.is_file():
                raise SystemExit('The destination A1 control script is missing; nothing was changed.')
            script['path'] = destination.as_posix()
    changes[collection_path] = json.dumps(collection, ensure_ascii=False, indent=2).encode('utf-8')

    profile = obs_root / 'basic/profiles/A1_Local/basic.ini'
    recording_folders = []
    if profile.is_file():
        content = profile.read_bytes().decode('utf-8-sig')
        section = ''
        lines = []
        for line in content.splitlines(keepends=True):
            heading = re.match(r'\s*\[([^]]+)\]', line)
            if heading:
                section = heading.group(1)
            match = re.match(r'(\s*(FilePath|RecFilePath|FFFilePath)\s*=)([^\r\n]*)(.*)', line, re.S)
            if match and section in ('SimpleOutput', 'AdvOut'):
                old = match.group(3)
                moved = _rebase(old, previous / 'logs', root / 'logs')
                if moved != old:
                    recording_folders.append(Path(moved.replace('\\\\', '\\')))
                    line = match.group(1) + moved + match.group(4)
            lines.append(line)
        updated = ''.join(lines).encode('utf-8')
        if updated != content.encode('utf-8'):
            # Preserve a BOM, all other profile entries, and the original newlines.
            changes[profile] = (b'\xef\xbb\xbf' if profile.read_bytes().startswith(b'\xef\xbb\xbf') else b'') + updated

    changes = {file: data for file, data in changes.items()
               if not file.exists() or file.read_bytes() != data}
    if not changes:
        return {'previous_root': str(previous), 'root': str(root), 'changed': [], 'backup': None}
    backup = root / 'logs' / ('obs-relink-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    backup.mkdir(parents=True)
    before = {file: file.read_bytes() if file.exists() else None for file in changes}
    for index, (file, data) in enumerate(before.items()):
        if data is not None:
            (backup / (str(index) + '-' + file.name)).write_bytes(data)
    (backup / 'manifest.json').write_text(json.dumps({
        'previous_root': str(previous), 'root': str(root),
        'files': [{'path': str(file), 'backup': str(index) + '-' + file.name if data is not None else None}
                  for index, (file, data) in enumerate(before.items())]
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    written = []
    try:
        for folder in recording_folders:
            folder.mkdir(parents=True, exist_ok=True)
        for file, data in changes.items():
            temp = file.with_name(file.name + '.a1-new')
            try:
                temp.write_bytes(data)
                temp.replace(file)
            finally:
                temp.unlink(missing_ok=True)
            written.append(file)
    except Exception:
        for file in reversed(written):
            if before[file] is None:
                file.unlink(missing_ok=True)
            else:
                file.write_bytes(before[file])
        raise
    return {'previous_root': str(previous), 'root': str(root),
            'changed': [str(file) for file in changes], 'backup': str(backup)}
