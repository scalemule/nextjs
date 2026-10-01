'use client';
"use client";

// src/components/audio-player.tsx
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react";

// src/components/narration-highlight.ts
var WORD_HIGHLIGHT = "sm-narration-word";
var SENTENCE_HIGHLIGHT = "sm-narration-sentence";
function normalizeWord(raw) {
  return raw.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
var SKIPPED_TAGS = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
function collectDomWords(root) {
  const doc = root.ownerDocument ?? root;
  const walker = doc.createTreeWalker(root, 4, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (parent && SKIPPED_TAGS.has(parent.tagName)) return 2;
      return 1;
    }
  });
  const out = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.data;
    const matcher = /\S+/g;
    for (let m = matcher.exec(text); m; m = matcher.exec(text)) {
      const norm = normalizeWord(m[0]);
      if (norm) {
        out.push({ node, start: m.index, end: m.index + m[0].length, norm });
      }
    }
  }
  return out;
}
function alignWords(timingNorms, domNorms, window2 = 6) {
  const out = new Array(timingNorms.length).fill(-1);
  let j = 0;
  for (let i = 0; i < timingNorms.length; i++) {
    const target = timingNorms[i];
    if (!target) continue;
    let found = -1;
    for (let k = j; k < Math.min(domNorms.length, j + window2); k++) {
      if (domNorms[k] === target) {
        found = k;
        break;
      }
    }
    if (found === -1) {
      continue;
    }
    out[i] = found;
    j = found + 1;
  }
  return out;
}
function wordIndexAt(words, timeMs) {
  let lo = 0;
  let hi = words.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    if (words[mid][1] <= timeMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
function mergeLineBoxes(rects) {
  const lines = [];
  const sorted = rects.filter((r) => r.width > 0 && r.height > 0).sort((a, b) => a.top - b.top || a.left - b.left);
  for (const r of sorted) {
    const center = r.top + r.height / 2;
    const line = lines.find((l) => {
      const lc = l.top + l.height / 2;
      return Math.abs(lc - center) < Math.min(l.height, r.height) / 2;
    });
    if (!line) {
      lines.push({ ...r });
      continue;
    }
    const right = Math.max(line.left + line.width, r.left + r.width);
    const bottom = Math.max(line.top + line.height, r.top + r.height);
    line.left = Math.min(line.left, r.left);
    line.top = Math.min(line.top, r.top);
    line.width = right - line.left;
    line.height = bottom - line.top;
  }
  return lines;
}
function narrationHighlightSupported() {
  return typeof window !== "undefined" && typeof document !== "undefined" && typeof Range !== "undefined" && typeof Range.prototype.getClientRects === "function";
}
var PAD_X = 2;
var PAD_Y = 1;
var NarrationHighlighter = class {
  constructor(root, timings) {
    this.currentWord = -2;
    this.currentSentence = -2;
    this.follow = true;
    this.detachUserScroll = null;
    this.layer = null;
    this.sentenceLayer = null;
    this.wordLayer = null;
    this.restoreRootStyle = null;
    this.resizeObserver = null;
    this.onWindowResize = null;
    this.root = root;
    this.words = timings.words;
    const domWords = collectDomWords(root);
    const matches = alignWords(
      this.words.map((w) => normalizeWord(w[0])),
      domWords.map((w) => w.norm)
    );
    const doc = root.ownerDocument;
    this.ranges = matches.map((m) => {
      if (m === -1) return null;
      const w = domWords[m];
      try {
        const range = doc.createRange();
        range.setStart(w.node, w.start);
        range.setEnd(w.node, w.end);
        return range;
      } catch {
        return null;
      }
    });
    this.sentenceWords = /* @__PURE__ */ new Map();
    this.words.forEach((w, i) => {
      if (!this.ranges[i]) return;
      const list = this.sentenceWords.get(w[3]);
      if (list) list.push(i);
      else this.sentenceWords.set(w[3], [i]);
    });
    this.reducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.attachUserScroll(doc);
  }
  /** Fraction of narration words found in the article body. A low
   * ratio means the body diverged from the script; callers may prefer
   * to hide the toggle below ~0.5. */
  matchRatio() {
    if (this.ranges.length === 0) return 0;
    return this.ranges.filter(Boolean).length / this.ranges.length;
  }
  attachUserScroll(doc) {
    const stopFollowing = () => {
      this.follow = false;
    };
    const opts = { passive: true };
    doc.addEventListener("wheel", stopFollowing, opts);
    doc.addEventListener("touchmove", stopFollowing, opts);
    this.detachUserScroll = () => {
      doc.removeEventListener("wheel", stopFollowing, opts);
      doc.removeEventListener("touchmove", stopFollowing, opts);
    };
  }
  /** Re-engage auto-scroll (the reader pressed the toggle or sought). */
  resumeFollowing() {
    this.follow = true;
    this.currentSentence = -2;
  }
  /** Lazily creates the overlay layer behind the article text. */
  ensureLayer() {
    if (this.layer) return true;
    const root = this.root;
    const doc = root.ownerDocument;
    if (!doc || typeof root.style === "undefined") return false;
    const view = doc.defaultView;
    const computed = view?.getComputedStyle(root);
    const previous = { position: root.style.position, isolation: root.style.isolation };
    if (!computed || computed.position === "static") root.style.position = "relative";
    root.style.isolation = "isolate";
    this.restoreRootStyle = () => {
      root.style.position = previous.position;
      root.style.isolation = previous.isolation;
    };
    const make = () => {
      const el = doc.createElement("div");
      el.style.position = "absolute";
      el.style.inset = "0";
      el.style.pointerEvents = "none";
      return el;
    };
    this.layer = make();
    this.layer.setAttribute("aria-hidden", "true");
    this.layer.setAttribute("data-sm-narration-layer", "");
    this.layer.style.zIndex = "-1";
    this.sentenceLayer = make();
    this.wordLayer = make();
    this.layer.append(this.sentenceLayer, this.wordLayer);
    root.prepend(this.layer);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.repaint());
      this.resizeObserver.observe(root);
    }
    if (view) {
      this.onWindowResize = () => this.repaint();
      view.addEventListener("resize", this.onWindowResize, { passive: true });
    }
    return true;
  }
  /** Line boxes for the given word indexes, in layer coordinates. */
  boxesFor(wordIndexes) {
    const root = this.root;
    const origin = root.getBoundingClientRect();
    const rects = [];
    for (const i of wordIndexes) {
      const range = this.ranges[i];
      if (!range || typeof range.getClientRects !== "function") continue;
      for (const r of Array.from(range.getClientRects())) {
        rects.push({
          left: r.left - origin.left - root.clientLeft + root.scrollLeft,
          top: r.top - origin.top - root.clientTop + root.scrollTop,
          width: r.width,
          height: r.height
        });
      }
    }
    return mergeLineBoxes(rects);
  }
  paint(target, boxes, kind) {
    if (!target) return;
    const doc = target.ownerDocument;
    const color = kind === "word" ? "var(--sm-narration-word, rgba(36, 99, 70, 0.32))" : "var(--sm-narration-sentence, rgba(36, 99, 70, 0.12))";
    const nodes = boxes.map((b) => {
      const el = doc.createElement("div");
      el.setAttribute("data-sm-narration", kind);
      el.className = kind === "word" ? WORD_HIGHLIGHT : SENTENCE_HIGHLIGHT;
      el.style.position = "absolute";
      el.style.left = `${b.left - PAD_X}px`;
      el.style.top = `${b.top - PAD_Y}px`;
      el.style.width = `${b.width + PAD_X * 2}px`;
      el.style.height = `${b.height + PAD_Y * 2}px`;
      el.style.borderRadius = "4px";
      el.style.background = color;
      return el;
    });
    target.replaceChildren(...nodes);
  }
  /** Re-lays out the current highlight (after resize / reflow). */
  repaint() {
    if (this.currentWord < 0) return;
    const sentence = this.words[this.currentWord]?.[3];
    this.paint(this.sentenceLayer, this.boxesFor(this.sentenceWords.get(sentence) ?? []), "sentence");
    this.paint(this.wordLayer, this.boxesFor([this.currentWord]), "word");
  }
  update(timeMs) {
    if (!narrationHighlightSupported()) return;
    const idx = wordIndexAt(this.words, timeMs);
    if (idx === this.currentWord) return;
    this.currentWord = idx;
    if (idx < 0) {
      this.clear();
      return;
    }
    if (!this.ensureLayer()) return;
    this.paint(this.wordLayer, this.ranges[idx] ? this.boxesFor([idx]) : [], "word");
    const sentence = this.words[idx][3];
    if (sentence !== this.currentSentence) {
      this.currentSentence = sentence;
      const members = this.sentenceWords.get(sentence) ?? [];
      this.paint(this.sentenceLayer, this.boxesFor(members), "sentence");
      const first = members.length ? this.ranges[members[0]] : null;
      if (first) this.scrollTo(first);
    }
  }
  scrollTo(range) {
    if (!this.follow) return;
    try {
      const rect = range.getBoundingClientRect();
      const viewport = window.innerHeight || 0;
      if (rect.top < viewport * 0.15 || rect.bottom > viewport * 0.7) {
        const target = window.scrollY + rect.top - viewport * 0.3;
        window.scrollTo({ top: target, behavior: this.reducedMotion ? "auto" : "smooth" });
      }
    } catch {
    }
  }
  clear() {
    this.sentenceLayer?.replaceChildren();
    this.wordLayer?.replaceChildren();
    this.currentWord = -2;
    this.currentSentence = -2;
  }
  destroy() {
    this.clear();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.onWindowResize) {
      this.root.ownerDocument?.defaultView?.removeEventListener("resize", this.onWindowResize);
      this.onWindowResize = null;
    }
    this.layer?.remove();
    this.layer = this.sentenceLayer = this.wordLayer = null;
    this.restoreRootStyle?.();
    this.restoreRootStyle = null;
    this.detachUserScroll?.();
    this.detachUserScroll = null;
  }
};
function parseTimingsPayload(body) {
  const candidate = body?.timings ?? body?.data?.timings ?? body;
  const t = candidate;
  if (!t || t.version !== 1 || !Array.isArray(t.words) || t.words.length === 0) return null;
  const valid = t.words.every(
    (w) => Array.isArray(w) && w.length === 4 && typeof w[0] === "string" && typeof w[1] === "number" && typeof w[2] === "number" && typeof w[3] === "number"
  );
  return valid ? t : null;
}

