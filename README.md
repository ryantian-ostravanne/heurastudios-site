# heurastudios.com

The Heura Studios marketing site: home page, blog, legal pages and the old `/waitlist/` page. It's a static site
that GitHub Pages builds with Jekyll 3.10, plus a small Google Apps Script that saves form sign-ups to a Google Sheet.

## Quick start

```sh
gem install 'jekyll:3.10.0' kramdown-parser-gfm webrick   # once
npm install && npx playwright install chromium            # once, for the tests

npm run serve    # http://localhost:4000, rebuilds on save
npm test         # backend + page tests
```

Pushing to `main` deploys (GitHub Pages, about a minute). CI runs `npm test` on every push and pull request.

## Where things are

| Path | What it is |
| --- | --- |
| `_layouts/default.html` | The page shell every page uses: `<head>`, header, page content, footer |
| `_includes/head.html` | Everything in `<head>`: meta and link-preview tags, the theme script, fonts, CSS and JS |
| `_includes/header.html`, `footer.html`, `logo.html` | The shared header, footer and logo |
| `_layouts/blog.html`, `post.html` | Blog wrapper and a single post |
| `index.html` + `home.css` + `home.js` | Home page: hero, screen recording, tools, specs, Request access form |
| `_data/tools.yml` | The tool rows on the home page (edit copy here, not in the HTML) |
| `privacy/`, `terms/` + `legal.css` | Privacy Policy and Terms of Service |
| `waitlist/` | The old waitlist page (kept for old links) |
| `blog/index.html`, `_posts/`, `blog.css` | Blog list and posts (Markdown) |
| `site.css`, `site.js` | Shared by every page: color tokens, base styles, header, footer, the Appearance switch, the canvas in the side margins and the sheet under the column (screens 1360px and wider) |
| `form.js` | Shared form logic for both forms (validation, posting, error and success messages) |
| `_backend/` | The Apps Script behind the forms: `core.js` (logic, tested in Node) and `Code.gs` (Google wiring) |
| `_tests/` | Playwright page tests (run against the Jekyll build) |
| `_tools/` | Python scripts that make the screen recordings and the logo/icon files |
| `img/`, `reports/` | Images, recordings, report PDFs |
| `_config.yml` | Site config, including `form_endpoint` (the Apps Script URL) |

Folders starting with `_` are never published.

## Common changes

- **A page's title, description or link preview:** the front matter at the top of the page (`title`,
  `description`, and optionally `og_title` / `og_description`). `_includes/head.html` lists every option.
- **Header, footer or logo:** edit the file in `_includes/` once. Every page picks it up.
- **A new page:** create `something/index.html` with front matter (`layout: default`, `title`, `description`, and
  `css:` / `js:` for any page-specific files), then write the page's `<main>…</main>`.
- **A tool on the home page:** edit `_data/tools.yml`.
- **The forms' endpoint:** `form_endpoint` in `_config.yml`.
- **Colors:** tokens at the top of `site.css`. Every color has a light, dark and high-contrast value. The site is
  black and white only.

## Forms and the sheet

Both forms post to one Apps Script web app (`form_endpoint`). The home page sends `kind=request` and three extra
fields. With JS, `form.js` posts with `js=1` and shows the JSON result in place. Without JS, the browser posts the
form and the script answers with a plain page.

The sheet keeps one row per email: Joined at, Email, Company, Came from, Name, Role, What they will specialize.
Signing up again doesn't add a row. If someone on the waitlist later requests access, the request fills in Name,
Role and What they will specialize on their existing row. "Came from" is the page's utm query, the page on this
site that linked them, or the other website that did.

Spam protection: a hidden honeypot field, a limit of 60 new rows a minute, and a leading `'` on any cell that would
start a spreadsheet formula.

**Deploying a backend change:** paste `core.js` (as a script file named `core`) and `Code.gs` into the Apps Script
project. Run `setup()` once (it adds any missing header cell), then Deploy > Manage deployments > Edit > Version:
New version. The `/exec` URL stays the same.

## Writing a blog post

1. On GitHub, open `_posts` and choose **Add file > Create new file**.
2. Name it `YYYY-MM-DD-short-name.md` (lowercase, dashes). It will be at heurastudios.com/blog/short-name/.
3. Start with these lines. Leave out `report` if there's no PDF. Then write the post in Markdown below them.

   ```
   ---
   title: "What we learned from Arche 0.22"
   description: "One or two sentences. The blog list, search results and link previews show it."
   author: Ryan
   report: /reports/heura-eval-005.pdf
   ---
   ```

4. **Commit changes.** The site updates in about a minute.
5. For a report, upload the PDF to `reports/` with the name from the `report` line. For a picture, upload it to
   `img/blog/` and use `![What the picture shows](/img/blog/name.png)`.

If the front matter is broken (a missing `---`, or a title containing a colon but no quotes), GitHub emails the
error and the site keeps its last good version. Fix the file and commit again.

## Media and icons

- **Screen recording** (`img/pipeline-run*`): one run in the real Studio, in desktop and phone sizes, light and
  dark, as `.mp4` (H.264, for iPhones) and `.webm`, each with a `.webp` poster. To re-record:
  `python3 _tools/record-pipeline.py <app checkout> img` with `--dark`, `--phone` and `--phone --dark`. Needs
  ffmpeg and Playwright for Python. Last recorded Oct 29, 2026, from the app at f6764a9.
- **Side margins and the sheet:** on screens 1360px and wider, the Studio's canvas (its grey and dot grid) fills the
  margins and stays still while the page scrolls (`body::before` in `site.css`, fixed), and the column is a sheet
  on it, the page's color with an edge (`main::before`).
- **Pipeline wires** (`_includes/wires.html`): decoration that makes a box a node on a pipeline, wires running in
  from the screen's left edge and out past its right edge, beside each legal page's title (from 1100px, `legal.css`).
- **The footer is a pipeline** (`_includes/footer.html`, styled in `site.css`): its sections are Studio nodes on
  the Studio's dark canvas, wired in order and across. Wires that pass a node run under or over it (`.ov-lane`);
  the nodes sit at fixed heights, so moving one means moving its wires' ends too. On a phone the nodes stack.
  `_tests/margins.test.js` checks all of this.
- **Logo and icons** (`favicon.*`, `icon-512.png`, `apple-touch-icon.png`, `og-image.png`): all drawn from one
  drawing in `_tools/make-logo.py`. Run `python3 _tools/make-logo.py` (add `--card` to also update the link-preview
  card). If the drawing changes, update the inline SVG in `_includes/logo.html` to match. The tests check that.
