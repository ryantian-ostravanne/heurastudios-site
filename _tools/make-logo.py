"""Makes the site's logo files from the one drawing of the Heura Studios mark.

The mark (Ryan, Oct 26, 2026: "make that our company logo"): five pipeline wires, each plugged in on the left. The
outer two run straight; the next two dip into the middle wire and climb back out, so three wires run as one bundle
through the model, then split again. Black and white only.

usage: python3 _tools/make-logo.py [--card]   (needs Playwright for Python and Pillow)
  Writes, at the repo's root:
  - favicon.svg: the bare mark, black, white in dark mode (browsers that take SVG icons use it);
  - favicon.ico (16, 32, 48) and favicon-32.png: the mark in white on a black rounded tile, so it shows on light and
    dark tab bars alike;
  - icon-512.png: the tile at 512; apple-touch-icon.png: the tile at 180, full bleed (Apple rounds the corners).
  --card: also puts the mark into og-image.png in place of the old one (the card's top-left logo, and the logo in
  the recorded Studio's sidebar), leaving every other pixel as it was.
The header and footer draw the same mark inline (`.ov-mark`), from MARK below.
"""
import io
import math
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

# ── the drawing ────────────────────────────────────────────────────────────────
R, PITCH, T, PLUG = 50.0, 20.0, 8.4, 7.56     # the circle the wires fill, the wires' pitch and width, a plug's radius
CX = CY = 60.0
XB, L, M = 12.0, 12.0, 0.52                   # the bundle's half-length, a bend's length, how far the wires pull in
VIEW = (10.0, 12.44, 100.0, 95.12)            # the mark's bounds: x 10 to 110, y 12.44 to 107.56


def f(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def wires():
    """[(path, plug centre)], top to bottom. A bend is a cubic whose height follows smoothstep: level at both ends."""
    out = []
    for k in (-2, -1, 0, 1, 2):
        dy = k * PITCH
        y = CY + dy
        xl = CX - math.sqrt((R - PLUG) ** 2 - dy * dy)     # the plug touches the circle from inside
        xr = CX + math.sqrt((R - T / 2) ** 2 - dy * dy)    # so does the wire's round end
        if abs(k) == 1:
            yi = CY + dy * M
            a, b, c, d = CX - XB - L, CX - XB, CX + XB, CX + XB + L
            path = (f'M{f(xl)} {f(y)}H{f(a)}C{f(a + L / 3)} {f(y)} {f(a + 2 * L / 3)} {f(yi)} {f(b)} {f(yi)}'
                    f'H{f(c)}C{f(c + L / 3)} {f(yi)} {f(c + 2 * L / 3)} {f(y)} {f(d)} {f(y)}H{f(xr)}')
        else:
            path = f'M{f(xl)} {f(y)}H{f(xr)}'
        out.append((path, (xl, y)))
    return out


def body(color, transform=''):
    tr = f' transform="{transform}"' if transform else ''
    ws = wires()
    return (f'<g{tr}><g fill="none" stroke="{color}" stroke-width="{f(T)}" stroke-linecap="round">'
            + ''.join(f'<path d="{d}"/>' for d, _ in ws) + f'</g><g fill="{color}">'
            + ''.join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(PLUG)}"/>' for _, (x, y) in ws) + '</g></g>')


# The inline SVG the pages use for `.ov-mark` (currentColor follows the logo's ink, light or dark).
MARK = (f'<svg class="ov-mark" viewBox="{" ".join(f(v) for v in VIEW)}" aria-hidden="true" focusable="false">'
        + body('currentColor') + '</svg>')


def favicon_svg():
    """the bare mark on a square grid (10..110), black, white when the browser is dark"""
    ws = wires()
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 100 100"><style>.w{stroke:#000}.p{fill:#000}'
            '@media (prefers-color-scheme:dark){.w{stroke:#fff}.p{fill:#fff}}</style>'
            f'<g class="w" fill="none" stroke-width="{f(T)}" stroke-linecap="round">'
            + ''.join(f'<path d="{d}"/>' for d, _ in ws) + '</g><g class="p">'
            + ''.join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(PLUG)}"/>' for _, (x, y) in ws) + '</g></svg>\n')


def tile_svg(size, width, radius=0.225, bg='#000', fg='#fff'):
    """the mark in `fg`, `width` of the tile wide, centred on a `bg` tile (radius 0: full bleed)"""
    x, y, w, h = VIEW
    s = size * width / w
    dx, dy = (size - w * s) / 2 - x * s, (size - h * s) / 2 - y * s
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
            f'<rect width="{size}" height="{size}" rx="{f(size * radius)}" fill="{bg}"/>'
            + body(fg, f'translate({f(dx)} {f(dy)}) scale({f(s)})') + '</svg>')


def render(page, svg, w, h=None):
    """an SVG drawn by Chromium at exactly w x h pixels, transparent around it"""
    h = h or w
    page.set_viewport_size({'width': w, 'height': h})
    page.set_content(f'<html><body style="margin:0;background:transparent">'
                     f'{svg.replace("<svg ", f"<svg width=\"{w}\" height=\"{h}\" style=\"display:block\" ", 1)}</body></html>')
    return Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert('RGBA')


def save_png(img, path):
    img.save(path, optimize=True)


def card(page):
    """Puts the mark into og-image.png where the old one was: the card's logo (a 40 px square at 72,66) and the
    recorded Studio's sidebar logo (a 10 px square at 689,172 on the sidebar's #141416)."""
    path = ROOT / 'og-image.png'
    im = Image.open(path).convert('RGBA')
    px = im.load()
    page_bg, side_bg = px[30, 30], px[700, 200]
    for (x0, y0, x1, y1), bg in (((68, 62, 116, 110), page_bg), ((687, 170, 702, 184), side_bg)):
        for yy in range(y0, y1):
            for xx in range(x0, x1):
                px[xx, yy] = bg
    W, H = im.size
    x, y, w, h = VIEW

    def place(cx, cy, width, color):
        s = width / w
        return body(color, f'translate({f(cx - (x + w / 2) * s)} {f(cy - (y + h / 2) * s)}) scale({f(s)})')

    over = render(page, f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
                        + place(92, 86, 42, '#000') + place(694.5, 176.5, 11, '#f5f5f5') + '</svg>', W, H)
    im.alpha_composite(over)
    im.convert('RGB').save(path, optimize=True)


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(device_scale_factor=1)
        (ROOT / 'favicon.svg').write_text(favicon_svg())
        tiles = {n: render(page, tile_svg(n, 0.76), n) for n in (16, 32, 48)}
        save_png(tiles[32], ROOT / 'favicon-32.png')
        tiles[48].save(ROOT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)], append_images=[tiles[32], tiles[16]])
        save_png(render(page, tile_svg(512, 0.62), 512), ROOT / 'icon-512.png')
        apple = render(page, tile_svg(180, 0.62, radius=0), 180)
        save_png(apple.convert('RGB'), ROOT / 'apple-touch-icon.png')
        if '--card' in sys.argv:
            card(page)
        browser.close()
    print('wrote favicon.svg, favicon.ico, favicon-32.png, icon-512.png, apple-touch-icon.png'
          + (' and og-image.png' if '--card' in sys.argv else ''))


if __name__ == '__main__':
    main()