// src/components/audio-player.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var subscribeNever = () => () => {
};
var SPEEDS = [1, 1.25, 1.5, 2, 3];
var PLAY_EVENT = "scalemule:audio:play";
var HIGHLIGHT_PREF_KEY = "scalemule:audio:highlight";
var positive = (n) => n != null && Number.isFinite(n) && n > 0 ? n : 0;
var durationOf = (audio) => positive(audio.duration_ms) / 1e3;
function time(seconds) {
  const s = Math.floor(positive(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function AudioPlayer(props) {
  if (!props.audio.url) return null;
  return /* @__PURE__ */ jsx(PlayerSession, { ...props }, props.audioKey ?? props.audio.url);
}
function PlayerSession({
  audio,
  variant = "waveform",
  label,
  className,
  style,
  preload = "none",
  onRefresh,
  onPlaybackError,
  playbackRateStorageKey = "scalemule:audio:playback-rate",
  exclusivePlayback = true,
  narration
}) {
  const media = useRef(null);
  const alive = useRef(true);
  const request = useRef(null);
  const triedRefresh = useRef(false);
  const intent = useRef(false);
  const resume = useRef(null);
  const [source, setSource] = useState(audio);
  const [duration, setDuration] = useState(durationOf(audio));
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [pendingPlay, setPendingPlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const sliderId = useId();
  const labelId = useId();
  const rate = useRef(1);
  const highlightSupported = useSyncExternalStore(
    subscribeNever,
    narrationHighlightSupported,
    // The server can't detect support; render the toggle only after
    // hydration so server and client markup always match.
    () => false
  );
  const narrationOffered = !!narration && audio.has_word_timings !== false && highlightSupported;
  const [highlightOn, setHighlightOn] = useState(false);
  const [highlightBusy, setHighlightBusy] = useState(false);
  const highlighter = useRef(null);
  const highlightAbort = useRef(null);
  useEffect(() => {
    if (!narrationOffered) return;
    try {
      if (window.localStorage.getItem(HIGHLIGHT_PREF_KEY) === "1") {
        void enableHighlight(false);
      }
    } catch {
    }
  }, [narrationOffered]);
  useEffect(() => {
    return () => {
      highlightAbort.current?.abort();
      highlighter.current?.destroy();
      highlighter.current = null;
    };
  }, []);
  async function enableHighlight(persist) {
    if (!narration) return;
    if (persist) {
      try {
        window.localStorage.setItem(HIGHLIGHT_PREF_KEY, "1");
      } catch {
      }
    }
    if (highlighter.current) {
      highlighter.current.resumeFollowing();
      setHighlightOn(true);
      return;
    }
    if (highlightBusy) return;
    const controller = new AbortController();
    highlightAbort.current = controller;
    setHighlightBusy(true);
    try {
      const resp = await fetch(narration.timingsUrl, { signal: controller.signal });
      if (!resp.ok) throw new Error(`timings ${resp.status}`);
      const timings = parseTimingsPayload(await resp.json());
      const target = document.getElementById(narration.targetId);
      if (!timings || !target) throw new Error("timings or target missing");
      const instance = new NarrationHighlighter(target, timings);
      if (instance.matchRatio() < 0.5) {
        instance.destroy();
        throw new Error("article text does not match narration");
      }
      highlighter.current = instance;
      setHighlightOn(true);
      const element = media.current;
      if (element) instance.update(element.currentTime * 1e3);
    } catch {
      setHighlightOn(false);
    } finally {
      if (highlightAbort.current === controller) highlightAbort.current = null;
      setHighlightBusy(false);
    }
  }
  function disableHighlight() {
    try {
      window.localStorage.setItem(HIGHLIGHT_PREF_KEY, "0");
    } catch {
    }
    highlightAbort.current?.abort();
    highlighter.current?.clear();
    setHighlightOn(false);
  }
  useEffect(() => {
    if (!highlightOn || !highlighter.current) return;
    const element = media.current;
    if (!element) return;
    if (!playing) {
      highlighter.current.update(element.currentTime * 1e3);
      return;
    }
    let frame = 0;
    const tick = () => {
      highlighter.current?.update(element.currentTime * 1e3);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [highlightOn, playing, position]);
  useEffect(() => {
    alive.current = true;
    const element = media.current;
    return () => {
      alive.current = false;
      intent.current = false;
      request.current?.abort();
      element?.pause();
    };
  }, []);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    resume.current = media.current?.currentTime ?? 0;
    setSource(audio);
    setDuration(durationOf(audio));
  }, [audio.url, audio.expires_at, audio.duration_ms]);
  useEffect(() => {
    if (!playbackRateStorageKey) return;
    try {
      const saved = Number(window.localStorage.getItem(playbackRateStorageKey));
      if (SPEEDS.includes(saved)) {
        setSpeed(saved);
        rate.current = saved;
      }
    } catch {
    }
  }, [playbackRateStorageKey]);
  useEffect(() => {
    if (media.current) {
      media.current.playbackRate = speed;
      media.current.preservesPitch = true;
    }
  }, [speed, source.url]);
  useEffect(() => {
    if (!exclusivePlayback) return;
    const stop = (event) => {
      if (event.detail !== media.current) {
        intent.current = false;
        setPendingPlay(false);
        media.current?.pause();
      }
    };
    document.addEventListener(PLAY_EVENT, stop);
    return () => document.removeEventListener(PLAY_EVENT, stop);
  }, [exclusivePlayback]);
  function fail() {
    if (!alive.current) return;
    intent.current = false;
    setPendingPlay(false);
    setPlaying(false);
    setBusy(false);
    setError("Audio could not be played. Try again.");
    onPlaybackError?.();
  }
  async function play() {
    const element = media.current;
    if (!element || !intent.current) return;
    try {
      await element.play();
    } catch (e) {
      if (!alive.current || !intent.current) return;
      if (e.name === "NotAllowedError") {
        fail();
        return;
      }
      await recover();
    }
  }
  async function recover(manual = false) {
    if (!alive.current || request.current) return;
    if (!onRefresh || !manual && triedRefresh.current) {
      fail();
      return;
    }
    triedRefresh.current = true;
    const controller = new AbortController();
    request.current = controller;
    resume.current = media.current?.currentTime ?? position;
    setBusy(true);
    setError(null);
    try {
      const fresh = await onRefresh(controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      if (!fresh.url) throw new Error("No audio URL");
      setDuration(durationOf(fresh) || duration);
      if (fresh.url === source.url) {
        media.current?.load();
      } else {
        setSource(fresh);
      }
    } catch {
      if (!controller.signal.aborted) fail();
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (alive.current) setBusy(false);
      }
    }
  }
  function toggle() {
    if (intent.current || playing) {
      intent.current = false;
      setPendingPlay(false);
      media.current?.pause();
      return;
    }
    intent.current = true;
    setPendingPlay(true);
    triedRefresh.current = false;
    setError(null);
    if (exclusivePlayback)
      document.dispatchEvent(
        new CustomEvent(PLAY_EVENT, { detail: media.current })
      );
    if (request.current) return;
    const expiry = Date.parse(source.expires_at ?? "");
    if (onRefresh && Number.isFinite(expiry) && expiry - Date.now() <= 6e4) {
      void recover();
    } else {
      void play();
    }
  }
  function seek(value) {
    if (!media.current || !duration || !Number.isFinite(value)) return;
    const target = Math.max(0, Math.min(duration, value));
    try {
      media.current.currentTime = target;
      resume.current = target;
      setPosition(target);
      highlighter.current?.resumeFollowing();
    } catch {
    }
  }
  function changeSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(rate.current) + 1) % SPEEDS.length];
    rate.current = next;
    setSpeed(next);
    if (playbackRateStorageKey) {
      try {
        window.localStorage.setItem(playbackRateStorageKey, String(next));
      } catch {
      }
    }
  }
  const peaks = useMemo(() => {
    const input = source.waveform_peaks;
    if (!input?.length) return [];
    const count = Math.min(64, input.length);
    return Array.from({ length: count }, (_, i) => {
      const value = input[Math.floor(i * input.length / count)];
      return Number.isFinite(value) ? Math.min(1, Math.max(0.08, Math.abs(value))) : 0.08;
    });
  }, [source.waveform_peaks]);
  const mediaPreload = durationOf(source) > 0 ? preload : "metadata";
  const current = Math.min(positive(position), duration || Infinity);
  const progress = duration ? Math.max(0, Math.min(100, current / duration * 100)) : 0;
  const remaining = duration ? `${time((duration - current) / speed)} remaining` : "Duration available when played";
  const title = label ?? (source.ai_generated === false ? "Listen to narration" : "Listen to AI narration");
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `sm-audio sm-audio--${variant}${className ? ` ${className}` : ""}`,
      style,
      role: "group",
      "aria-labelledby": labelId,
      "data-audio-variant": variant,
      children: [
        /* @__PURE__ */ jsx(
          "audio",
          {
            ref: media,
            src: source.url ?? void 0,
            preload: mediaPreload,
            onLoadedMetadata: (e) => {
              const element = e.currentTarget;
              const total = positive(element.duration) || durationOf(source);
              setDuration(total);
              element.playbackRate = rate.current;
              element.preservesPitch = true;
              if (resume.current != null) {
                try {
                  element.currentTime = Math.min(
                    resume.current,
                    total || resume.current
                  );
                } catch {
                }
                resume.current = null;
              }
              setPosition(positive(element.currentTime));
              if (intent.current) void play();
            },
            onDurationChange: (e) => {
              const d = positive(e.currentTarget.duration);
              if (d) setDuration(d);
            },
            onTimeUpdate: (e) => {
              if (e.currentTarget.readyState === 0 && resume.current != null) return;
              setPosition(positive(e.currentTarget.currentTime));
            },
            onPlay: () => {
              intent.current = true;
              setPlaying(true);
              setError(null);
              if (exclusivePlayback)
                document.dispatchEvent(
                  new CustomEvent(PLAY_EVENT, { detail: media.current })
                );
            },
            onPause: () => setPlaying(false),
            onEnded: () => {
              intent.current = false;
              setPendingPlay(false);
              setPlaying(false);
              setPosition(duration);
            },
            onError: () => {
              if (intent.current) void recover();
              else if (!request.current) {
                setError("Audio is unavailable. Press play to retry.");
              }
            }
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "sm-audio__play",
            onClick: toggle,
            "aria-label": playing || busy && pendingPlay ? "Pause narration" : "Play narration",
            children: playing || busy && pendingPlay ? /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M6 4h4v16H6zm8 0h4v16h-4z" }) }) : /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M8 4v16l12-8z" }) })
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "sm-audio__content", children: [
          /* @__PURE__ */ jsx("span", { className: "sm-audio__label", id: labelId, children: title }),
          /* @__PURE__ */ jsxs("div", { className: "sm-audio__times", children: [
            /* @__PURE__ */ jsxs("span", { children: [
              time(current),
              " ",
              /* @__PURE__ */ jsx("span", { className: "sm-audio__elapsed", children: "elapsed" })
            ] }),
            /* @__PURE__ */ jsx("span", { children: remaining })
          ] }),
          variant !== "inline" && /* @__PURE__ */ jsxs(
            "div",
            {
              className: "sm-audio__seek",
              style: { "--sm-audio-progress": `${progress}%` },
              children: [
                variant === "waveform" && peaks.length > 0 && /* @__PURE__ */ jsx("div", { className: "sm-audio__waveform", "aria-hidden": "true", children: peaks.map((peak, i) => /* @__PURE__ */ jsx(
                  "span",
                  {
                    style: {
                      height: `${peak * 100}%`,
                      background: (i + 0.5) / peaks.length * 100 <= progress ? "var(--sm-audio-accent)" : "var(--sm-audio-wave)"
                    }
                  },
                  i
                )) }),
                /* @__PURE__ */ jsx("label", { className: "sm-audio__sr", htmlFor: sliderId, children: "Seek narration" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    id: sliderId,
                    className: "sm-audio__range",
                    type: "range",
                    min: "0",
                    max: duration || 1,
                    step: "0.1",
                    disabled: !duration,
                    value: Math.min(current, duration || 1),
                    "aria-valuetext": `${time(current)} elapsed; ${remaining}`,
                    onChange: (e) => seek(Number(e.currentTarget.value))
                  }
                )
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "sm-audio__actions", children: [
          narrationOffered && /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: `sm-audio__highlight${highlightOn ? " sm-audio__highlight--on" : ""}`,
              "aria-pressed": highlightOn,
              disabled: highlightBusy,
              onClick: () => highlightOn ? disableHighlight() : void enableHighlight(true),
              "aria-label": highlightOn ? "Turn off follow-along highlighting" : "Highlight the text as it is read",
              title: highlightOn ? "Turn off follow-along highlighting" : "Highlight the text as it is read",
              children: /* @__PURE__ */ jsx("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M4 5h16v2.5H4zm0 5.75h16v2.5H4zM4 16.5h9v2.5H4z" }) })
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              className: "sm-audio__speed",
              onClick: changeSpeed,
              "aria-label": `Change playback speed (current ${speed}\xD7)`,
              children: [
                speed,
                "\xD7"
              ]
            }
          )
        ] }),
        (busy || error) && /* @__PURE__ */ jsx("p", { className: "sm-audio__status", role: "status", children: busy ? "Loading audio\u2026" : error })
      ]
    }
  );
}

