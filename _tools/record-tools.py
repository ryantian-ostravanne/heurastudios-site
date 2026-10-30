"""Records the Tools page's clips (heurastudios.com/tools/): each of the Studio's tools in use, a few seconds each.

It drives a real Heura Studio (web.py with the stand-in model and trainer, and a stand-in OpenAI for OpenAI fine-tune)
through Chromium at 640 x 480, drawn at 2x. At that size a tool opens as a sheet over the page, so each clip is the
tool itself, close up, with a pointer doing what a person would. Frames come from the page as it paints (CDP
screencast, so text stays sharp) and are encoded at a steady 30 per second with ffmpeg.

usage: python3 _tools/record-tools.py APP_DIR img/tools [--dark] [--only grounding,policies] [--keep]
  APP_DIR: a checkout of the app (started with a fresh, throwaway studio_data)
  writes <tool>.mp4 (H.264), <tool>.webm (VP9) and <tool>.webp (the first frame, the poster); with --dark, each name
  ends in -dark. The tools, in the order they're recorded (later ones build on what earlier ones made):
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

TOOLS = ["grounding", "policies", "demonstrations", "interviews", "playground", "corrections", "eval-set", "base-model",
         "fine-tune", "promotion-gate", "serving", "openai-fine-tune"]
__doc__ += "  " + ", ".join(TOOLS) + "\n"

ap = argparse.ArgumentParser()
ap.add_argument("app"); ap.add_argument("out")
ap.add_argument("--port", type=int, default=8170)
ap.add_argument("--dark", action="store_true")
ap.add_argument("--only", default="", help="a comma-separated list of the tools to record (default: all)")
ap.add_argument("--keep", action="store_true", help="keep the frames folders")
a = ap.parse_args()
W, H, SCALE = 640, 480, 2
URL = f"http://127.0.0.1:{a.port}"
OUT = Path(a.out); OUT.mkdir(parents=True, exist_ok=True)
ONLY = [t for t in a.only.split(",") if t] or TOOLS
for t in ONLY:
    if t not in TOOLS:
        sys.exit(f"no such tool: {t} (the tools: {', '.join(TOOLS)})")

# ── a throwaway Studio ───────────────────────────────────────────────
# web.py with the stand-in model and trainer (the replay mix as many rows as a real run's), and OpenAI stood in for by
# the app's own test double (tests/fake_providers.py), so OpenAI fine-tune runs a job, start to finish, on this computer
LAUNCH = """
import sys
from studio import training
row = {"messages": [{"role": "user", "content": "(replay)"}, {"role": "assistant", "content": "(replay)"}]}
training.set_runner(training.fake_runner, mix_fn=lambda: [dict(row) for _ in range(training.MIX_ROWS)])
from tests.fake_providers import FakeProvider
from studio.engines import catalog, settings
fake = FakeProvider().start()
fake.ft_statuses = ["validating_files", "running", "succeeded"]
fake.ft_model = "ft:gpt-4.1-mini-2025-04-14:fernbrook::support1"
catalog.KINDS["openai"]["base"] = fake.url + "/v1"
_host_of = catalog.host_of   # (where answers go, as the Studio says it: OpenAI's own address, as with a real key)
catalog.host_of = lambda kind, conn=None: "api.openai.com" if kind == "openai" else _host_of(kind, conn)
settings.FINETUNE_POLL_SECONDS = 1
# the stand-in model can't interview: it answers as the model would for the one answer the Interviews clip gives (two
# facts saved from it, then the next topic's question)
from studio import interview
class Interviewer:
    def generate(self, prompt, **kw):
        return ("SAVE fact | facts: Sells outdoor gear: tents, sleeping bags and packs.\\n"
                "SAVE fact | facts: Sells online across Canada and ships from Calgary.\\n"
                "ASK process: Thanks, that helps. How does a typical return get handled?")
interview.brain_for = lambda ai, channel, version=0: Interviewer()
import web
web.main(["--fake-engine", "--port", sys.argv[1]])
"""
data = Path(tempfile.mkdtemp(prefix="heura-tools-"))
env = {**os.environ, "HEURA_STUDIO_DIR": str(data / "studio_data"), "HEURA_MASTER_KEY_FILE": str(data / "master.key")}
log = tempfile.NamedTemporaryFile(prefix="heura-tools-server-", suffix=".log", delete=False)   # (kept if it fails)
server = subprocess.Popen([sys.executable, "-c", LAUNCH, str(a.port)],
                          cwd=a.app, env=env, stdout=log, stderr=subprocess.STDOUT)


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


# a pointer the recording can see (the real one isn't painted): an arrow that follows the mouse, pressed in on a click
ARROW = """
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
"""

# the file the Grounding clip adds
GIFT_CARDS = """# Gift cards

