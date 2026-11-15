#!/usr/bin/env python3
"""Render feedback.json as feedback.md and an HTML report with its screenshots.

    python3 report.py <feedback.json> [--html-dir DIR]

Writes feedback.md beside feedback.json, and report.html plus report-media/ (copies of
every screenshot the report shows) to DIR, which defaults to the same directory. The
HTML refers to its screenshots by relative path, so report.html and report-media/
move together.

feedback.json:

    {
      "title": "Feedback on the parking map",          optional
      "video": "/path/to/recording.mov",               optional
      "items": [{
        "title": "Replace 'Back to asking' with a back button",
        "kind": "usability",             bug | usability | visual design | missing feature | question
        "when": ["01:21", "02:40"],
        "screenshots": ["/tmp/screencast-feedback/x/frames/014-01m21s.jpg"],
        "what_happened": "...",
        "code": ["src/Panel.tsx:42"],                  optional
        "quote": "...",
        "suggested_change": "...",
        "check": "..."                                 optional
      }],
      "keep": [{"text": "...", "when": ["00:40"], "screenshots": []}],
      "unclear": [...],                                same shape as keep
      "also_on_screen": [...]                          same shape as keep
    }

Python is stdlib only.
"""

import argparse
import html
import json
import shutil
import sys
from pathlib import Path

LISTS = [("keep", "Keep"), ("unclear", "Unclear"), ("also_on_screen", "Also on screen")]

CSS = """
:root { color-scheme: light dark; --fg: #1f2328; --muted: #59636e; --line: #d1d9e0;
  --card: #ffffff; --bg: #f6f8fa; --quote: #eef1f4; }
@media (prefers-color-scheme: dark) { :root { --fg: #e6edf3; --muted: #9198a1;
  --line: #3d444d; --card: #151b23; --bg: #0d1117; --quote: #212830; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; background: var(--bg); color: var(--fg);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; }
h1 { font-size: 24px; margin: 0 0 4px; }
.meta { color: var(--muted); margin: 0 0 20px; }
nav ol { margin: 0 0 24px; padding-left: 22px; }
nav a { color: inherit; }
article { background: var(--card); border: 1px solid var(--line); border-radius: 8px;
  padding: 20px; margin: 0 0 20px; }
article h2 { font-size: 18px; margin: 0 0 8px; }
.tags { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 12px; color: var(--muted);
  font-size: 13px; }
.tag { border: 1px solid var(--line); border-radius: 999px; padding: 1px 10px; }
blockquote { margin: 12px 0; padding: 10px 14px; background: var(--quote);
  border-left: 3px solid var(--muted); border-radius: 4px; }
dt { font-weight: 600; margin-top: 10px; }
dd { margin: 2px 0 0; }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
.shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px; margin-top: 14px; }
.shots figure { margin: 0; }
.shots img { width: 100%; border: 1px solid var(--line); border-radius: 6px; display: block; }
.shots figcaption { color: var(--muted); font-size: 12px; margin-top: 4px; }
section.list { margin: 28px 0 0; }
section.list h2 { font-size: 18px; }
section.list li { margin-bottom: 10px; }
"""


def esc(s):
    return html.escape(str(s or ""))


def norm_entry(e):
    if isinstance(e, str):
        return {"text": e, "when": [], "screenshots": []}
    return {"text": e.get("text", ""), "when": e.get("when") or [],
            "screenshots": e.get("screenshots") or []}


def as_list(v):
    if not v:
        return []
    return v if isinstance(v, list) else [v]


class Media:
    """Copies each screenshot into report-media/ once and returns its relative path."""

    def __init__(self, html_dir):
        self.dir = html_dir / "report-media"
        self.seen = {}

    def add(self, src):
        src = Path(src).expanduser()
        if str(src) in self.seen:
            return self.seen[str(src)]
        if not src.is_file():
            print(f"Screenshot not found: {src}", file=sys.stderr)
            return None
        self.dir.mkdir(parents=True, exist_ok=True)
        name = src.name
        n = 1
        while (self.dir / name).exists():  # Same file name from a different folder.
            n += 1
            name = f"{src.stem}-{n}{src.suffix}"
        shutil.copy2(src, self.dir / name)
        rel = f"report-media/{name}"
        self.seen[str(src)] = rel
        return rel


def shots_html(paths, media, caption_first="best match"):
    figs = []
    for i, p in enumerate(paths):
        rel = media.add(p)
        if not rel:
            continue
        cap = Path(p).name + (f" ({caption_first})" if i == 0 and len(paths) > 1 else "")
        figs.append(f'<figure><a href="{esc(rel)}" target="_blank"><img src="{esc(rel)}" '
                    f'loading="lazy" alt="{esc(Path(p).name)}"></a>'
                    f"<figcaption>{esc(cap)}</figcaption></figure>")
    return f'<div class="shots">{"".join(figs)}</div>' if figs else ""


