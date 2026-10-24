"""Records the looping screen recording for heurastudios.com: a run on the Pipeline page, with a cursor.

It drives a real Heura Studio (web.py with the stand-in model and trainer) through Chromium and captures every frame
the page paints (CDP screencast, so text stays sharp), then encodes them at a steady frame rate with ffmpeg.

usage: python3 _tools/record-pipeline.py APP_DIR img [--dark]   (needs ffmpeg, and Playwright for Python)
  APP_DIR: a checkout of the app (the Studio is started from it with a fresh, throwaway studio_data, the stand-in model
  and the stand-in trainer)
  OUT_DIR: gets pipeline-run[-dark].mp4, .webm and a poster (.webp, the first frame)
"""
import argparse
import base64
import json
import math
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("app"); ap.add_argument("out")
ap.add_argument("--port", type=int, default=8150)
ap.add_argument("--dark", action="store_true")
ap.add_argument("--width", type=int, default=1440); ap.add_argument("--height", type=int, default=900)
ap.add_argument("--keep", action="store_true", help="keep the frames folder")
a = ap.parse_args()
URL = f"http://127.0.0.1:{a.port}"
OUT = Path(a.out); OUT.mkdir(parents=True, exist_ok=True)
tag = "pipeline-run" + ("-dark" if a.dark else "")

