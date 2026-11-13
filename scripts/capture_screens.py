"""Regenerate the complete watch-screen catalog using an offline emulator bundle.

Requires scripts/build_emulator.py and an emulator install of its artifact first.
Never run the real trial helper: this script uses only emulator buttons and UI
AppMessage fixtures. It checks for the simulation adapter inside the installed
bundle before sending any button that can confirm a change.
"""
import argparse
import hashlib
import html
import json
import signal
import struct
import subprocess
import time
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/screenshots'
BASE = ['--emulator', 'emery', '--vnc']


def command(*args):
    attempts = 2 if args[0] == 'screenshot' else 1
    for attempt in range(attempts):
        result = subprocess.run(['pebble', *args, *BASE], cwd=ROOT,
                                capture_output=True, text=True, timeout=25)
        if not result.returncode:
            return
        if attempt + 1 < attempts:
            time.sleep(0.5)
    raise RuntimeError('Emulator command failed: ' + ' '.join(args[:2]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resume-from', type=int, default=1, help='Resume after a failed capture, with the emulator at the corresponding result screen')
    start = parser.parse_args().resume_from
    assert start >= 1
    bundle = ROOT / 'artifacts/octopus-kia-emulator.pbw'
    installed = Path.home() / '.local/share/pebble-sdk/4.44/emery/app_cache/d8ebdf30-61e3-4157-9e88-f5364d939733.pbw'
    assert bundle.read_bytes() == installed.read_bytes(), 'Install the offline bundle before capturing'
    with zipfile.ZipFile(bundle) as archive:
        js = archive.read('pebble-js-app.js').decode()
        assert 'simulation:true' in js or 'simulation:!0' in js, 'Offline adapter must be enabled'
    keys = json.loads((ROOT / 'build/js/message_keys.json').read_text())
    fixtures = json.loads(subprocess.check_output(['node', 'scripts/screenshot_fixtures.cjs'], cwd=ROOT, text=True))
    OUT.mkdir(parents=True, exist_ok=True)
    captures = []
    transitions = []
    logger = subprocess.Popen(['pebble', 'logs', *BASE], cwd=ROOT, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True)

    def execute(*args):
        if len(captures) >= start - 1:
            command(*args)

    def click(button):
        execute('emu-button', 'click', button)

    def packet(values):
        integers = [f'{keys[k]}={v}' for k, v in values.items() if isinstance(v, int)]
        strings = [f'{keys[k]}={v}' for k, v in values.items() if isinstance(v, str)]
        args = ['send-app-message']
        if integers:
            args += ['--int', *integers]
        if strings:
            args += ['--string', *strings]
        execute(*args)

    def base(**overrides):
        packet(dict(fixtures['base'], **overrides))

    def capture(group, slug, title, caption, origin='display fixture'):
        if origin == 'offline companion and buttons':
            # Keep the illustrative badge stable independently of emulator clock drift.
            packet({'SCHEDULE_UNTIL':fixtures['base']['SCHEDULE_UNTIL']})
        folder = OUT / group
        folder.mkdir(exist_ok=True)
        path = folder / (slug + '.png')
        execute('screenshot', '--no-open', str(path))
        raw = path.read_bytes()
        assert raw[:8] == b'\x89PNG\r\n\x1a\n', 'Not a PNG'
        width, height = struct.unpack('>II', raw[16:24])
        assert (width, height) == (200, 228), 'Unexpected watch dimensions'
        captures.append({'file':str(path.relative_to(OUT)), 'title':title, 'caption':caption,
                         'group':group, 'origin':origin, 'width':width, 'height':height,
                         'sha256':hashlib.sha256(raw).hexdigest()})
        (OUT/'capture-progress.json').write_text(json.dumps(captures, ensure_ascii=False, indent=2)+'\n')
        print(f'[{len(captures):02}] {group}/{slug}', flush=True)

    def open_confirmation(target=80):
        click('select')
        click('down' if target == 100 else 'up')
        click('select')
        if len(captures) >= start - 1:
            time.sleep(1.2)

    def finish_result():
        click('select')

    try:
        time.sleep(1)
        base()
        capture('01-main', '01-dashboard', 'Dashboard: smart charge scheduled', 'Synthetic Kia 62%, +20% selected, ready 11:00. The green clock/ON indicates a verified schedule.')
        click('select')
        capture('01-main', '02-targets-80', 'Targets: 80% selected', 'Up selects 80%; the exact addition is +18%.')
        click('down')
        capture('01-main', '03-targets-100', 'Targets: 100% selected', 'Down selects 100%; the exact addition is +38%.')
        click('back')
        for target in [80, 100]:
            open_confirmation(target)
            capture('02-confirmation', f'{target}-no', f'Confirm {target}%: No selected', 'No is the default. Select or Back cancels.', 'offline companion and buttons')
            click('up')
            capture('02-confirmation', f'{target}-yes', f'Confirm {target}%: Sí selected', 'Sí rechecks the data, sends once and verifies preferences by reading them back.', 'offline companion and buttons')
            click('select')
            time.sleep(2)
            capture('02-confirmation', f'{target}-verified', f'{target}%: preferences verified', 'Success follows a simulated write and matching read-back; no real provider was contacted.', 'offline companion and buttons')
            finish_result()
            capture('02-confirmation', f'{target}-dashboard', f'Dashboard after {target}%', f'The simulated selected addition is now +{target-62}%.', 'offline companion and buttons')

        base()
        click('down')
        capture('01-main', '04-plan', 'Charging plan', 'Dated charging windows in Madrid time. Octopus may recalculate them.')
        packet({'PLAN_TEXT':'09/11 01:00–02:00\n09/11 02:00–03:00\n09/11 03:00–04:00\n09/11 04:00–05:00\n09/11 05:00–06:00\n09/11 06:00–07:00'})
        click('down'); click('down')
        capture('01-main', '05-plan-scrolled', 'Charging plan: scrolled', 'Up/Down scroll when more than four lines are available.')
        click('back')

        for number, phase in enumerate(fixtures['phases'], 1):
            packet(phase['packet'])
            capture('03-charger-states', f'{number:02}-{phase["slug"]}', phase['title'], phase['caption'])
            click('down')
            capture('03-charger-states', f'{number:02}-{phase["slug"]}-detail', phase['title'] + ': details', phase['packet']['PLAN_TEXT'].replace('\n', ' / '))
            click('back')

        base()
        open_confirmation()
        for state, slug, title, message in [
                (1,'preparing','Reading before confirmation','Consultando datos...'),
                (3,'checking','Rechecking after Sí','Comprobando datos...'),
                (3,'sending','Sending the preference','Enviando a Octopus...')]:
            packet({'CONTROL_STATE':state,'CONTROL_TEXT':message})
            capture('04-operation', slug, title, 'Display fixture of a transient state. No real write is issued.')
        packet({'CONTROL_STATE':6,'CONTROL_TEXT':'No se pudo confirmar.\nRevisa Octopus'})
        capture('04-operation','uncertain','Uncertain result','An unverified outcome is never labelled successful or automatically retried.')
        finish_result()

        base()
        open_confirmation()
        packet({'CONTROL_STATE':2,'CONTROL_TEXT':'Datos actualizados.\nConfirma de nuevo','OFFER_ID':123,
                'OFFER_TARGET':80,'OFFER_SOC':'63%','OFFER_EXTRA':'+17%','OFFER_READY':'11:00'})
        capture('04-operation','reconfirm','Changed data: confirm again','The recalculated addition is +17%; No is selected again.')
        click('select'); click('back')

        for state, slug, title, text in [
                (7,'rejected','Octopus rejected the change','Octopus rechazó el cambio'),
                (6,'phone-timeout','Phone did not confirm the outcome','Sin respuesta.\nRevisa Octopus')]:
            base(); open_confirmation()
            packet({'CONTROL_STATE':state,'CONTROL_TEXT':text})
            capture('04-operation',slug,title,'Display fixture using the app result layout; no request is retried.')
            finish_result()

        for number, warning in enumerate(fixtures['warnings'], 1):
            base(); open_confirmation()
            packet({'CONTROL_STATE':5,'CONTROL_TEXT':warning['text']})
            capture('05-warnings', f'{number:02}-{warning["slug"]}', warning['title'], warning['text'].replace('\n', ' / ') + '. Message generated by the actual proposal validator.')
            finish_result()

        for slug, title, overrides in [
                ('loading','Loading data',dict(LOADING=1,NOTE='Actualizando...',SOC=-1,SOC_TEXT='--',ADD_TEXT='--',READY='--:--',CHARGER_PHASE=0,CHARGER_TEXT='Esperando a Octopus',SCHEDULE_UNTIL=0)),
                ('kia-error','Kia read failed',dict(KIA_STATE=2,NOTE='Error Kia',KIA_TIME='Kia sin fecha')),
                ('octopus-error','Octopus read failed',dict(OCTOPUS_STATE=2,CHARGER_PHASE=0,CHARGER_TEXT='Estado sin actualizar',SCHEDULE_UNTIL=0,NOTE='Error Octopus')),
                ('cached-kia','Cached parked-car reading',dict(KIA_FRESH=0,NOTE='Última lectura Kia',KIA_TIME='Kia 08/11 12:00')),
                ('unconfigured','Configuration required',dict(KIA_STATE=0,OCTOPUS_STATE=0,SOC=-1,SOC_TEXT='--',ADD_TEXT='--',READY='--:--',NOTE='Configura Kia y Octopus',KIA_TIME='Kia sin fecha',CHARGER_PHASE=0,CHARGER_TEXT='Esperando a Octopus',SCHEDULE_UNTIL=0))]:
            base(**overrides)
            capture('06-data-and-settings',slug,title,'Illustrative source/configuration state; retained values are not erased by transient errors.')
        base(); packet({'SETTINGS_SAVED':1})
        capture('06-data-and-settings','settings-saved','Configuration saved','Watch acknowledgement of phone settings. No credential value is displayed.')
        packet({'SETTINGS_SAVED':-1})
        capture('06-data-and-settings','settings-error','Configuration error','Watch reports that settings were not accepted. No actual settings were changed.')
        time.sleep(4)
        base()
        # Restore the offline companion state, without switching back to real APIs.
        click('up')
    finally:
        logger.send_signal(signal.SIGINT)
        try:
            output, _ = logger.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            logger.kill(); output, _ = logger.communicate()
        transitions = [line for line in output.splitlines() if 'UI screen=' in line]

    manifest = {'captured_at':datetime.now().astimezone().isoformat(),
                'platform':'emery','dimensions':[200,228],
                'mode':'offline synthetic documentation captures; no real APIs or writes',
                'simulation_footer':True, 'resumed_from_capture':start, 'navigation_log_transitions':len(transitions),
                'bundle_sha256':hashlib.sha256(bundle.read_bytes()).hexdigest(),'screens':captures}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    make_index(captures)
    (OUT/'capture-progress.json').unlink(missing_ok=True)
    print(f'Complete: {len(captures)} screens, {len(transitions)} navigation transitions. Offline dashboard restored.',flush=True)


def make_index(captures):
    intro = ('Pebble Time 2 · emery · 200×228. All images are direct emulator captures of the current C UI. '
             'Values and provider outcomes are synthetic. The orange simulation footer is intentional. '
             'No real API requests, charging changes or physical-watch installation were used. '
             'Ready/control-capable is not proof of delivered charge. This catalog covers watch screens; '
             'the Android credentials form is a separate phone UI.')
    parts=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>octopus-kia screen catalog</title>',
           '<style>body{background:#0c0b18;color:#f4f1ff;font:16px system-ui;padding:28px;margin:0}main{max-width:1400px;margin:auto}p{line-height:1.5;color:#c3bbd6}nav{display:flex;gap:12px;flex-wrap:wrap}a{color:#78eee7}section{display:flex;flex-wrap:wrap;gap:18px}article{background:#19152c;border:1px solid #39294e;border-radius:12px;padding:16px;width:220px}h2{margin-top:40px}h3{font-size:16px;min-height:40px}img{width:200px;height:228px;image-rendering:pixelated}article p{font-size:13px}code{font-size:11px;overflow-wrap:anywhere}button{background:#49308a;color:white;border:0;border-radius:8px;padding:10px;margin:12px 0}.large img{width:300px;height:342px}.large article{width:320px}</style><main>',
           '<h1>octopus-kia · screen catalog</h1><p>'+html.escape(intro)+'</p><p>'+str(len(captures))+' screens · <a href="manifest.json">Capture manifest</a></p><button onclick="document.body.classList.toggle(\'large\')">Toggle 1× / 1.5× display</button><nav>']
    groups=list(dict.fromkeys(c['group'] for c in captures))
    for g in groups:
        parts.append(f'<a href="#{g}">{html.escape(g)}</a>')
    parts.append('</nav>')
    lines=['# Watch-screen catalog\n',intro+'\n',f'\n{len(captures)} screens. Open [index.html](index.html) for the visual gallery.\n',
           '\nRegenerate after building/installing the offline bundle:\n\n```bash\npython3 scripts/capture_screens.py\n```\n',
           '\nThe manifest records origin, captions, dimensions and SHA-256 for each image.\n']
    for g in groups:
        parts.append(f'<h2 id="{g}">{html.escape(g)}</h2><section>')
        lines.append(f'\n## {g}\n')
        for c in [c for c in captures if c['group']==g]:
            parts.append('<article><h3>'+html.escape(c['title'])+'</h3><a href="'+c['file']+'"><img loading="lazy" src="'+c['file']+'" alt="'+html.escape(c['title'],quote=True)+'"></a><p>'+html.escape(c['caption'])+'</p><p>Origin: '+html.escape(c['origin'])+'</p><code>'+html.escape(c['file'])+'</code></article>')
            lines.append(f"\n- [{c['title']}]({c['file']}) — {c['caption']}\n")
        parts.append('</section>')
    parts.append('</main></html>')
    (OUT/'index.html').write_text(''.join(parts))
    (OUT/'README.md').write_text('\n'.join(lines))


if __name__ == '__main__':
    main()