def render_html(data, media):
    items = data.get("items", [])
    title = data.get("title") or "Screencast feedback"
    meta = [f"{len(items)} item{'s' if len(items) != 1 else ''}"]
    if data.get("video"):
        meta.append(esc(Path(data["video"]).name))
    out = [f"<!doctype html><html><head><meta charset='utf-8'><title>{esc(title)}</title>"
           f"<meta name='viewport' content='width=device-width, initial-scale=1'>"
           f"<style>{CSS}</style></head><body><main>",
           f"<h1>{esc(title)}</h1><p class='meta'>{' · '.join(meta)}</p>"]
    if items:
        out.append("<nav><ol>" + "".join(
            f'<li><a href="#item-{i}">{esc(it.get("title"))}</a></li>'
            for i, it in enumerate(items, 1)) + "</ol></nav>")
    for i, it in enumerate(items, 1):
        tags = [it.get("kind")] + as_list(it.get("when"))
        out.append(f'<article id="item-{i}"><h2>{i}. {esc(it.get("title"))}</h2>'
                   '<div class="tags">' + "".join(
                       f'<span class="tag">{esc(t)}</span>' for t in tags if t) + "</div>")
        if it.get("quote"):
            out.append(f"<blockquote>{esc(it['quote'])}</blockquote>")
        out.append("<dl>")
        for key, label in [("what_happened", "What happened"),
                           ("suggested_change", "Suggested change"), ("check", "Check")]:
            if it.get(key):
                out.append(f"<dt>{label}</dt><dd>{esc(it[key])}</dd>")
        if it.get("code"):
            out.append("<dt>Code</dt><dd>" + "<br>".join(
                f"<code>{esc(c)}</code>" for c in as_list(it["code"])) + "</dd>")
        out.append("</dl>")
        out.append(shots_html(as_list(it.get("screenshots")), media))
        out.append("</article>")
    for key, label in LISTS:
        entries = [norm_entry(e) for e in as_list(data.get(key))]
        if not entries:
            continue
        out.append(f'<section class="list"><h2>{label}</h2><ul>')
        for e in entries:
            when = f" <span class='meta'>({esc(', '.join(e['when']))})</span>" if e["when"] else ""
            out.append(f"<li>{esc(e['text'])}{when}{shots_html(e['screenshots'], media)}</li>")
        out.append("</ul></section>")
    out.append("</main></body></html>")
    return "\n".join(out)


def render_md(data):
    items = data.get("items", [])
    out = [f"# {data.get('title') or 'Screencast feedback'}", ""]
    for i, it in enumerate(items, 1):
        out += [f"## {i}. {it.get('title', '')}", ""]
        fields = [("Kind", it.get("kind")), ("When", ", ".join(as_list(it.get("when"))))]
        out += [f"- **{k}**: {v}" for k, v in fields if v]
        shots = as_list(it.get("screenshots"))
        if shots:
            out.append("- **Screenshots**:")
            out += [f"  - {s}" for s in shots]
        for key, label in [("what_happened", "What happened")]:
            if it.get(key):
                out.append(f"- **{label}**: {it[key]}")
        code = as_list(it.get("code"))
        if code:
            out.append("- **Code**: " + ", ".join(f"`{c}`" for c in code))
        for key, label in [("quote", "Quote"), ("suggested_change", "Suggested change"),
                           ("check", "Check")]:
            if it.get(key):
                out.append(f"- **{label}**: {it[key]}")
        out.append("")
    for key, label in LISTS:
        entries = [norm_entry(e) for e in as_list(data.get(key))]
        if not entries:
            continue
        out += [f"## {label}", ""]
        for e in entries:
            when = f" ({', '.join(e['when'])})" if e["when"] else ""
            out.append(f"- {e['text']}{when}")
            out += [f"  - {s}" for s in e["screenshots"]]
        out.append("")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("feedback", type=Path)
    ap.add_argument("--html-dir", type=Path)
    args = ap.parse_args()
    data = json.loads(args.feedback.read_text())
    html_dir = (args.html_dir or args.feedback.parent).expanduser()
    html_dir.mkdir(parents=True, exist_ok=True)
    media_dir = html_dir / "report-media"
    if media_dir.exists():
        shutil.rmtree(media_dir)
    md_path = args.feedback.parent / "feedback.md"
    md_path.write_text(render_md(data))
    html_path = html_dir / "report.html"
    html_path.write_text(render_html(data, Media(html_dir)))
    print(md_path)
    print(html_path)


if __name__ == "__main__":
    main()