Fernbrook gift cards come in any amount from $10 to $500, and they never expire.

You can use a gift card online or in any Fernbrook store, for anything except another gift card.

A lost gift card can be replaced if you still have the order number or the receipt.
"""


class Clip:
    """one tool's recording: a page open on the tool, a pointer, and the frames"""

    def __init__(self, browser, cookie, ai, node, query=""):
        name, value = cookie.split("=", 1)
        self.ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=SCALE,
                                       color_scheme="dark" if a.dark else "light", reduced_motion="no-preference")
        self.ctx.add_cookies([{"name": name, "value": value, "url": URL}])
        self.ctx.add_init_script(ARROW)
        self.page = self.ctx.new_page()
        self.page.goto(f"{URL}/studio#/ai/{ai}/overview?node={node}{query}")
        self.page.locator(".ppanel.is-open").wait_for()
        self.page.wait_for_timeout(1200)
        self.mouse = {"x": W * 0.72, "y": H * 0.9}
        self.page.mouse.move(self.mouse["x"], self.mouse["y"])
        self.got = []
        self.lapses = []

    def __enter__(self):
        cdp = self.ctx.new_cdp_session(self.page)

        def on_frame(ev):
            self.got.append((ev["metadata"]["timestamp"], ev["data"]))
            try:
                cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
            except Exception:
                pass
        cdp.on("Page.screencastFrame", on_frame)
        cdp.send("Page.startScreencast", {"format": "png", "everyNthFrame": 1, "maxWidth": W * SCALE, "maxHeight": H * SCALE})
        self.cdp = cdp
        self.wait(900)   # the tool, as it opens
        return self

    def __exit__(self, *exc):
        if exc[0] is None:
            self.wait(1600)   # what it did
        self.end = time.time()   # (a page that's still sends no frames: the last one lasts until here)
        self.cdp.send("Page.stopScreencast")
        self.page.wait_for_timeout(200)
        self.ctx.close()

    def wait(self, ms):
        self.page.wait_for_timeout(ms)

    def glide(self, x, y, ms=750):
        """the pointer to (x, y) along a soft curve, easing in and out, as a hand would"""
        x0, y0 = self.mouse["x"], self.mouse["y"]
        n = max(10, int(ms / 16))
        bend = 0.12 * math.hypot(x - x0, y - y0)
        nx, ny = (-(y - y0), x - x0)
        norm = math.hypot(nx, ny) or 1
        for i in range(1, n + 1):
            t = i / n
            e = t * t * (3 - 2 * t)
            arc = math.sin(math.pi * e) * bend
            self.page.mouse.move(x0 + (x - x0) * e + nx / norm * arc, y0 + (y - y0) * e + ny / norm * arc)
            self.page.wait_for_timeout(16)
        self.mouse.update(x=x, y=y)

    def click(self, locator, dx=0.5, dy=0.5, ms=750):
        locator.wait_for()
        b = locator.bounding_box()
        if b["y"] < 120 or b["y"] + b["height"] > H - 12:   # (off the screen, or under the tool's own head: there first)
            self.scroll_to(locator, 0.55 if b["height"] < 120 else 0.3)
            self.wait(250)
            b = locator.bounding_box()
        self.glide(b["x"] + b["width"] * dx, b["y"] + b["height"] * dy, ms)
        self.wait(120)
        self.page.mouse.down()
        self.wait(100)
        self.page.mouse.up()

    def lapse(self, until, factor=5):
        """waits for `until` (a locator) with the clip sped up `factor` times meanwhile: a job that takes a while"""
        t0 = time.time()
        until.wait_for(timeout=90000)
        self.lapses.append((t0, time.time(), factor))

    def type(self, text, delay=24):
        self.page.keyboard.type(text, delay=delay)

    def scroll_to(self, locator, at=0.3, ms=700):
        """scrolls the tool's sheet (it scrolls itself), eased, until locator's top is at `at` of the screen's height"""
        locator.wait_for()
        locator.evaluate("""(el, [at, ms, H]) => new Promise((done) => {
          const s = el.closest('.ppanel.is-open') || document.scrollingElement;
          const from = s.scrollTop, to = Math.max(0, Math.min(s.scrollHeight - s.clientHeight,
            from + el.getBoundingClientRect().top - H * at));
          const t0 = performance.now();
          const step = (now) => {
            const t = Math.min(1, (now - t0) / ms), e = t * t * (3 - 2 * t);
            s.scrollTop = from + (to - from) * e;
            t < 1 ? requestAnimationFrame(step) : done();
          };
          requestAnimationFrame(step);
        })""", [at, ms, H])


