"""Prepare local Appstore artwork and metadata; never uploads or publishes.

Artwork is maintained as SVG and rendered with the system librsvg/Cairo libraries.
Selected emulator screenshots are copied unchanged. No vehicle/API access occurs.
"""
import base64
import ctypes as C
import ctypes.util
import hashlib
import html
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / 'store'


def render(svg, target, width, height):
    rsvg = C.CDLL(ctypes.util.find_library('rsvg-2'))
    cairo = C.CDLL(ctypes.util.find_library('cairo'))
    gobject = C.CDLL(ctypes.util.find_library('gobject-2.0'))
    rsvg.rsvg_handle_new_from_data.argtypes = [C.c_char_p, C.c_size_t, C.POINTER(C.c_void_p)]
    rsvg.rsvg_handle_new_from_data.restype = C.c_void_p
    rsvg.rsvg_handle_render_cairo.argtypes = [C.c_void_p, C.c_void_p]
    rsvg.rsvg_handle_render_cairo.restype = C.c_int
    cairo.cairo_image_surface_create.argtypes = [C.c_int, C.c_int, C.c_int]
    cairo.cairo_image_surface_create.restype = C.c_void_p
    cairo.cairo_create.argtypes = [C.c_void_p]
    cairo.cairo_create.restype = C.c_void_p
    cairo.cairo_scale.argtypes = [C.c_void_p, C.c_double, C.c_double]
    cairo.cairo_surface_write_to_png.argtypes = [C.c_void_p, C.c_char_p]
    cairo.cairo_surface_write_to_png.restype = C.c_int
    cairo.cairo_destroy.argtypes = [C.c_void_p]
    cairo.cairo_surface_destroy.argtypes = [C.c_void_p]
    gobject.g_object_unref.argtypes = [C.c_void_p]
    raw = svg.encode()
    error = C.c_void_p()
    handle = rsvg.rsvg_handle_new_from_data(raw, len(raw), C.byref(error))
    assert handle, 'Could not parse SVG artwork'
    surface = cairo.cairo_image_surface_create(0, width, height)
    context = cairo.cairo_create(surface)
    try:
        assert rsvg.rsvg_handle_render_cairo(handle, context), 'Could not render SVG artwork'
        assert cairo.cairo_surface_write_to_png(surface, str(target).encode()) == 0
    finally:
        cairo.cairo_destroy(context)
        cairo.cairo_surface_destroy(surface)
        gobject.g_object_unref(handle)


def icon_svg(size):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 144 144">
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#342063"/><stop offset="1" stop-color="#100a24"/></linearGradient></defs>
<rect width="144" height="144" rx="30" fill="url(#bg)"/>
<rect x="22" y="37" width="88" height="61" rx="12" fill="#160f30" stroke="#f7efff" stroke-width="6"/>
<path d="M112 57h9v22h-9" fill="#f7efff"/>
<path d="M69 44 47 72h18l-6 21 30-35H72l5-14z" fill="#62eee6"/>
<circle cx="106" cy="106" r="25" fill="#160f30" stroke="#eb80d6" stroke-width="6"/>
<path d="M106 92v15l10 6" fill="none" stroke="#f7efff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>'''


