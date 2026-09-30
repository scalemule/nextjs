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
export {
  AudioPlayer,
  NarrationHighlighter,
  SENTENCE_HIGHLIGHT,
  WORD_HIGHLIGHT,
  narrationHighlightSupported,
  parseTimingsPayload
};