// src/components/network-audio-player.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect as useEffect2,
  useId as useId2,
  useRef as useRef2,
  useState as useState2,
  useSyncExternalStore as useSyncExternalStore2
} from "react";

// src/network-audio/controller.ts
var EMPTY_SNAPSHOT = {
  queue: [],
  index: -1,
  position: 0,
  duration: 0,
  rate: 1,
  volume: 1,
  status: "idle",
  error: null
};
var trackKey = (track) => JSON.stringify([track.publicationId, track.id]);
var finite = (n) => typeof n === "number" && Number.isFinite(n);
var LISTENING_REWIND_AFTER_MS = 30 * 60 * 1e3;
var LISTENING_QUIET_AFTER_MS = 24 * 60 * 60 * 1e3;
var MAX_HISTORY_AGE_MS = 30 * LISTENING_QUIET_AFTER_MS;
function safeHttpUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}
function validTrack(value) {
  if (!value || typeof value !== "object") return false;
  const t = value;
  return [t.id, t.publicationId, t.title].every((v) => typeof v === "string" && v.length > 0 && v.length <= 1e3) && (t.publicationName === void 0 || typeof t.publicationName === "string" && t.publicationName.length <= 1e3) && safeHttpUrl(t.articleUrl) && (t.durationMs === void 0 || finite(t.durationMs) && t.durationMs > 0 && t.durationMs <= 864e5);
}
var copyTrack = (t) => ({
  id: t.id,
  publicationId: t.publicationId,
  title: t.title,
  ...t.publicationName ? { publicationName: t.publicationName } : {},
  articleUrl: t.articleUrl,
  ...t.durationMs ? { durationMs: t.durationMs } : {}
});
function validProgress(value) {
  if (!value || typeof value !== "object") return false;
  const p = value;
  return validTrack(p.track) && finite(p.position) && p.position >= 0 && p.position <= 86400 && finite(p.duration) && p.duration >= 0 && p.duration <= 86400 && finite(p.updatedAt) && p.updatedAt > 0 && typeof p.completed === "boolean" && (p.revision === void 0 || typeof p.revision === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(p.revision));
}
function validSnapshot(value) {
  if (!value || typeof value !== "object") return false;
  const s = value;
  return Array.isArray(s.queue) && s.queue.length <= 100 && s.queue.every(validTrack) && new Set(s.queue.map(trackKey)).size === s.queue.length && Number.isInteger(s.index) && (s.queue.length ? s.index >= 0 && s.index < s.queue.length : s.index === -1) && finite(s.position) && s.position >= 0 && finite(s.duration) && s.duration >= 0 && finite(s.rate) && s.rate >= 0.5 && s.rate <= 3 && finite(s.volume) && s.volume >= 0 && s.volume <= 1 && ["idle", "loading", "playing", "paused", "error"].includes(s.status) && (s.error === null || typeof s.error === "string" && s.error.length <= 1e3) && (s.history === void 0 || Array.isArray(s.history) && s.history.length <= 100 && s.history.every(validProgress) && new Set(s.history.map((p) => trackKey(p.track))).size === s.history.length) && (s.dismissed === void 0 || typeof s.dismissed === "boolean") && (s.lastPlayedAt === void 0 || finite(s.lastPlayedAt) && s.lastPlayedAt >= 0) && (s.notice === void 0 || s.notice === null || typeof s.notice === "string" && s.notice.length <= 1e3);
}
var NetworkAudioController = class {
  constructor(resolve) {
    this.resolve = resolve;
    this.snapshot = EMPTY_SNAPSHOT;
    this.listeners = /* @__PURE__ */ new Set();
    this.audio = null;
    this.cleanup = null;
    this.request = null;
    this.generation = 0;
    this.intent = false;
    this.source = null;
    this.refreshed = false;
    this.resumePosition = null;
    this.eventListeners = /* @__PURE__ */ new Set();
    this.pendingEvent = null;
    this.getSnapshot = () => this.snapshot;
    this.subscribe = (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    };
    this.subscribeEvents = (listener) => {
      this.eventListeners.add(listener);
      return () => {
        this.eventListeners.delete(listener);
      };
    };
  }
  setResolver(resolve) {
    this.resolve = resolve;
  }
  emit(type) {
    const track = this.snapshot.queue[this.snapshot.index];
    if (!track) return;
    this.eventListeners.forEach((listener) => {
      try {
        listener({ type, track, position: this.snapshot.position });
      } catch {
      }
    });
  }
  progress(track = this.snapshot.queue[this.snapshot.index]) {
    return track && this.snapshot.history?.find((p) => trackKey(p.track) === trackKey(track));
  }
  remember(completed = false) {
    const track = this.snapshot.queue[this.snapshot.index];
    if (!track) return;
    const previous = this.progress(track);
    const revision = this.source?.revision ?? previous?.revision;
    const entry = {
      track: copyTrack(track),
      position: this.snapshot.position,
      duration: this.snapshot.duration,
      updatedAt: Date.now(),
      completed,
      ...revision && /^[a-zA-Z0-9._:-]{1,128}$/.test(revision) ? { revision } : {}
    };
    const history = [entry, ...(this.snapshot.history ?? []).filter((p) => trackKey(p.track) !== trackKey(track) && Date.now() - p.updatedAt < MAX_HISTORY_AGE_MS)].slice(0, 100);
    this.patch({ history, lastPlayedAt: entry.updatedAt });
  }
  /** Capture the live clock before pagehide or a synchronous user navigation. */
  checkpoint() {
    if (this.intent && this.source && this.resumePosition === null && this.audio?.readyState) {
      this.patch({ position: this.audio.currentTime });
      this.remember();
    }
    return this.snapshot;
  }
  dismiss() {
    this.pause();
    this.patch({ dismissed: true });
  }
  show() {
    this.patch({ dismissed: false });
  }
  forgetHistory() {
    this.patch({ history: [] });
  }
  patch(patch) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  attach(audio) {
    this.detach();
    this.audio = audio;
    audio.preload = "metadata";
    audio.playbackRate = this.snapshot.rate;
    audio.volume = this.snapshot.volume;
    const on = (name, fn) => {
      audio.addEventListener(name, fn);
      return () => audio.removeEventListener(name, fn);
    };
    const off = [
      on("loadedmetadata", () => {
        if (!this.source) return;
        const duration = finite(audio.duration) && audio.duration > 0 ? audio.duration : this.snapshot.duration;
        if (this.resumePosition !== null) {
          audio.currentTime = duration > 0 ? Math.min(this.resumePosition, duration) : this.resumePosition;
          this.resumePosition = null;
        }
        audio.playbackRate = this.snapshot.rate;
        this.patch({ duration, position: audio.currentTime });
      }),
      on("durationchange", () => {
        if (this.source && finite(audio.duration) && audio.duration > 0) this.patch({ duration: audio.duration });
      }),
      on("timeupdate", () => {
        if (this.source && this.resumePosition === null && this.intent) {
          this.patch({ position: audio.currentTime });
          this.remember();
        }
      }),
      on("playing", () => {
        if (!this.intent) {
          audio.pause();
          return;
        }
        this.patch({ status: "playing", error: null });
        this.remember();
        if (this.pendingEvent) {
          this.emit(this.pendingEvent);
          this.pendingEvent = null;
        }
        document.dispatchEvent(new CustomEvent("scalemule:audio:play", { detail: audio }));
      }),
      on("pause", () => {
        if (!audio.ended && (this.snapshot.status === "playing" || this.snapshot.status === "loading")) {
          this.checkpoint();
          this.intent = false;
          this.patch({ status: "paused" });
        }
      }),
      on("ended", () => {
        if (!this.intent) return;
        this.patch({ position: this.snapshot.duration });
        this.remember(true);
        this.emit("completed");
        this.intent = false;
        if (this.snapshot.index + 1 < this.snapshot.queue.length) this.select(this.snapshot.index + 1, true);
        else {
          this.intent = false;
          this.patch({ status: "paused", position: this.snapshot.duration });
        }
      }),
      on("error", () => {
        if (this.intent && !this.request) void this.recover();
      }),
      on("waiting", () => {
        if (this.intent) this.patch({ status: "loading" });
      })
    ];
    const exclusive = (event) => {
      if (event.detail !== audio) this.pause();
    };
    document.addEventListener("scalemule:audio:play", exclusive);
    this.cleanup = () => {
      off.forEach((fn) => fn());
      document.removeEventListener("scalemule:audio:play", exclusive);
    };
  }
  detach() {
    this.checkpoint();
    this.generation++;
    this.intent = false;
    this.request?.abort();
    this.request = null;
    this.cleanup?.();
    this.cleanup = null;
    this.audio?.pause();
    this.audio?.removeAttribute("src");
    this.audio = null;
    this.source = null;
  }
  enqueue(track) {
    if (!validTrack(track)) throw new Error("A valid publication, article identity, title and HTTP(S) article URL are required.");
    const found = this.snapshot.queue.findIndex((t) => trackKey(t) === trackKey(track));
    if (found !== -1) {
      const queue2 = this.snapshot.queue.map((item, i) => i === found ? copyTrack(track) : item);
      this.patch({ queue: queue2 });
      return found;
    }
    if (this.snapshot.queue.length >= 100) throw new Error("The listening queue holds up to 100 articles.");
    const queue = [...this.snapshot.queue, copyTrack(track)];
    const saved = this.progress(track);
    this.patch({
      queue,
      index: this.snapshot.index === -1 ? 0 : this.snapshot.index,
      ...this.snapshot.index === -1 ? { position: saved?.position ?? 0, duration: saved?.duration ?? (track.durationMs ?? 0) / 1e3 } : {}
    });
    return queue.length - 1;
  }
  playTrack(track) {
    const index = this.enqueue(track);
    if (index === this.snapshot.index) void this.play();
    else this.select(index);
  }
  select(index, fromBeginning = false) {
    if (!Number.isInteger(index) || index < 0 || index >= this.snapshot.queue.length) return;
    if (index === this.snapshot.index) {
      void this.play();
      return;
    }
    this.checkpoint();
    this.cancel();
    this.source = null;
    const track = this.snapshot.queue[index];
    const saved = this.progress(track);
    this.patch({ index, position: fromBeginning ? 0 : saved?.position ?? 0, duration: saved?.duration ?? (track.durationMs ?? 0) / 1e3, error: null, notice: null, status: "paused" });
    void this.play();
  }
  remove(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.snapshot.queue.length) return;
    const wasPlaying = this.intent;
    const current = this.snapshot.index;
    const queue = this.snapshot.queue.filter((_, i) => i !== index);
    if (index !== current) {
      this.patch({ queue, index: index < current ? current - 1 : current });
      return;
    }
    this.checkpoint();
    this.cancel();
    this.source = null;
    const nextIndex = queue.length ? Math.min(index, queue.length - 1) : -1;
    const saved = this.progress(queue[nextIndex]);
    this.patch({ queue, index: nextIndex, position: saved?.position ?? 0, duration: saved?.duration ?? 0, status: "paused", error: null });
    if (wasPlaying && queue.length) void this.play();
  }
  cancel() {
    this.intent = false;
    this.generation++;
    this.request?.abort();
    this.request = null;
    this.resumePosition = null;
    this.audio?.pause();
  }
  pause() {
    this.checkpoint();
    const pendingPosition = this.resumePosition;
    this.cancel();
    this.resumePosition = pendingPosition;
    this.patch({ status: this.snapshot.queue.length ? "paused" : "idle" });
  }
  clear() {
    this.checkpoint();
    this.cancel();
    this.source = null;
    this.audio?.removeAttribute("src");
    this.patch({
      ...EMPTY_SNAPSHOT,
      history: this.snapshot.history,
      rate: this.snapshot.rate,
      volume: this.snapshot.volume,
      dismissed: false,
      notice: null
    });
  }
  restart(track) {
    if (track) {
      const index = this.enqueue(track);
      if (index !== this.snapshot.index) {
        this.checkpoint();
        this.cancel();
        this.source = null;
        this.patch({ index, duration: (track.durationMs ?? 0) / 1e3 });
      }
    }
    this.seek(0);
    this.remember();
    void this.play();
  }
  playQueue(tracks) {
    if (!tracks.length || tracks.length > 100 || !tracks.every(validTrack) || new Set(tracks.map(trackKey)).size !== tracks.length) throw new Error("Choose between 1 and 100 different articles.");
    this.clear();
    this.patch({ queue: tracks.map(copyTrack), index: 0, position: 0, duration: (tracks[0].durationMs ?? 0) / 1e3 });
    this.remember();
    void this.play();
  }
  seek(position) {
    if (!finite(position)) return;
    const value = Math.max(0, this.snapshot.duration ? Math.min(position, this.snapshot.duration) : position);
    if (this.audio?.readyState && this.source) this.audio.currentTime = value;
    else this.resumePosition = value;
    this.patch({ position: value });
    if (this.source || this.progress()) this.remember();
  }
  setRate(rate) {
    if (!finite(rate) || rate < 0.5 || rate > 3) return;
    if (this.audio) this.audio.playbackRate = rate;
    this.patch({ rate });
  }
  setVolume(volume) {
    if (!finite(volume) || volume < 0 || volume > 1) return;
    if (this.audio) this.audio.volume = volume;
    this.patch({ volume });
  }
  restore(snapshot) {
    if (!validSnapshot(snapshot)) return;
    this.cancel();
    this.source = null;
    this.patch({
      queue: snapshot.queue.map(copyTrack),
      index: snapshot.index,
      position: snapshot.position,
      duration: snapshot.duration,
      rate: snapshot.rate,
      volume: snapshot.volume,
      history: (snapshot.history ?? []).filter((p) => Date.now() - p.updatedAt < MAX_HISTORY_AGE_MS && p.updatedAt <= Date.now() + 6e4).map((p) => ({
        track: copyTrack(p.track),
        position: p.position,
        duration: p.duration,
        updatedAt: p.updatedAt,
        completed: p.completed,
        ...p.revision ? { revision: p.revision } : {}
      })),
      lastPlayedAt: snapshot.lastPlayedAt ?? 0,
      dismissed: snapshot.dismissed ?? false,
      status: snapshot.queue.length ? "paused" : "idle",
      error: null,
      notice: null
    });
    if (this.audio) {
      this.audio.playbackRate = snapshot.rate;
      this.audio.volume = snapshot.volume;
    }
  }
  async play() {
    if (!this.audio || !this.snapshot.queue[this.snapshot.index] || this.request) return;
    if (this.intent && this.snapshot.status === "playing") return;
    const saved = this.progress();
    const stale = !!saved && Date.now() - saved.updatedAt >= LISTENING_REWIND_AFTER_MS;
    if (saved?.completed || this.snapshot.duration > 0 && this.snapshot.position >= this.snapshot.duration) this.seek(0);
    else if (stale && this.snapshot.position > 0) {
      this.seek(Math.max(0, this.snapshot.position - 3));
    }
    this.pendingEvent = this.snapshot.position > 0 ? "resumed" : "started";
    this.intent = true;
    this.refreshed = false;
    this.patch({ error: null, notice: null, dismissed: false });
    const expires = this.source?.expires_at ? Date.parse(this.source.expires_at) : Infinity;
    if (!this.source || stale || expires <= Date.now() + 3e4) await this.load();
    else {
      if (this.snapshot.duration && this.snapshot.position >= this.snapshot.duration) this.seek(0);
      await this.start(this.generation);
    }
  }
  async load() {
    const track = this.snapshot.queue[this.snapshot.index];
    if (!track || !this.audio) return;
    const generation = ++this.generation;
    const request = new AbortController();
    this.request?.abort();
    this.request = request;
    this.patch({ status: "loading", error: null });
    let timeout;
    try {
      const source = await Promise.race([
        this.resolve(track, request.signal),
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            request.abort();
            reject(new Error("Audio request timed out"));
          }, 15e3);
        })
      ]);
      if (generation !== this.generation || request.signal.aborted || !this.audio) return;
      if (!safeHttpUrl(source.url)) throw new Error("No playable audio source");
      const saved = this.progress();
      const changed = !!saved?.revision && !!source.revision && saved.revision !== source.revision && this.snapshot.position > 0;
      this.source = source;
      this.resumePosition = changed ? 0 : this.snapshot.position;
      this.audio.src = source.url;
      this.audio.playbackRate = this.snapshot.rate;
      this.audio.volume = this.snapshot.volume;
      this.patch({ duration: source.duration_ms && source.duration_ms > 0 ? source.duration_ms / 1e3 : 0 });
      this.request = null;
      if (changed) {
        this.intent = false;
        this.patch({ position: 0, status: "paused", notice: "This narration has been updated. Play the updated recording from the beginning." });
        this.remember();
        return;
      }
      await this.start(generation);
    } catch {
      if (generation === this.generation) this.fail("This article could not be loaded. Try playing it again or choose another article.");
    } finally {
      clearTimeout(timeout);
      if (this.request === request) this.request = null;
    }
  }
  async start(generation) {
    if (!this.intent || !this.audio) return;
    try {
      await this.audio.play();
    } catch (error) {
      if (generation !== this.generation || !this.intent) return;
      if (error.name === "NotAllowedError") this.fail("Press Play here to continue listening.");
      else await this.recover();
    }
  }
  async recover() {
    this.checkpoint();
    if (this.refreshed) {
      this.fail("Audio playback stopped. Try playing again or choose another article.");
      return;
    }
    this.refreshed = true;
    await this.load();
  }
  fail(error) {
    this.checkpoint();
    this.intent = false;
    this.audio?.pause();
    this.source = null;
    this.patch({ status: "error", error });
    this.emit("error");
  }
};

