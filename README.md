# heurastudios.com

The Heura Studios site: the home page (post-training for AI-native companies; every call to action is Request access,
and Log in, for teams that have access, is beside its form, not in a header or footer), the blog, the legal pages, and
`/waitlist/` for anyone with an old link.

- `index.html`, `home.js`: the home page (Oct 24, 2026). The hero, a looping screen recording of one run in Heura
  Studios (light and dark; Pause; with Reduce Motion it waits for Play; off screen it rests), Tools (the Studio's own
  eleven tools in its three groups, with its schematic icons, the owner's on dark tiles, and what each takes and gives),
  Specifications (one row per part, saying exactly what it is), and the Request access form. Quiet on purpose: the
  recording is the one thing that moves. The words follow `claude/heura-studios-positioning.md` in the Heura Studios
  project.
- `site.css`, `site.js`: shared by every page: the tokens (light and dark), the header, buttons, the footer and its
  Appearance setting, the header's rule once the page scrolls, and the waitlist page's reveals and sample chat.
- `img/pipeline-run.*` and `img/pipeline-run-dark.*`: the recording (H.264 `.mp4`, offered first since every iPhone
  decodes it itself, and VP9 `.webm`) and its first frame (`.webp`, the poster). `img/pipeline-run-phone.*` and
  `img/pipeline-run-phone-dark.*`: the same run recorded at a phone's size (390 x 600, drawn at 2x), with taps and
  swipes; phones get these (the sources' `media`, `(max-width: 599px)`). Recorded from the real Studio with
  `_tools/record-pipeline.py` (a fresh throwaway Studio with the stand-in model and trainer, a sample model for a
  made-up shop, "Fernbrook Supply Co."), so they can be recorded again:
  `python3 _tools/record-pipeline.py <app checkout> img`, and again with `--dark`, `--phone`, and `--phone --dark`.
- `img/studio-*.webp`: Studio screens from Oct 13 (the waitlist page's sample chat card is `studio-chat-card.webp`).
- `waitlist/`: the old waitlist form. Its `action` is the Apps Script web app. The home page's Request access form posts
  to the same script with `kind=request` and three more fields.
- `privacy/`, `terms/` and `legal.css`: the Privacy Policy and the Terms of Service (Leo's text of Oct 13, 2026,
  the same words as the Heura Studios app's /privacy and /terms; the training switch reads opt-in), linked from
  every page's footer and from the forms. Their placeholders ([insert date before publishing], the contact emails,
  the provider list...) still need filling: they went live with them on Oct 13, 2026.
- `_backend/`: the Apps Script behind both forms (`core.js` is the logic, `Code.gs` the Google side). In the Apps
  Script project they're pasted into one file. The sheet's columns: Joined at, Email, Company, Came from, Name, Role,
  What they will specialize (the last three only from Request access). After pasting a new version, run `setup()` once
  (it adds missing header cells), then Deploy > Manage deployments > Edit > Version: New version (same /exec URL).
- `favicon.ico`, `favicon.svg`, `favicon-32.png`, `icon-512.png`, `apple-touch-icon.png`: the logo mark (an ink
  square with Heura orange through its middle third, as in the header) for tabs, bookmarks, search results and
  home screens; the SVG turns light in dark mode like the header's. `og-image.png`: the 1200x630 card a shared
  link shows (the logo, the headline and a frame of the recording). Every page names the site Heura Studios for link
  previews (`og:site_name`), and the home page for search results (WebSite data).
- `CNAME`: GitHub Pages serves this repo at heurastudios.com. Pages doesn't publish `_` folders.
- The blog (`/blog/`): GitHub Pages builds the repo with Jekyll, and only the blog uses it. Posts are Markdown in
  `_posts/`; the list is `blog/index.html`; both use `_layouts/` (`base.html`: the header and footer; `post.html`).
  Its look is `blog.css`. Report PDFs are in `reports/`, a post's pictures in `img/blog/`. `_config.yml` keeps
  `docs/` and this README off the site. Every other page has no front matter, so Jekyll copies it as it is.

## Writing a blog post

1. On GitHub, open the repo's `_posts` folder, then **Add file → Create new file**.
2. Name it with the date and a short name in lowercase with dashes: `2026-10-20-what-we-learned.md`. The post's
   address is the short name: heurastudios.com/blog/what-we-learned/.
3. Start the file with these lines (the report line only if there's a PDF), then write the post in Markdown below
   them: `## Heading`, paragraphs, `- lists`, `**bold**`, `[a link](https://…)`, tables and images.

   ```
   ---
   title: "What we learned from Arche 0.22"
   description: "One or two sentences: the blog list, search results and link previews show it."
   author: Ryan
   report: /reports/heura-eval-005.pdf
   ---
   ```

4. **Commit changes.** The site updates in about a minute.
5. A report: open the `reports` folder, **Add file → Upload files**, and name the PDF like the post's report line.
   A picture for a post: upload it to `img/blog/` and use `![What the picture shows](/img/blog/name.png)`.

If a post's top lines are broken (a missing `---`, or a title with a colon not in quotes), GitHub emails the error and
the site keeps its last good version. Fix the file and commit again.

## Tests

- Backend: `cd _backend && node --test`
- Pages (headless Chromium through Playwright): `NODE_PATH=$(npm root -g) node --test _tests/*.test.js`.
  The tests stand in for the Apps Script, so they need no Google setup. The blog's tests build the site with
  Jekyll 3.10, the version GitHub Pages runs (`gem install jekyll -v 3.10.0 kramdown-parser-gfm`).

## The sheet

Columns: Joined at, Email, Company, Came from, Name, Role, What they will specialize. One row per email (asking again
doesn't add a row; someone on the waitlist who then requests access gets the request's name, role and use on their row). "Came from" is the page's query (utm tags), the page on this site that sent them, or the other
website that did (the home page's form sends "/"). Name, Role and What they will specialize come from Request access;
a waitlist join leaves them blank. Until the new `core.js` and `Code.gs` are deployed, the script saves the first four
columns of a request and drops the other three.