def encode(got, slug, frames, end, lapses=()):
    """the frames, at a steady 30 per second: an .mp4 (H.264), a .webm (VP9) and the first frame (.webp)"""
    tag = slug + ("-dark" if a.dark else "")
    got.sort()
    for i, (ts, b64) in enumerate(got):
        (frames / f"f{i:05d}.png").write_bytes(base64.b64decode(b64))
    lines = []
    for i, (ts, _) in enumerate(got):
        nxt = got[i + 1][0] if i + 1 < len(got) else max(end, ts + 0.5)
        speed = next((f for t0, t1, f in lapses if t0 <= ts < t1), 1)
        lines.append(f"file 'f{i:05d}.png'\nduration {max(0.001, (nxt - ts) / speed):.4f}")
    lines.append(f"file 'f{len(got) - 1:05d}.png'")
    (frames / "list.txt").write_text("\n".join(lines) + "\n")
    w, h = W * SCALE, H * SCALE
    vf = f"fps=30,scale={w}:{h}:flags=lanczos,format=yuv420p"
    src = ["-f", "concat", "-safe", "0", "-i", str(frames / "list.txt")]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, "-vf", vf, "-c:v", "libx264", "-preset", "slow",
                    "-crf", "26", "-movflags", "+faststart", "-an", str(OUT / f"{tag}.mp4")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, "-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38",
                    "-row-mt", "1", "-an", str(OUT / f"{tag}.webm")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(frames / "f00000.png"), "-vf",
                    f"scale={w}:{h}:flags=lanczos", "-quality", "86", str(OUT / f"{tag}.webp")], check=True)
    print(f"{tag}: {len(got)} frames, {round(max(end, got[-1][0]) - got[0][0], 1)} s,",
          ", ".join(f"{f.suffix[1:]} {f.stat().st_size // 1024} KB" for f in sorted(OUT.glob(f"{tag}.*"))))


# ── the clips ────────────────────────────────────────────────────────
def grounding(c, files):
    c.wait(500)
    with c.page.expect_file_chooser() as fc:
        c.click(c.page.get_by_role("button", name="choose files"))
    fc.value.set_files(str(files / "Fernbrook Gift Cards.md"))
    c.wait(900)
    c.scroll_to(c.page.locator(".ppanel").get_by_text("Fernbrook Gift Cards.md").first, 0.55)
    c.page.locator(".ppanel").get_by_text("Fernbrook Gift Cards.md").first.wait_for()
    c.wait(1500)


def policies(c, files):
    c.click(c.page.locator("#new-instruction"), 0.3, 0.5)
    c.wait(250)
    c.type("Never promise a delivery date. Share the carrier's tracking link instead.")
    c.wait(400)
    c.click(c.page.get_by_role("button", name="Add policy"))
    c.wait(900)
    new = c.page.locator(".ppanel").get_by_text("Never promise a delivery date").first
    c.scroll_to(new, 0.45)
    c.wait(200)
    b = new.bounding_box()   # (the pointer comes to rest on the new rule, not by the sheet's Remove button)
    c.glide(b["x"] + b["width"] * 0.55, b["y"] + b["height"] * 0.5, 650)
    c.wait(300)


def demonstrations(c, files):
    panel = c.page.locator(".ppanel")
    c.click(panel.get_by_label("Question").first, 0.3, 0.5)
    c.type("Can I change my shipping address after I order?")
    c.wait(300)
    c.click(panel.get_by_label("Answer").first, 0.3, 0.4)
    c.type("Yes, until it ships. Reply to your order confirmation with the new address and we'll update it.", 16)
    c.wait(400)
    c.click(panel.get_by_role("button", name="Add demonstration"))
    c.wait(900)
    c.scroll_to(panel.get_by_text("Can I change my shipping address after I order?").first, 0.45)


def interviews(c, files):
    panel = c.page.locator(".ppanel")
    c.click(panel.locator("#iv-input"), 0.3, 0.5)
    c.type("Outdoor gear: tents, sleeping bags and packs. We sell online across Canada and ship from Calgary.", 18)
    c.wait(400)
    c.click(panel.get_by_role("button", name="Send"))
    panel.locator(".iv-msg-model").nth(1).wait_for(timeout=30000)   # what it saved, and its next question
    c.wait(500)
    c.scroll_to(panel.locator(".iv-msg-model").last, 0.42)
    c.wait(1600)