// src/network-audio/bridge.ts
var PROTOCOL = "scalemule:network-audio:v1";
function runCommand(controller, command) {
  if (!command || typeof command !== "object") return false;
  const c = command;
  switch (c.action) {
    case "play":
      void controller.play();
      return true;
    case "pause":
      controller.pause();
      return true;
    case "clear":
      controller.clear();
      return true;
    case "restart":
      controller.restart();
      return true;
    case "dismiss":
      controller.dismiss();
      return true;
    case "show":
      controller.show();
      return true;
    case "restartTrack":
      if (!validTrack(c.track)) return false;
      controller.restart(c.track);
      return true;
    case "playQueue":
      if (!Array.isArray(c.tracks) || !c.tracks.every(validTrack)) return false;
      controller.playQueue(c.tracks);
      return true;
    case "enqueue":
    case "playTrack":
      if (!validTrack(c.track)) return false;
      controller[c.action](c.track);
      return true;
    case "select":
    case "remove":
    case "seek":
    case "rate":
    case "volume":
      if (!Number.isFinite(c.value)) return false;
      if (c.action === "rate") controller.setRate(c.value);
      else if (c.action === "volume") controller.setVolume(c.value);
      else controller[c.action](c.value);
      return true;
    default:
      return false;
  }
}
function hostNetworkPlayer(controller, options) {
  const origins = new Set(options.allowedOrigins.map((value) => {
    if (!safeHttpUrl(value) || new URL(value).origin !== value) throw new Error("Use exact HTTP(S) origins for the network player.");
    return value;
  }));
  const reader = window.opener;
  if (!reader) return () => {
  };
  const trackAllowed = (t) => origins.has(new URL(t.articleUrl).origin);
  const send = () => {
    if (reader.closed) return;
    const data = { protocol: PROTOCOL, networkId: options.networkId, kind: "state", snapshot: controller.getSnapshot() };
    origins.forEach((origin) => reader.postMessage(data, origin));
  };
  const receive = (event) => {
    if (event.source !== reader || !origins.has(event.origin)) return;
    const data = event.data;
    if (!data || data.protocol !== PROTOCOL || data.networkId !== options.networkId) return;
    try {
      if (data.kind === "adopt" && validSnapshot(data.snapshot) && data.snapshot.queue.every(trackAllowed) && !controller.getSnapshot().queue.length) {
        controller.restore(data.snapshot);
        if (data.play === true) void controller.play();
      } else if (data.kind === "command") {
        const command = data.command;
        if (command && (command.action === "enqueue" || command.action === "playTrack" || command.action === "restartTrack") && (!validTrack(command.track) || !trackAllowed(command.track))) return;
        if (command?.action === "playQueue" && (!Array.isArray(command.tracks) || !command.tracks.every((t) => validTrack(t) && trackAllowed(t)))) return;
        runCommand(controller, command);
      }
    } catch {
      reader.postMessage({
        protocol: PROTOCOL,
        networkId: options.networkId,
        kind: "error",
        error: "The article could not be added. The queue holds up to 100 articles."
      }, event.origin);
    }
    send();
  };
  window.addEventListener("message", receive);
  const timer = window.setInterval(send, 250);
  send();
  return () => {
    clearInterval(timer);
    window.removeEventListener("message", receive);
  };
}
var NetworkPlayerClient = class {
  constructor(controller, options, update) {
    this.controller = controller;
    this.options = options;
    this.update = update;
    this.target = null;
    this.connected = false;
    this.pending = false;
    this.handoffRequested = false;
    this.openedAt = 0;
    this.lastSeen = 0;
    this.latest = null;
    this.receive = (event) => {
      if (event.origin !== this.origin || !event.source || this.target && event.source !== this.target) return;
      const data = event.data;
      if (!data || data.protocol !== PROTOCOL || data.networkId !== this.options.networkId) return;
      if (data.kind === "error" && this.connected) {
        this.update(this.latest, "The article could not be added. The queue holds up to 100 articles.");
        return;
      }
      if (data.kind !== "state" || !validSnapshot(data.snapshot)) return;
      this.target = event.source;
      this.lastSeen = Date.now();
      if (!this.connected) {
        const local = this.controller.getSnapshot();
        const handoff = this.handoffRequested && !data.snapshot.queue.length && local.queue.length > 0;
        this.controller.pause();
        this.connected = true;
        this.pending = false;
        this.handoffRequested = false;
        if (handoff) this.post({ kind: "adopt", snapshot: local, play: local.status === "playing" || local.status === "loading" });
      }
      this.latest = data.snapshot;
      this.update(data.snapshot, null);
    };
    if (!safeHttpUrl(options.playerUrl)) throw new Error("The network player needs a fully qualified HTTP(S) URL.");
    this.origin = new URL(options.playerUrl).origin;
    window.addEventListener("message", this.receive);
    this.timer = window.setInterval(() => {
      if (this.pending && Date.now() - this.openedAt > 1e4) {
        this.pending = false;
        this.update(null, "The network player did not connect. Playback is still on this page.");
      }
      if (this.connected && this.target?.closed) this.disconnect("The network player closed. Press Play to resume here.");
      else if (this.connected && Date.now() - this.lastSeen > 5e3) {
        this.update(this.latest, "Waiting for the network player. Open its window to check playback.");
      }
    }, 1e3);
  }
  post(data) {
    this.target?.postMessage({ protocol: PROTOCOL, networkId: this.options.networkId, ...data }, this.origin);
  }
  open() {
    if (this.target && !this.target.closed) {
      this.target.focus();
      return;
    }
    this.target = window.open(this.options.playerUrl, "_blank", "popup,width=520,height=720");
    if (!this.target || this.target.closed) {
      this.target = null;
      this.update(null, "Allow the network player window to open, then try again. Playback is still on this page.");
      return;
    }
    this.pending = true;
    this.handoffRequested = true;
    this.openedAt = Date.now();
  }
  command(command) {
    if (this.connected && this.target?.closed) this.disconnect("The network player closed. Press Play to resume here.");
    if (!this.connected || !this.target || this.target.closed) return false;
    this.post({ kind: "command", command });
    return true;
  }
  disconnect(notice) {
    if (this.latest) this.controller.restore(this.latest);
    this.connected = false;
    this.handoffRequested = false;
    this.target = null;
    this.latest = null;
    this.update(null, notice);
  }
  dispose() {
    clearInterval(this.timer);
    window.removeEventListener("message", this.receive);
  }
};