def main():
    (STORE/'assets').mkdir(parents=True, exist_ok=True)
    (STORE/'screenshots').mkdir(exist_ok=True)
    for size in [80, 144]:
        svg = icon_svg(size)
        path = STORE/'assets'/f'icon-{size}.svg'
        path.write_text(svg)
        render(svg, path.with_suffix('.png'), size, size)

    source = ROOT/'docs/screenshots'
    selected = [
        ('dashboard.png','emery_01-dashboard.png','Batería EV6, carga adicional y hora de salida.'),
        ('actions.png','emery_02-actions.png','Objetivos del 80%/100% y carga inmediata.'),
        ('start-confirmation.png','emery_03-start.png','Confirma la carga inmediata; No por defecto.'),
        ('stop-confirmation.png','emery_04-stop.png','Detén la carga forzada y vuelve al plan inteligente.'),
        ('stop-result.png','emery_05-result.png','Verificación del regreso al control inteligente.')]
    shots=[]
    for name, output, caption in selected:
        dst=STORE/'screenshots'/output
        shutil.copyfile(source/name,dst)
        assert dst.read_bytes()==(source/name).read_bytes()
        shots.append({'file':'screenshots/'+output,'caption':caption,
                      'source':str((source/name).relative_to(ROOT)),
                      'sha256':hashlib.sha256(dst.read_bytes()).hexdigest(),
                      'illustrative':True})

    image=base64.b64encode((STORE/'screenshots/emery_01-dashboard.png').read_bytes()).decode()
    cover=f'''<svg xmlns="http://www.w3.org/2000/svg" width="720" height="320" viewBox="0 0 720 320">
<defs><linearGradient id="back" x2="1" y2="1"><stop stop-color="#211044"/><stop offset="1" stop-color="#090b1a"/></linearGradient></defs>
<rect width="720" height="320" fill="url(#back)"/>
<circle cx="660" cy="40" r="200" fill="#34245a" opacity=".28"/>
<path d="M0 284h438" stroke="#62eee6" stroke-opacity=".28" stroke-width="2"/>
<text x="32" y="47" fill="#91f4ed" font-family="DejaVu Sans,sans-serif" font-size="14" letter-spacing="2">PEBBLE TIME 2</text>
<text x="30" y="111" fill="#fff5ff" font-family="DejaVu Sans,sans-serif" font-size="47" font-weight="bold">octopus-kia</text>
<text x="32" y="157" fill="#d2c5e8" font-family="DejaVu Sans,sans-serif" font-size="23">Tu Kia, listo a tiempo.</text>
<rect x="32" y="184" width="91" height="40" rx="10" fill="#553184"/>
<text x="50" y="213" fill="#fff" font-family="DejaVu Sans,sans-serif" font-weight="bold" font-size="26">80%</text>
<rect x="135" y="184" width="107" height="40" rx="10" fill="#553184"/>
<text x="151" y="213" fill="#fff" font-family="DejaVu Sans,sans-serif" font-weight="bold" font-size="26">100%</text>
<text x="32" y="262" fill="#bdb1d0" font-family="DejaVu Sans,sans-serif" font-size="16">Kia · Octopus España · V2C</text>
<text x="32" y="307" fill="#a79abf" font-family="DejaVu Sans,sans-serif" font-size="12">App independiente · zako-devops</text>
<rect x="484" y="31" width="216" height="244" rx="12" fill="#62eee6" opacity=".15"/>
<image x="492" y="39" width="200" height="228" href="data:image/png;base64,{image}"/>
<text x="515" y="299" fill="#a79abf" font-family="DejaVu Sans,sans-serif" font-size="12">Datos de ejemplo</text>
</svg>'''
    (STORE/'assets/banner-emery.svg').write_text(cover)
    render(cover, STORE/'assets/banner-emery.png',720,320)
    package=json.loads((ROOT/'package.json').read_text())
    manifest={'status':'local draft; user chose not to submit',
              'publication_authorized':False,'name':package['pebble']['displayName'],
              'author':package['author'],'uuid':package['pebble']['uuid'],'version':package['version'],
              'category':'Remotes','language':'es','suggested_visibility':'Unlisted',
              'description_file':'description-es.txt','release_notes_file':'release-notes-es.txt',
              'website_url':package.get('homepage'),
              'source_code_url':package.get('repository',{}).get('url','').removesuffix('.git') or None,
              'icon_small':'assets/icon-80.png','icon_large':'assets/icon-144.png',
              'banner':{'emery':'assets/banner-emery.png'},'screenshots':{'emery':shots},
              'note':'This is a local preparation manifest, not a publish-tool configuration.'}
    (STORE/'listing.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    description=(STORE/'description-es.txt').read_text()
    cards=''.join('<figure><img width="200" height="228" src="'+s['file']+'"><figcaption>'+html.escape(s['caption'])+'</figcaption></figure>' for s in shots)
    preview='''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>octopus-kia · ficha preparada</title><style>body{background:#0c0b18;color:#f4efff;font:16px system-ui;margin:0;padding:32px}main{max-width:900px;margin:auto}.cover{max-width:100%;height:auto}h1{margin-bottom:4px}p{color:#c9bfd9;line-height:1.6}pre{white-space:pre-wrap;font:16px system-ui;line-height:1.6}section{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:220px;background:#1c1730;padding:16px;border-radius:12px}figure img{image-rendering:pixelated}figcaption{font-size:14px;line-height:1.5;margin-top:12px}a{color:#62eee6}.draft{color:#91f4ed}</style><main><p class="draft">BORRADOR LOCAL · SIN PUBLICAR</p><img class="cover" width="720" height="320" src="assets/banner-emery.png"><h1>octopus-kia</h1><p>zako-devops · Remotes · Pebble Time 2</p><img width="80" height="80" src="assets/icon-80.png"><pre>'''+html.escape(description)+'''</pre><h2>Capturas</h2><p>Datos ilustrativos, marcados como simulación. Son capturas nativas, sin marco de reloj.</p><section>'''+cards+'''</section><p><a href="listing.json">Datos de la ficha</a> · <a href="README.md">Preparación y publicación</a></p></main></html>'''
    (STORE/'preview.html').write_text(preview)
    print('Prepared local cover, 80/144 icons, five unchanged screenshots, metadata and preview. Nothing uploaded.')


if __name__=='__main__':
    main()