def ask(c, question):
    """types a question into the Playground and sends it; -> the answer's own buttons, once it has finished"""
    panel = c.page.locator(".ppanel")
    c.click(panel.locator("#chat-input"), 0.3, 0.5)
    c.type(question, 26)
    c.wait(300)
    c.click(panel.get_by_role("button", name="Send"))
    panel.get_by_role("button", name="Good answer").last.wait_for(timeout=30000)
    c.wait(1100)


def playground(c, files):
    panel = c.page.locator(".ppanel")
    ask(c, "Do gift cards expire?")   # (from the file the Grounding clip added)
    c.click(panel.get_by_role("button", name="Good answer").last)
    panel.get_by_text("Saved as a good answer").last.wait_for()


def corrections(c, files):
    """a correction is made in the Playground (Fix), then it's in Corrections, waiting for the next training"""
    panel = c.page.locator(".ppanel")
    ask(c, "Do you ship to the US?")
    c.click(panel.get_by_role("button", name="Fix").last)
    editor = panel.get_by_label("Better answer").last
    c.click(editor, 0.4, 0.5)
    c.page.keyboard.press("Control+A")
    c.type("Yes. We ship to the US for a flat $15, and orders arrive in 5 to 8 business days.", 16)
    c.wait(300)
    c.click(panel.get_by_role("button", name="Save correction"))
    panel.get_by_text("Fixed", exact=True).last.wait_for()   # (the editor and its hint go once it's saved)
    c.wait(1400)
    c.page.evaluate("location.hash = location.hash.replace(/node=[^&]*/, 'node=correct')")
    c.page.locator('.ppanel.is-open[data-node="correct"]').wait_for()
    c.wait(600)
    c.scroll_to(c.page.locator(".ppanel").get_by_text("Do you ship to the US?").first, 0.4)


def eval_set(c, files):
    panel = c.page.locator(".ppanel")
    c.click(panel.get_by_role("button", name="Run evals"))
    c.wait(700)
    panel.get_by_role("button", name="Run evals").wait_for(timeout=60000)   # (it says Running... until it's done)
    c.wait(400)
    c.scroll_to(panel.get_by_text("Latest run").first, 0.22)
    c.page.locator(".toast").first.wait_for(state="detached", timeout=8000)   # (it ends on the result, not "started")
    c.wait(900)


def base_model(c, files):
    panel = c.page.locator(".ppanel")
    c.wait(500)
    c.click(panel.get_by_role("button", name="Change engine"))
    dialog = c.page.get_by_role("dialog")
    dialog.wait_for()
    c.wait(1200)
    c.click(dialog.get_by_text("OpenAI", exact=True).first, 0.2, 0.5)
    c.wait(1500)
    c.click(dialog.get_by_role("button", name="Cancel"))
    c.wait(500)


def fine_tune(c, files):
    panel = c.page.locator(".ppanel")
    run = panel.get_by_role("button", name="Start a run")
    c.scroll_to(run, 0.62)
    c.wait(500)
    c.click(run)
    c.wait(600)
    c.scroll_to(panel.locator(".ppanel-body"), 0.2)   # back up to the run, as it goes
    panel.get_by_text("is live").first.wait_for(timeout=90000)
    c.wait(800)


def promotion_gate(c, files):
    panel = c.page.locator(".ppanel")
    c.wait(1200)   # its rule
    c.scroll_to(panel.locator("#versions-h"), 0.24)
    c.wait(1800)


def serving(c, files):
    panel = c.page.locator(".ppanel")
    greet = panel.get_by_label("Greeting")
    c.click(greet, 0.85, 0.5)
    c.page.keyboard.press("Control+A")
    c.type("Hi! Ask me about orders, returns or warranty.", 22)
    c.wait(700)
    c.click(c.page.get_by_role("button", name="Open chat: Fernbrook Support"))
    c.wait(1300)
    box = c.page.locator("textarea, input[type=text]").last
    c.click(box, 0.3, 0.5)
    c.type("What amounts do gift cards come in?", 30)
    c.wait(300)
    c.page.keyboard.press("Enter")
    c.page.get_by_text("never expire").last.wait_for(timeout=20000)   # its answer, in the bubble's chat
    c.wait(1800)


def openai_fine_tune(c, files):
    panel = c.page.locator(".ppanel")
    c.scroll_to(panel.locator("#openai-h"), 0.22)
    c.wait(600)
    c.click(panel.get_by_role("button", name="Train on OpenAI"))
    dialog = c.page.get_by_role("dialog")
    dialog.wait_for()
    c.wait(900)
    c.click(dialog.get_by_role("button", name="Train on OpenAI"))
    c.wait(1200)
    c.lapse(panel.get_by_text("trained on your examples").first)   # (OpenAI's job, validating to done, sped up)
    c.wait(1400)
    c.click(panel.get_by_role("button", name="Use it").first)
    c.wait(900)


