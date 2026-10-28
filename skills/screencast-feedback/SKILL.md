---
name: screencast-feedback
description: Use when the user shares a screen recording or screencast (.mp4, .mov, .webm, such as a CleanShot or QuickTime recording) of someone using an app, site, or design while talking through it, and wants it turned into feedback, issues, a to-do list, or a transcript with screenshots.
argument-hint: <path to video>
---

# Screencast feedback

Turn a narrated screen recording into a list of feedback items someone can act on.
Each item says what to change, quotes what was said, and points to the screenshot
of what was on screen at that moment.

The person recording is usually thinking out loud: they try something, react, change
their mind, and move on. The transcript alone loses what they were looking at ("this
should be a back button"), and the screenshots alone lose why it mattered. The work is
pairing the two and keeping only what they meant.

## 1. Extract

```bash
python3 ~/.claude/skills/screencast-feedback/extract.py "<video>"
```

Run it in the background. Transcription uses the local Whisper `turbo` model and takes
about as long as the recording, or a little longer. Nothing leaves the machine. Pass
`--language en` when you know the language, `--out <dir>` to choose where output goes
(default `/tmp/screencast-feedback/<video name>/`), and `--no-transcript` for a silent
recording.

It needs `ffmpeg` and the `whisper` CLI (`brew install ffmpeg openai-whisper`). If
either is missing, say which and stop.

The script writes:

- `timeline.md`: one section per screenshot, each followed by what was said until the
  next screenshot. Read this first.
- `frames/`: JPEG screenshots, named by position and time (`014-01m21s.jpg`).
- `transcript.txt`: the transcript alone, one timestamped phrase per line.
- `manifest.json` and `transcript.json`: the same data as JSON.

Screenshots are taken once the screen settles after a change and partway into each
spoken phrase, then dropped when nothing visible changed. A three-minute recording
gives about 30.

## 2. Read

Read `timeline.md` in full, then open every screenshot. The ones beside a remark show
what it is about. The ones with no speech show what the person clicked and where they
went, which is often what a later remark or retraction refers to.

While reading, keep in mind:

- **The transcript is approximate.** Whisper mishears product names and labels. Use
  the screenshot to fix them: "lot a" on a screen showing "Parking Lot A" is
  "Parking Lot A". Quote the corrected words, and keep the original only when the
  correction is a guess.
- **People retract.** "Actually, no, I don't want to change that" cancels the remark
  before it. "Well, no, I guess that's fine" does too. Drop retracted items. When you
  can't tell which remark a retraction cancels, keep the item and say so in **Check**.
- **Sentences span screenshots.** A remark that starts under one screenshot can finish
  under the next. Read across the boundary.
- **The screen shows what words leave out.** "This", "here", and "it" point at
  whatever the cursor is on or what just changed. Name the element in the item.
- **People read the screen aloud.** A label they read ("Back to asking") can land in
  the transcript glued to the end of the previous sentence. Match it to the screen.
- **Typed text is only in the screenshots.** Read search queries and form input off the
  screen when they matter to the remark.

## 3. Write the feedback

Write `feedback.md` in the output directory. One item is one change. Merge remarks
that ask for the same change, even when they are minutes apart, and split a remark
that asks for two ("this should be a back button, and the map is zoomed wrong"). Two
remarks on a similar topic about different screens, such as the loading state of the
app and of a panel, are two items. For each item:

- **Title**: the change, as an instruction ("Replace 'Back to asking' with a back
  button"). For a question the person could not answer, phrase it as the question.
- **Kind**: bug, usability, visual design, missing feature, or question.
- **When**: the timestamp or timestamps, as `mm:ss`.
- **Screenshots**: absolute paths, best first. Add a before and an after when the
  remark is about what a click did.
- **What happened**: one or two sentences on what was on screen and what the person did.
- **Code** (only when you are in the product's repository): the files and lines that
  render what the remark is about, as `path:line`.
- **Quote**: their words, with the corrections above, capitals and punctuation added,
  and filler ("um", repeated false starts) removed. Join remarks that are apart in time
  with "...".
- **Suggested change**: what they asked for. If they named a problem but no fix, say
  so, and label any suggestion of your own as yours.
- **Check** (only when needed): what to confirm with the person before acting, such
  as an ambiguous retraction.

A retraction cancels the whole remark it follows, every sentence of it, not only the
last one. When it could cancel either of two remarks, keep both and say so in **Check**.

After the items, add up to three short lists:

- **Keep**: things the person praised ("nice that clicking on a location takes me to
  that location on the map"), so nobody changes them by accident.
- **Unclear**: remarks you could not tie to the screen or could not interpret, and
  retractions you acted on, each with its timestamp.
- **Also on screen**: problems visible in the screenshots that the person did not
  mention, such as garbled text. These are yours, not theirs, so they never become
  items.

Order items by how much they get in the way of someone using the product: first
anything that stops them from finishing what they came to do, then anything that
confuses them, then visual polish, then open questions. Do not turn your own
observations into items.

## 4. Present

When `bb impromptu-ui help` succeeds, load the `impromptu-ui` skill and publish one
card per item under the key `screencast-feedback`. Use ordinary cards, not visual
review cards: a visual review shows images but replaces the buttons. Each card's
summary opens with the change, then the quote and timestamp. Its details give the
screenshot paths as text, and the `path:line` references when there are any.

Its draft is the item written as an issue body, following the `draft-issue-description`
skill. Its buttons are:

- **Create issue**: a `message` action that drafts the issue in `~/projects/drafts/`
  for the user to confirm before it is filed. Its text says to crop each screenshot
  before attaching it (below).
- **Fix in a thread**: a `thread` action in the bb project that holds the product's
  code, on its default branch. Its prompt names the change, quotes the person, and
  gives the screenshot paths. When you can't tell which project that is, leave the
  button off and say so in chat.

In chat, say how many items there are and where `feedback.md` is.

Without Impromptu UI, print the items in chat with their screenshot links.

The recording and the extracted screenshots can show private data such as bookmarks,
other tabs, and notifications. Keep them in `/tmp` and do not commit or attach them
anywhere unless the user asks.

## Crop screenshots before they go into an issue

Before an issue draft attaches a screenshot, crop out the browser's tab strip, address
bar, and bookmarks bar, which show the user's other tabs and bookmarks. Open the
screenshot, find the first row of the page itself, and crop from there down. Save the
crop beside the draft, in `~/projects/drafts/<draft-name>-media/`, and leave the
original in `/tmp` untouched:

```bash
magick <frame>.jpg -crop +0+<top> +repage ~/projects/drafts/<draft-name>-media/<name>.jpg
```

`<top>` is that row's distance from the top of the image, in pixels. Screenshots from
the same recording share a crop, so measure it once. Open the cropped image to check
that the page's own top edge is still there and nothing of the browser is. Use
`magick`, not `sips`, which crops around the center. If the recording is of a
desktop app with no browser around it, crop only what is not part of the app.