// src/components/network-audio-player.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var Context = createContext(null);
var serverSnapshot = () => EMPTY_SNAPSHOT;
function NetworkAudioProvider({ children, resolveAudio, connection, host, checkpointStorageKey, checkpointStorage = "session", checkpointEnabled = true, onListeningEvent }) {
  if (connection && host) throw new Error("Use connection on reader pages and host on the dedicated player route, not both.");
  const [controller] = useState2(() => new NetworkAudioController(resolveAudio));
  const snapshot = useSyncExternalStore2(controller.subscribe, controller.getSnapshot, serverSnapshot);
  const [remoteSnapshot, setRemoteSnapshot] = useState2(null);
  const [notice, setNotice] = useState2(null);
  const [highlightEnabled, setHighlightEnabled] = useState2(false);
  const [expanded, setExpanded] = useState2(false);
  const metrics = useRef2(onListeningEvent);
  metrics.current = onListeningEvent;
  const client = useRef2(null);
  useEffect2(() => {
    controller.setResolver(resolveAudio);
  }, [controller, resolveAudio]);
  useEffect2(() => controller.subscribeEvents((event) => metrics.current?.(event)), [controller]);
  useEffect2(() => {
    const audio = document.createElement("audio");
    controller.attach(audio);
    const pagehide = () => controller.pause();
    window.addEventListener("pagehide", pagehide);
    return () => {
      window.removeEventListener("pagehide", pagehide);
      controller.detach();
    };
  }, [controller]);
  useEffect2(() => {
    if (!checkpointStorageKey) return;
    const storage = () => checkpointStorage === "local" ? window.localStorage : window.sessionStorage;
    if (!checkpointEnabled) {
      try {
        storage().removeItem(checkpointStorageKey);
      } catch {
      }
      return;
    }
    try {
      const raw = storage().getItem(checkpointStorageKey);
      const data = raw && raw.length < 1e6 ? JSON.parse(raw) : null;
      if (validSnapshot(data) && !controller.getSnapshot().queue.length) {
        const tooOld = !!data.lastPlayedAt && Date.now() - data.lastPlayedAt > 30 * LISTENING_QUIET_AFTER_MS;
        if (tooOld) storage().removeItem(checkpointStorageKey);
        else controller.restore({ ...data, dismissed: data.dismissed || !!data.lastPlayedAt && Date.now() - data.lastPlayedAt >= LISTENING_QUIET_AFTER_MS });
      }
    } catch {
    }
    let lastWrite = 0;
    let saving = false;
    const save = () => {
      if (saving) return;
      saving = true;
      try {
        storage().setItem(checkpointStorageKey, JSON.stringify(controller.checkpoint()));
      } catch {
      } finally {
        saving = false;
        lastWrite = Date.now();
      }
    };
    let previous = controller.getSnapshot();
    const unsubscribe = controller.subscribe(() => {
      const next = controller.getSnapshot();
      const urgent = next.status !== previous.status && next.status !== "playing" || next.dismissed !== previous.dismissed || next.queue !== previous.queue || next.rate !== previous.rate || next.volume !== previous.volume;
      previous = next;
      if (urgent || Date.now() - lastWrite > 1e3) save();
    });
    const visibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    const pagehide = () => save();
    window.addEventListener("pagehide", pagehide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      save();
      unsubscribe();
      window.removeEventListener("pagehide", pagehide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [controller, checkpointStorageKey, checkpointStorage, checkpointEnabled]);
  const allowedOrigins = JSON.stringify(host?.allowedOrigins ?? []);
  useEffect2(() => {
    if (!host) return;
    return hostNetworkPlayer(controller, { networkId: host.networkId, allowedOrigins: JSON.parse(allowedOrigins) });
  }, [controller, host?.networkId, allowedOrigins]);
  useEffect2(() => {
    if (!connection) return;
    const instance = new NetworkPlayerClient(controller, connection, (state, message) => {
      setRemoteSnapshot(state);
      setNotice(message);
    });
    client.current = instance;
    return () => {
      instance.dispose();
      client.current = null;
    };
  }, [controller, connection?.playerUrl, connection?.networkId]);
  const command = useCallback((value) => {
    setNotice(null);
    try {
      if (!client.current?.command(value)) runCommand(controller, value);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The article could not be added.");
    }
  }, [controller]);
  const openNetworkPlayer = useCallback(() => client.current?.open(), []);
  const openPlayer = useCallback(() => {
    command({ action: "show" });
    setExpanded(true);
  }, [command]);
  const activeSnapshot = remoteSnapshot ?? snapshot;
  return /* @__PURE__ */ jsxs2(Context.Provider, { value: {
    snapshot: activeSnapshot,
    remote: remoteSnapshot !== null,
    hosted: !!host,
    notice,
    command,
    openNetworkPlayer: connection ? openNetworkPlayer : void 0,
    highlightEnabled,
    setHighlightEnabled,
    expanded,
    setExpanded,
    openPlayer
  }, children: [
    /* @__PURE__ */ jsx2(NetworkMediaSession, {}),
    children
  ] });
}
function useNetworkAudio() {
  const context = useContext(Context);
  if (!context) throw new Error("Mount NetworkAudioProvider above the player and article controls.");
  return context;
}
function NetworkMediaSession() {
  const { snapshot, remote, command } = useNetworkAudio();
  const track = snapshot.queue[snapshot.index];
  const position = useRef2(snapshot.position);
  position.current = snapshot.position;
  useEffect2(() => {
    if (remote || !track || !("mediaSession" in navigator)) return;
    const mediaSession = navigator.mediaSession;
    if (typeof MediaMetadata !== "undefined") mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.publicationName ?? "" });
    const handlers = [
      ["play", () => command({ action: "play" })],
      ["pause", () => command({ action: "pause" })],
      ["seekto", (details) => {
        if (details.seekTime != null) command({ action: "seek", value: details.seekTime });
      }],
      ["seekbackward", (details) => command({ action: "seek", value: position.current - (details.seekOffset ?? 10) })],
      ["seekforward", (details) => command({ action: "seek", value: position.current + (details.seekOffset ?? 10) })],
      ["stop", () => command({ action: "dismiss" })],
      ...snapshot.index + 1 < snapshot.queue.length ? [["nexttrack", () => command({ action: "select", value: snapshot.index + 1 })]] : []
    ];
    handlers.forEach(([action, handler]) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
      }
    });
    return () => {
      handlers.forEach(([action]) => {
        try {
          mediaSession.setActionHandler(action, null);
        } catch {
        }
      });
      mediaSession.metadata = null;
      mediaSession.playbackState = "none";
    };
  }, [remote, track, command, snapshot.index, snapshot.queue.length]);
  useEffect2(() => {
    if (remote || !track || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = snapshot.status === "playing" ? "playing" : "paused";
    if (snapshot.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: snapshot.duration,
          playbackRate: snapshot.rate,
          position: Math.min(snapshot.position, snapshot.duration)
        });
      } catch {
      }
    }
  }, [remote, track, snapshot.status, snapshot.position, snapshot.duration, snapshot.rate]);
  return null;
}
var subscribeCapabilities = () => () => {
};
function useArticleNarration(track, narration) {
  const { snapshot, highlightEnabled, setHighlightEnabled } = useNetworkAudio();
  const supported = useSyncExternalStore2(subscribeCapabilities, narrationHighlightSupported, () => false);
  const active = snapshot.queue[snapshot.index];
  const matching = !!active && trackKey(active) === trackKey(track);
  const clock = useRef2({ snapshot, received: 0 });
  useEffect2(() => {
    clock.current = { snapshot, received: performance.now() };
  }, [snapshot]);
  useEffect2(() => {
    if (!narration || !matching || !highlightEnabled || !supported) return;
    const controller = new AbortController();
    let highlighter = null;
    let frame = 0;
    const render = () => {
      const { snapshot: current, received } = clock.current;
      const elapsed = current.status === "playing" ? Math.min((performance.now() - received) / 1e3, 0.5) * current.rate : 0;
      highlighter?.update((current.position + elapsed) * 1e3);
      frame = requestAnimationFrame(render);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState === "hidden") highlighter?.clear();
      else if (highlighter) frame = requestAnimationFrame(render);
    };
    const timeout = setTimeout(() => controller.abort(), 15e3);
    void (async () => {
      try {
        const response = await fetch(narration.timingsUrl, { signal: controller.signal });
        if (!response.ok) return;
        const timings = parseTimingsPayload(await response.json());
        const target = document.getElementById(narration.targetId);
        if (controller.signal.aborted || !timings || !target) return;
        highlighter = new NarrationHighlighter(target, timings);
        if (highlighter.matchRatio() < 0.5) {
          highlighter.destroy();
          highlighter = null;
          return;
        }
        visibility();
      } catch {
      } finally {
        clearTimeout(timeout);
      }
    })();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      controller.abort();
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
      highlighter?.destroy();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [matching, highlightEnabled, supported, narration?.targetId, narration?.timingsUrl, track.id, track.publicationId]);
  return { highlightAvailable: !!narration && supported, highlightEnabled, setHighlightEnabled, matching };
}
function ArticleAudioControls({ track, narration, className = "" }) {
  const { snapshot, command } = useNetworkAudio();
  const { highlightAvailable, highlightEnabled, setHighlightEnabled, matching } = useArticleNarration(track, narration);
  const playing = matching && (snapshot.status === "playing" || snapshot.status === "loading");
  const queued = snapshot.queue.some((item) => trackKey(item) === trackKey(track));
  const saved = snapshot.history?.find((p) => trackKey(p.track) === trackKey(track));
  const position = matching ? snapshot.position : saved?.position ?? 0;
  const duration = matching ? snapshot.duration || (track.durationMs ?? 0) / 1e3 : saved?.duration || (track.durationMs ?? 0) / 1e3;
  const completed = saved?.completed || duration > 0 && position >= duration;
  const remaining = Math.max(0, duration - position) / snapshot.rate;
  const label = playing ? "Pause article" : completed ? "Listen again" : position > 0 ? "Resume" : "Listen";
  return /* @__PURE__ */ jsxs2("div", { className: `sm-network-article ${className}`, "aria-label": "Article audio", children: [
    /* @__PURE__ */ jsxs2("button", { type: "button", onClick: () => command(playing ? { action: "pause" } : { action: "playTrack", track }), children: [
      label,
      !playing && duration > 0 ? ` \xB7 ${listeningTime(completed ? duration / snapshot.rate : remaining)}${position > 0 && !completed ? " left" : ""}` : ""
    ] }),
    !playing && position > 0 && !completed && /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => command({ action: "restartTrack", track }), children: "Start over" }),
    /* @__PURE__ */ jsx2("button", { type: "button", disabled: queued, onClick: () => command({ action: "enqueue", track }), children: queued ? "In your queue" : "Add to queue" }),
    highlightAvailable && /* @__PURE__ */ jsx2("button", { type: "button", "aria-pressed": highlightEnabled, onClick: () => setHighlightEnabled(!highlightEnabled), children: "Highlight words" })
  ] });
}
var formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
function listeningTime(seconds) {
  const rounded = Math.ceil(seconds);
  return rounded < 60 ? `${rounded} sec` : `${Math.floor(rounded / 60)} min${rounded % 60 ? ` ${rounded % 60} sec` : ""}`;
}
function ListeningInvitation() {
  const { snapshot, command, openPlayer } = useNetworkAudio();
  const track = snapshot.queue[snapshot.index];
  if (!track || !snapshot.dismissed) return null;
  const completed = snapshot.history?.find((p) => trackKey(p.track) === trackKey(track))?.completed;
  return /* @__PURE__ */ jsxs2("section", { className: "sm-listening-invitation", "aria-label": "Saved listening", children: [
    /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsx2("strong", { children: completed ? "Listen again" : "Continue listening" }),
      /* @__PURE__ */ jsx2("p", { children: track.title }),
      /* @__PURE__ */ jsx2("small", { children: snapshot.duration > 0 && !completed ? `${listeningTime(Math.max(0, snapshot.duration - snapshot.position) / snapshot.rate)} left` : track.publicationName })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "sm-listening-actions", children: [
      /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => command({ action: "play" }), children: completed ? "Listen again" : "Resume" }),
      !completed && snapshot.position > 0 && /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => command({ action: "restart" }), children: "Start over" }),
      /* @__PURE__ */ jsx2("button", { type: "button", onClick: openPlayer, children: "View queue" })
    ] })
  ] });
}
function ListeningPlaylist({ tracks, title = "Listen to today\u2019s stories", renderArticleLink }) {
  const { command, snapshot } = useNetworkAudio();
  const id = useId2();
  if (!tracks.length) return null;
  const knownDuration = tracks.every((track) => !!track.durationMs);
  const seconds = tracks.reduce((sum, track) => sum + (track.durationMs ?? 0) / 1e3, 0) / snapshot.rate;
  return /* @__PURE__ */ jsxs2("section", { className: "sm-listening-playlist", "aria-labelledby": id, children: [
    /* @__PURE__ */ jsxs2("div", { className: "sm-listening-playlist__heading", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx2("h2", { id, children: title }),
        /* @__PURE__ */ jsxs2("p", { children: [
          tracks.length,
          " ",
          tracks.length === 1 ? "story" : "stories",
          knownDuration ? ` \xB7 ${listeningTime(seconds)}` : "",
          snapshot.rate !== 1 ? ` at ${snapshot.rate}\xD7` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => command({ action: "playQueue", tracks }), children: "Play stories" })
    ] }),
    /* @__PURE__ */ jsx2("ol", { children: tracks.map((track) => /* @__PURE__ */ jsxs2("li", { children: [
      renderArticleLink ? renderArticleLink(track) : /* @__PURE__ */ jsx2("a", { href: track.articleUrl, children: track.title }),
      track.durationMs && /* @__PURE__ */ jsx2("span", { children: listeningTime(track.durationMs / 1e3 / snapshot.rate) })
    ] }, trackKey(track))) }),
    /* @__PURE__ */ jsxs2("small", { children: [
      "Plays these stories in order, then stops.",
      snapshot.queue.length > 0 ? " Play stories replaces your queue; your listening progress is kept." : ""
    ] })
  ] });
}
function ListeningLibrary({ renderArticleLink } = {}) {
  const { snapshot, command, openPlayer } = useNetworkAudio();
  const history = snapshot.history ?? [];
  return /* @__PURE__ */ jsxs2("section", { className: "sm-listening-library", "aria-label": "Your listening", children: [
    /* @__PURE__ */ jsx2(ListeningInvitation, {}),
    snapshot.queue.length > 0 && /* @__PURE__ */ jsxs2("button", { type: "button", onClick: openPlayer, children: [
      "Open player and queue (",
      snapshot.queue.length,
      ")"
    ] }),
    !snapshot.queue.length && !history.length && /* @__PURE__ */ jsx2("p", { children: "Choose Listen on an article, or add a few stories to your queue. Your audio keeps playing as you browse this publication." }),
    history.length > 0 && /* @__PURE__ */ jsxs2(Fragment, { children: [
      /* @__PURE__ */ jsx2("h2", { children: "Recently listened" }),
      /* @__PURE__ */ jsx2("ul", { children: history.slice(0, 20).map((progress) => {
        const current = snapshot.queue[snapshot.index];
        const playing = !!current && trackKey(current) === trackKey(progress.track) && (snapshot.status === "playing" || snapshot.status === "loading");
        return /* @__PURE__ */ jsxs2("li", { children: [
          /* @__PURE__ */ jsxs2("div", { children: [
            renderArticleLink ? renderArticleLink(progress.track) : /* @__PURE__ */ jsx2("a", { href: progress.track.articleUrl, children: progress.track.title }),
            /* @__PURE__ */ jsx2("small", { children: progress.completed ? "Finished" : `${listeningTime(Math.max(0, progress.duration - progress.position) / snapshot.rate)} left` })
          ] }),
          /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => command(playing ? { action: "pause" } : { action: "playTrack", track: progress.track }), children: playing ? "Pause" : progress.completed ? "Listen again" : "Resume" }),
          !progress.completed && progress.position > 0 && /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => command({ action: "restartTrack", track: progress.track }), children: "Start over" })
        ] }, trackKey(progress.track));
      }) })
    ] })
  ] });
}
function NetworkAudioPlayer({ networkName = "Your listening queue", advertisement, className = "", style, fixed = true, renderArticleLink }) {
  const { snapshot, remote, hosted, notice, command, openNetworkPlayer, expanded, setExpanded } = useNetworkAudio();
  const [height, setHeight] = useState2(0);
  const bar = useRef2(null);
  const expandButton = useRef2(null);
  const detailsId = useId2();
  const track = snapshot.queue[snapshot.index];
  const playing = snapshot.status === "playing" || snapshot.status === "loading";
  const visible = !!track && !snapshot.dismissed;
  const upcoming = snapshot.queue.slice(snapshot.index + 1);
  const completed = track && snapshot.history?.find((p) => trackKey(p.track) === trackKey(track))?.completed;
  const playLabel = playing ? "Pause playback" : snapshot.status === "error" ? "Retry playback" : completed ? "Listen again" : snapshot.position > 0 ? "Resume playback" : "Play audio";
  useEffect2(() => {
    const element = bar.current;
    if (!fixed || !element || !visible) {
      setHeight(0);
      return;
    }
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fixed, visible, expanded, notice, snapshot.error, snapshot.notice]);
  if (!visible || !track) return null;
  return /* @__PURE__ */ jsxs2(Fragment, { children: [
    fixed && /* @__PURE__ */ jsx2("div", { "aria-hidden": "true", style: { height } }),
    /* @__PURE__ */ jsxs2(
      "section",
      {
        ref: bar,
        className: `sm-network-player ${fixed ? "sm-network-player--fixed" : ""} ${className}`,
        style,
        "aria-label": "Audio player",
        onKeyDown: (event) => {
          if (event.key === "Escape" && expanded) {
            setExpanded(false);
            expandButton.current?.focus();
          }
        },
        children: [
          /* @__PURE__ */ jsxs2("div", { className: "sm-network-player__row", children: [
            /* @__PURE__ */ jsx2("button", { type: "button", className: "sm-network-player__play", "aria-label": playLabel, onClick: () => command({ action: playing ? "pause" : "play" }), children: /* @__PURE__ */ jsx2("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: playing ? /* @__PURE__ */ jsx2("path", { d: "M6 4h4v16H6zm8 0h4v16h-4z" }) : /* @__PURE__ */ jsx2("path", { d: "M7 3v18l15-9z" }) }) }),
            /* @__PURE__ */ jsxs2("div", { className: "sm-network-player__story", children: [
              /* @__PURE__ */ jsx2("span", { children: remote ? "Playing in network window" : track.publicationName || networkName }),
              !hosted && renderArticleLink ? renderArticleLink(track) : /* @__PURE__ */ jsx2("a", { href: track.articleUrl, target: "_blank", rel: "noopener noreferrer", children: track.title }),
              /* @__PURE__ */ jsx2("small", { children: snapshot.status === "loading" ? "Loading audio\u2026" : snapshot.status === "error" ? "Playback stopped" : completed ? "Finished" : snapshot.duration > 0 ? `${formatTime(Math.max(0, snapshot.duration - snapshot.position) / snapshot.rate)} left${playing ? "" : " \xB7 Paused"}` : "Ready to listen" })
            ] }),
            /* @__PURE__ */ jsx2("button", { type: "button", className: "sm-network-player__rewind", onClick: () => command({ action: "seek", value: snapshot.position - 10 }), "aria-label": "Back ten seconds", children: "\u21B6 10" }),
            !expanded && !playing && !completed && snapshot.position > 0 && /* @__PURE__ */ jsx2("button", { className: "sm-network-player__restart", type: "button", onClick: () => command({ action: "restart" }), children: "Start over" }),
            /* @__PURE__ */ jsx2("button", { ref: expandButton, type: "button", "aria-expanded": expanded, "aria-controls": detailsId, onClick: () => setExpanded(!expanded), children: expanded ? "Collapse" : upcoming.length ? `Up next (${upcoming.length})` : "Player options" }),
            /* @__PURE__ */ jsx2("button", { type: "button", className: "sm-network-player__close", "aria-label": "Close player and save progress", onClick: () => {
              command({ action: "dismiss" });
              setExpanded(false);
            }, children: "\xD7" })
          ] }),
          (notice || snapshot.error || snapshot.notice) && /* @__PURE__ */ jsxs2("p", { role: "status", className: "sm-network-player__notice", children: [
            notice ?? snapshot.error ?? snapshot.notice,
            snapshot.status === "error" && /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => command({ action: "play" }), children: "Retry" })
          ] }),
          /* @__PURE__ */ jsxs2("div", { id: detailsId, hidden: !expanded, className: "sm-network-player__details", children: [
            /* @__PURE__ */ jsxs2("div", { className: "sm-network-player__timeline", children: [
              /* @__PURE__ */ jsx2("input", { type: "range", min: "0", max: snapshot.duration || 0, step: "0.1", value: Math.min(snapshot.position, snapshot.duration), disabled: !snapshot.duration, "aria-label": "Seek article audio", "aria-valuetext": `${formatTime(snapshot.position)} of ${formatTime(snapshot.duration)}`, onChange: (e) => command({ action: "seek", value: Number(e.target.value) }) }),
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx2("span", { children: formatTime(snapshot.position) }),
                /* @__PURE__ */ jsx2("span", { children: formatTime(snapshot.duration) })
              ] })
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "sm-network-player__tools", children: [
              /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => command({ action: "restart" }), children: "Start over" }),
              /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => command({ action: "seek", value: snapshot.position + 10 }), children: "Forward ten seconds" }),
              upcoming.length > 0 && /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => command({ action: "select", value: snapshot.index + 1 }), children: "Next story" }),
              /* @__PURE__ */ jsxs2("label", { children: [
                "Speed ",
                /* @__PURE__ */ jsx2("select", { "aria-label": "Playback speed", value: snapshot.rate, onChange: (e) => command({ action: "rate", value: Number(e.target.value) }), children: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((rate) => /* @__PURE__ */ jsxs2("option", { value: rate, children: [
                  rate,
                  "\xD7"
                ] }, rate)) })
              ] }),
              /* @__PURE__ */ jsxs2("label", { className: "sm-network-player__volume", children: [
                "Volume ",
                /* @__PURE__ */ jsx2("input", { type: "range", min: "0", max: "1", step: "0.05", value: snapshot.volume, onChange: (e) => command({ action: "volume", value: Number(e.target.value) }) })
              ] }),
              openNetworkPlayer && /* @__PURE__ */ jsx2("button", { type: "button", onClick: openNetworkPlayer, children: remote ? "Open player window" : "Listen across sites \u2197" }),
              /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => command({ action: "clear" }), children: "Clear queue" })
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "sm-network-player__expanded", children: [
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx2("h2", { children: "Up next" }),
                !upcoming.length ? /* @__PURE__ */ jsx2("p", { children: "Your queue ends here. Add another article while you browse." }) : /* @__PURE__ */ jsx2("ol", { children: upcoming.map((item, offset) => /* @__PURE__ */ jsxs2("li", { children: [
                  /* @__PURE__ */ jsxs2("button", { type: "button", className: "sm-network-player__queue-title", onClick: () => command({ action: "select", value: snapshot.index + 1 + offset }), children: [
                    item.title,
                    /* @__PURE__ */ jsx2("small", { children: item.publicationName })
                  ] }),
                  /* @__PURE__ */ jsx2("button", { type: "button", "aria-label": `Remove ${item.title} from queue`, onClick: () => command({ action: "remove", value: snapshot.index + 1 + offset }), children: "Remove" })
                ] }, trackKey(item))) })
              ] }),
              advertisement && /* @__PURE__ */ jsxs2("aside", { "aria-label": "Advertisement", children: [
                /* @__PURE__ */ jsx2("span", { children: "Advertisement" }),
                advertisement
              ] })
            ] })
          ] })
        ]
      }
    )
  ] });
}
export {
  ArticleAudioControls,
  AudioPlayer,
  ListeningInvitation,
  ListeningLibrary,
  ListeningPlaylist,
  NarrationHighlighter,
  NetworkAudioController,
  NetworkAudioPlayer,
  NetworkAudioProvider,
  SENTENCE_HIGHLIGHT,
  WORD_HIGHLIGHT,
  narrationHighlightSupported,
  parseTimingsPayload,
  useArticleNarration,
  useNetworkAudio
};