# tool -> (the node it opens on, the clip, which model: "gpt" is the one that answers with GPT)
CLIPS = {"grounding": ("ground", grounding, ""), "policies": ("policies", policies, ""),
         "demonstrations": ("demonstrate", demonstrations, ""), "interviews": ("interview", interviews, ""),
         "playground": ("playground", playground, ""), "corrections": ("playground", corrections, ""),
         "eval-set": ("evaluate", eval_set, ""), "base-model": ("base", base_model, ""),
         "fine-tune": ("train", fine_tune, ""), "promotion-gate": ("promote", promotion_gate, ""),
         "serving": ("serve", serving, ""), "openai-fine-tune": ("train", openai_fine_tune, "gpt")}


try:
    for _ in range(160):
        try:
            urllib.request.urlopen(URL + "/studio")
            break
        except Exception:
            if server.poll() is not None:
                sys.exit(f"the Studio stopped as it started: {log.name}")
            time.sleep(0.25)
    else:
        sys.exit(f"the Studio didn't start in 40 s: {log.name}")
    h, _ = call("POST", "/api/studio/signup", {"name": "Maya Chen", "email": "maya@fernbrook.example", "company": "Fernbrook",
                                                "password": "correct-horse-battery", "agree": True})
    cookie = h["Set-Cookie"].split(";")[0]
    _, out = call("POST", "/api/studio/ais", {"name": "Fernbrook Support", "purpose": "Answers questions about orders, returns and warranty.",
                                              "kit": "customer-support", "voice": {"preset": "friendly"}, "color": "#1e40ff"}, cookie)
    ai = out["ai"]["id"]
    for n in ("interview", "ground", "policies", "demonstrate", "correct", "evaluate", "base", "train", "promote", "serve",
              "playground"):
        call("POST", f"/api/studio/ais/{ai}/nodes/{n}", {"on": True}, cookie)
    call("POST", f"/api/studio/ais/{ai}/exam/run", {}, cookie)   # a first eval run: the pass rate runs start from
    for _ in range(200):
        _, ex = call("GET", f"/api/studio/ais/{ai}/exam", cookie=cookie)
        if (ex.get("job") or {}).get("state") != "running":
            break
        time.sleep(0.1)
    files = Path(tempfile.mkdtemp(prefix="heura-tools-files-"))
    (files / "Fernbrook Gift Cards.md").write_text(GIFT_CARDS)
    # the same model, answering with GPT through an OpenAI key (the stand-in OpenAI takes any): OpenAI fine-tune's
    _, conn = call("POST", "/api/studio/connections", {"kind": "openai", "key": "sk-proj-fernbrook-demo-key-0001"}, cookie)
    _, out = call("POST", "/api/studio/ais", {"name": "Fernbrook Support", "purpose": "Answers questions about orders, returns and warranty.",
                                              "kit": "customer-support", "voice": {"preset": "friendly"}, "color": "#1e40ff"}, cookie)
    gpt = out["ai"]["id"]
    for n in ("ground", "policies", "demonstrate", "correct", "evaluate", "base", "train", "promote", "serve", "playground"):
        call("POST", f"/api/studio/ais/{gpt}/nodes/{n}", {"on": True}, cookie)
    call("PATCH", f"/api/studio/ais/{gpt}", {"engine": {"kind": "connection", "connection": conn["connection"]["id"],
                                                        "model": "gpt-5"}, "confirm": True}, cookie)
    debug = Path(tempfile.mkdtemp(prefix="heura-tools-debug-"))

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=[f"--force-device-scale-factor={SCALE}"])
        for slug in TOOLS:
            if slug not in ONLY or slug not in CLIPS:
                continue
            node, act, which = CLIPS[slug]
            frames = Path(tempfile.mkdtemp(prefix=f"heura-{slug}-"))
            with Clip(browser, cookie, gpt if which == "gpt" else ai, node) as c:
                try:
                    act(c, files)
                except Exception:
                    c.page.screenshot(path=str(debug / f"{slug}.png"))
                    print(f"{slug}: failed; its screen is {debug / (slug + '.png')}")
                    raise
            encode(c.got, slug, frames, c.end, c.lapses)
            if a.keep:
                print("  frames in", frames)
            else:
                shutil.rmtree(frames, ignore_errors=True)
        browser.close()
finally:
    stop()
