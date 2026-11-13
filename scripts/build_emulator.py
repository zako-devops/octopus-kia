"""Build an offline fixture app for emulator-only confirmation testing.

Temporarily switches the phone adapter, restores production source in finally,
and moves the simulator PBW to artifacts. An existing production PBW is restored
byte-for-byte; the simulator never occupies build/octopus-kia.pbw afterward. No real API call or physical install occurs.
"""
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    mode = ROOT / 'src/pkjs/runtime-mode.js'
    original = mode.read_bytes()
    pbw = ROOT / 'build/octopus-kia.pbw'
    artifact = ROOT / 'artifacts/octopus-kia-emulator.pbw'
    artifact.parent.mkdir(exist_ok=True)
    production = pbw.read_bytes() if pbw.exists() else None
    try:
        mode.write_text('module.exports = {simulation:true};\n')
        env = dict(os.environ)
        env.setdefault('PEBBLE_EXTRA_PATH', '/tmp/pebble-compat/bin')
        subprocess.run(['pebble', 'build'], cwd=ROOT, env=env, check=True)
        shutil.move(pbw, artifact)
    finally:
        mode.write_bytes(original)
        if production is not None:
            pbw.write_bytes(production)
        elif pbw.exists():
            pbw.unlink()
    print('Offline emulator bundle: artifacts/octopus-kia-emulator.pbw')
    print('Production source restored; previous production PBW preserved if present.')

if __name__ == '__main__':
    main()
