"""Exercise registration/relink against disposable profiles, never the user's OBS."""
import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import shutil
import tempfile
import unittest
from unittest.mock import patch


class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='a1-obs-registration-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'module'
        (self.root / 'tools').mkdir(parents=True)
        native = Path(__file__).resolve().parents[1] / 'native/a1-output'
        self.script = self.root / 'tools/setup_obs_local.py'
        shutil.copy2(native / 'tools/setup_obs_local.py', self.script)
        for name in ('relink_obs_local.py', 'obs-local-control.lua', 'deck-local-control.lua'):
            shutil.copy2(native / 'tools' / name, self.root / 'tools' / name)
        shutil.copy2(native / 'sender.example.ini', self.root / 'sender.ini')
        self.appdata = Path(self.temp.name) / 'appdata'
        self.obs = self.appdata / 'obs-studio'
        self.scenes = self.obs / 'basic/scenes'
        self.scenes.mkdir(parents=True)
        (self.scenes / 'Original.json').write_text(json.dumps({'name': 'Original', 'sources': []}))

    def run_script(self, *args, processes=b''):
        with patch.dict(os.environ, APPDATA=str(self.appdata)), \
             patch('sys.argv', [str(self.script), *args]), \
             patch('subprocess.check_output', return_value=processes), \
             contextlib.redirect_stdout(io.StringIO()):
            try:
                runpy.run_path(str(self.script), run_name='__main__')
            except SystemExit as error:
                if error.code != 0:
                    raise

    def test_new_collection_preserves_original_and_prevents_duplicate_audio(self):
        original = (self.scenes / 'Original.json').read_bytes()
        self.run_script()
        collection = json.loads((self.scenes / 'A1_Local.json').read_text(encoding='utf-8'))
        self.assertEqual((self.scenes / 'Original.json').read_bytes(), original)
        self.assertEqual([s['id'] for s in collection['sources']], ['a1_local_sync', 'scene'])
        self.assertEqual(collection['sources'][0]['monitoring_type'], 0)
        self.assertFalse(any(k.startswith(('DesktopAudioDevice', 'AuxAudioDevice')) for k in collection))
        with self.assertRaisesRegex(SystemExit, 'refusing to overwrite'):
            self.run_script()

    def test_relink_preserves_layout_profile_and_creates_backup(self):
        self.run_script()
        file = self.scenes / 'A1_Local.json'
        collection = json.loads(file.read_text(encoding='utf-8'))
        previous = Path(self.temp.name) / 'previous'
        previous.mkdir()
        shutil.copy2(self.root / 'sender.ini', previous / 'sender.ini')
        collection['sources'][0]['settings']['config_path'] = str(previous / 'sender.ini')
        collection['custom-key'] = {'keep': True}
        file.write_text(json.dumps(collection), encoding='utf-8')
        before = file.read_bytes()
        profile = self.obs / 'basic/profiles/A1_Local/basic.ini'
        profile_before = profile.read_bytes()
        self.run_script('--relink')
        after = json.loads(file.read_text(encoding='utf-8'))
        self.assertEqual(after['custom-key'], {'keep': True})
        self.assertEqual(after['sources'][1], collection['sources'][1])
        self.assertEqual(after['sources'][0]['settings']['config_path'], str(self.root / 'sender.ini'))
        self.assertEqual(profile.read_bytes(), profile_before)
        backup = next((self.root / 'logs').glob('obs-relink-*/*-A1_Local.json'))
        self.assertEqual(backup.read_bytes(), before)

    def legacy_registration(self, stopped=False):
        self.run_script()
        previous = Path(self.temp.name) / 'legacy'
        previous.mkdir()
        (previous / 'sender.ini').write_text('fps=30\naudio_offset_ms=-12\n', encoding='utf-8')
        (previous / 'local-capture.ini').write_text('fps=60\naudio_offset_ms=25\n', encoding='utf-8')
        file = self.scenes / 'A1_Local.json'
        scene = json.loads(file.read_text(encoding='utf-8'))
        scene['sources'][0]['settings'].update(
            config_path='' if stopped else str(previous / 'local-capture.ini'),
            deck_config_path=str(previous / 'local-capture.ini'))
        scene['modules']['scripts-tool'][0]['path'] = str(previous / 'tools/obs-local-control.lua')
        scene['modules']['scripts-tool'].append({'path': 'unrelated.lua', 'settings': {'keep': True}})
        file.write_text(json.dumps(scene), encoding='utf-8')
        return previous, file

    def test_relink_preserves_both_mixes_stopped_state_and_unrelated_scripts(self):
        previous, file = self.legacy_registration(stopped=True)
        original_sender = (self.root / 'sender.ini').read_bytes()
        self.run_script('--relink')
        after = json.loads(file.read_text(encoding='utf-8'))
        self.assertEqual(after['sources'][0]['settings']['config_path'], '')
        self.assertEqual(after['sources'][0]['settings']['deck_config_path'], str(self.root / 'local-capture.ini'))
        self.assertEqual(after['modules']['scripts-tool'][0]['path'], (self.root / 'tools/obs-local-control.lua').as_posix())
        self.assertEqual(after['modules']['scripts-tool'][1], {'path': 'unrelated.lua', 'settings': {'keep': True}})
        for name in ('sender.ini', 'local-capture.ini'):
            self.assertEqual((self.root / name).read_bytes(), (previous / name).read_bytes())
        self.assertEqual(next((self.root / 'logs').glob('obs-relink-*/*-sender.ini')).read_bytes(), original_sender)
        backups = list((self.root / 'logs').glob('obs-relink-*'))
        self.run_script('--relink')
        self.assertEqual(list((self.root / 'logs').glob('obs-relink-*')), backups)

    def test_relink_moves_recording_destination_without_resetting_profile(self):
        previous, file = self.legacy_registration()
        profile = self.obs / 'basic/profiles/A1_Local/basic.ini'
        old = str(previous / 'logs/obs-recordings').replace('\\', '\\\\')
        untouched = '[Output]\r\nMode=Advanced\r\n[AdvOut]\r\nRecFilePath=C:/Users/Test/Videos\r\n'
        profile.write_bytes(('[SimpleOutput]\r\nFilePath=' + old + '\r\n' + untouched).encode('utf-8'))
        self.run_script('--relink')
        result = profile.read_bytes().decode('utf-8')
        new = str(self.root / 'logs/obs-recordings').replace('\\', '\\\\')
        self.assertEqual(result, '[SimpleOutput]\r\nFilePath=' + new + '\r\n' + untouched)
        self.assertTrue((self.root / 'logs/obs-recordings').is_dir())
        self.assertEqual(json.loads(file.read_text(encoding='utf-8'))['sources'][0]['settings']['config_path'], str(self.root / 'local-capture.ini'))

    def test_missing_legacy_configuration_refuses_to_reset_to_defaults(self):
        previous, file = self.legacy_registration()
        (previous / 'local-capture.ini').unlink()
        before = file.read_bytes()
        with self.assertRaisesRegex(SystemExit, 'configuration is missing'):
            self.run_script('--relink')
        self.assertEqual(file.read_bytes(), before)
        self.assertFalse((self.root / 'local-capture.ini').exists())

    def test_relink_failure_rolls_back_configs_and_scene(self):
        previous, file = self.legacy_registration()
        before_scene = file.read_bytes()
        before_sender = (self.root / 'sender.ini').read_bytes()
        replace = Path.replace
        def fail_scene(path, target):
            if target == file:
                raise OSError('fixture write failure')
            return replace(path, target)
        with patch.object(Path, 'replace', fail_scene), self.assertRaisesRegex(OSError, 'fixture write failure'):
            self.run_script('--relink')
        self.assertEqual(file.read_bytes(), before_scene)
        self.assertEqual((self.root / 'sender.ini').read_bytes(), before_sender)
        self.assertFalse((self.root / 'local-capture.ini').exists())

    @unittest.skipUnless(os.name == 'nt', 'Windows process guard')
    def test_active_obs_blocks_registration_before_writing(self):
        with self.assertRaisesRegex(SystemExit, 'Close OBS'):
            self.run_script(processes=b'"obs64.exe","123"')
        self.assertFalse((self.scenes / 'A1_Local.json').exists())


if __name__ == '__main__':
    unittest.main()