# ── a throwaway Studio ───────────────────────────────────────────────
# web.py with the stand-in model, and the stand-in trainer as web.py --fake-trainer sets it, except for the replay mix:
# --fake-trainer leaves it empty, so a run would have fewer rows than the Studio's estimate says. Here it's MIX_ROWS
# stand-in rows, as many as a real run's, so the recording shows the rows a real run has.
LAUNCH = """
import sys
from studio import training
row = {"messages": [{"role": "user", "content": "(replay)"}, {"role": "assistant", "content": "(replay)"}]}
training.set_runner(training.fake_runner, mix_fn=lambda: [dict(row) for _ in range(training.MIX_ROWS)])
import web
web.main(["--fake-engine", "--port", sys.argv[1]])
"""
data = Path(tempfile.mkdtemp(prefix="heura-rec-"))
env = {**os.environ, "HEURA_STUDIO_DIR": str(data / "studio_data"), "HEURA_MASTER_KEY_FILE": str(data / "master.key")}
server = subprocess.Popen([sys.executable, "-c", LAUNCH, str(a.port)],
                          cwd=a.app, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def stop():
    if server.poll() is None:
        server.send_signal(signal.SIGTERM)
        try:
            server.wait(10)
        except subprocess.TimeoutExpired:
            server.kill()
    shutil.rmtree(data, ignore_errors=True)


def call(method, path, body=None, cookie=None):
    req = urllib.request.Request(URL + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Cookie": cookie} if cookie else {})})
    with urllib.request.urlopen(req) as r:
        return r.headers, json.loads(r.read() or b"{}")


try:
    for _ in range(80):
        try:
            urllib.request.urlopen(URL + "/studio")
            break
        except Exception:
            time.sleep(0.25)
    h, _ = call("POST", "/api/studio/signup", {"name": "Maya Chen", "email": "maya@fernbrook.example", "company": "Fernbrook",
                                                "password": "correct-horse-battery", "agree": True})
    cookie = h["Set-Cookie"].split(";")[0]
    _, out = call("POST", "/api/studio/ais", {"name": "Fernbrook Support", "purpose": "Answers questions about orders, returns and warranty.",
                                              "kit": "customer-support", "voice": {"preset": "friendly"}, "color": "#1e40ff"}, cookie)
    ai = out["ai"]["id"]
    call("POST", f"/api/studio/ais/{ai}/exam/run", {}, cookie)   # a first eval run: the pass rate the run starts from
    for _ in range(200):
        _, ex = call("GET", f"/api/studio/ais/{ai}/exam", cookie=cookie)
        if (ex.get("job") or {}).get("state") != "running":
            break
        time.sleep(0.1)

    name, value = cookie.split("=", 1)
    frames = Path(tempfile.mkdtemp(prefix="heura-frames-"))
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": a.width, "height": a.height}, device_scale_factor=2,
                                  color_scheme="dark" if a.dark else "light", reduced_motion="no-preference")
        ctx.add_cookies([{"name": name, "value": value, "url": URL}])
        # a pointer the recording can see (the real one isn't painted): an arrow that follows the mouse, pressed in on
        # a click
        ctx.add_init_script("""
          addEventListener('DOMContentLoaded', () => {
            const c = document.createElement('div');
            c.setAttribute('aria-hidden', 'true');
            c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;'
              + 'transform:translate(-80px,-80px);will-change:transform';
            const ns = 'http://www.w3.org/2000/svg';
            const s = document.createElementNS(ns, 'svg');
            s.setAttribute('viewBox', '0 0 22 22'); s.setAttribute('width', '22'); s.setAttribute('height', '22');
            const p = document.createElementNS(ns, 'path');
            p.setAttribute('d', 'M3 2.5v15.2l4.1-3.9 2.6 6 3-1.3-2.6-5.9h5.7z');
            p.setAttribute('fill', '#111114'); p.setAttribute('stroke', '#ffffff'); p.setAttribute('stroke-width', '1.4');
            p.setAttribute('stroke-linejoin', 'round');
            s.append(p); c.append(s);
            document.documentElement.append(c);
            let x = -80, y = -80, k = 1;
            const put = () => { c.style.transform = `translate(${x - 3}px,${y - 2}px) scale(${k})`; };
            addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; put(); }, true);
            addEventListener('mousedown', () => { k = 0.86; put(); }, true);
            addEventListener('mouseup', () => { k = 1; put(); }, true);
          });
        """)
        page = ctx.new_page()
        page.goto(f"{URL}/studio#/ai/{ai}/overview?node=demonstrate")   # opens on what the run trains on
        page.locator(".pnode").first.wait_for()
        page.wait_for_timeout(600)

        cdp = ctx.new_cdp_session(page)
        got = []

        def on_frame(ev):
            got.append((ev["metadata"]["timestamp"], ev["data"]))
            try:
                cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
            except Exception:
                pass
        cdp.on("Page.screencastFrame", on_frame)

        mouse = {"x": a.width * 0.62, "y": a.height * 0.86}
        page.mouse.move(mouse["x"], mouse["y"])

        def glide(x, y, ms=900):
            """moves the pointer to (x, y) along a soft curve, easing in and out, as a hand would"""
            x0, y0 = mouse["x"], mouse["y"]
            n = max(12, int(ms / 16))
            bend = 0.12 * math.hypot(x - x0, y - y0)   # a slight arc, not a ruler line
            nx, ny = (-(y - y0), x - x0)
            norm = math.hypot(nx, ny) or 1
            for i in range(1, n + 1):
                t = i / n
                e = t * t * (3 - 2 * t)   # smoothstep
                arc = math.sin(math.pi * e) * bend
                page.mouse.move(x0 + (x - x0) * e + nx / norm * arc, y0 + (y - y0) * e + ny / norm * arc)
                page.wait_for_timeout(16)
            mouse.update(x=x, y=y)

        def center(locator, dx=0.5, dy=0.5):
            b = locator.bounding_box()
            return b["x"] + b["width"] * dx, b["y"] + b["height"] * dy

        def click_on(locator, dx=0.5, dy=0.5, ms=900, hold=110):
            glide(*center(locator, dx, dy), ms=ms)
            page.wait_for_timeout(140)
            page.mouse.down()
            page.wait_for_timeout(hold)
            page.mouse.up()

        node = lambda n: page.locator(f'.pnode[data-node="{n}"]')
        cdp.send("Page.startScreencast", {"format": "png", "everyNthFrame": 1})
        page.wait_for_timeout(2200)                                   # the pipeline, and its demonstrations
        click_on(node("evaluate"), 0.42, 0.3)                         # what it's scored on, before and after
        page.wait_for_timeout(1500)
        click_on(node("train"), 0.36, 0.14)                           # the next run: its rows
        page.wait_for_timeout(1300)
        click_on(page.locator(".pinspect").get_by_role("button", name="Start a run"), ms=700)
        page.locator(".prun.is-running").first.wait_for(timeout=10000)
        glide(*center(node("train"), 0.75, 1.25), ms=1100)            # out of the way while it runs
        page.locator(".pnode[data-node=train] .prun:not(.is-running)").wait_for(timeout=60000)
        page.wait_for_timeout(900)
        click_on(node("promote"), 0.4, 0.2)                           # the gate: live checkpoint and its pass rate
        page.wait_for_timeout(2600)
        cdp.send("Page.stopScreencast")
        page.wait_for_timeout(200)
        browser.close()

    # ── the frames, at a steady 30 per second ─────────────────────────
    got.sort()
    for i, (ts, b64) in enumerate(got):
        (frames / f"f{i:05d}.png").write_bytes(base64.b64decode(b64))
    lines = []
    for i, (ts, _) in enumerate(got):
        nxt = got[i + 1][0] if i + 1 < len(got) else ts + 0.5
        lines.append(f"file 'f{i:05d}.png'\nduration {max(0.001, nxt - ts):.4f}")
    lines.append(f"file 'f{len(got) - 1:05d}.png'")
    (frames / "list.txt").write_text("\n".join(lines) + "\n")
    print("frames", len(got), "seconds", round(got[-1][0] - got[0][0], 2))
    w, h = a.width, a.height   # (the screencast sends frames at the page's size in CSS pixels)
    vf = f"fps=30,scale={w}:{h}:flags=lanczos,format=yuv420p"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(frames / "list.txt"),
                    "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-movflags", "+faststart", "-an",
                    str(OUT / f"{tag}.mp4")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(frames / "list.txt"),
                    "-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1", "-an",
                    str(OUT / f"{tag}.webm")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(frames / "f00000.png"), "-vf", f"scale={w}:{h}:flags=lanczos",
                    "-quality", "86", str(OUT / f"{tag}.webp")], check=True)
    for f in sorted(OUT.glob(f"{tag}.*")):
        print(f.name, f.stat().st_size)
    if a.keep:
        print("frames in", frames)
    else:
        shutil.rmtree(frames, ignore_errors=True)
finally:
    stop()
