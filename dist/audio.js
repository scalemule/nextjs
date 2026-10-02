'use client';
"use strict";
"use client";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/audio.ts
var audio_exports = {};
__export(audio_exports, {
  ArticleAudioControls: () => ArticleAudioControls,
  AudioPlayer: () => AudioPlayer,
  ListeningLibrary: () => ListeningLibrary,
  NarrationHighlighter: () => NarrationHighlighter,
  NetworkAudioController: () => NetworkAudioController,
  NetworkAudioPlayer: () => NetworkAudioPlayer,
  NetworkAudioProvider: () => NetworkAudioProvider,
  SENTENCE_HIGHLIGHT: () => SENTENCE_HIGHLIGHT,
  WORD_HIGHLIGHT: () => WORD_HIGHLIGHT,
  narrationHighlightSupported: () => narrationHighlightSupported,
  parseTimingsPayload: () => parseTimingsPayload,
  useArticleNarration: () => useArticleNarration,
  useNetworkAudio: () => useNetworkAudio
});
module.exports = __toCommonJS(audio_exports);

// src/components/audio-player.tsx
var import_react = require("react");

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
var import_jsx_runtime = require("react/jsx-runtime");
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlayerSession, { ...props }, props.audioKey ?? props.audio.url);
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
  const media = (0, import_react.useRef)(null);
  const alive = (0, import_react.useRef)(true);
  const request = (0, import_react.useRef)(null);
  const triedRefresh = (0, import_react.useRef)(false);
  const intent = (0, import_react.useRef)(false);
  const resume = (0, import_react.useRef)(null);
  const [source, setSource] = (0, import_react.useState)(audio);
  const [duration, setDuration] = (0, import_react.useState)(durationOf(audio));
  const [position, setPosition] = (0, import_react.useState)(0);
  const [speed, setSpeed] = (0, import_react.useState)(1);
  const [playing, setPlaying] = (0, import_react.useState)(false);
  const [pendingPlay, setPendingPlay] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const sliderId = (0, import_react.useId)();
  const labelId = (0, import_react.useId)();
  const rate = (0, import_react.useRef)(1);
  const highlightSupported = (0, import_react.useSyncExternalStore)(
    subscribeNever,
    narrationHighlightSupported,
    // The server can't detect support; render the toggle only after
    // hydration so server and client markup always match.
    () => false
  );
  const narrationOffered = !!narration && audio.has_word_timings !== false && highlightSupported;
  const [highlightOn, setHighlightOn] = (0, import_react.useState)(false);
  const [highlightBusy, setHighlightBusy] = (0, import_react.useState)(false);
  const highlighter = (0, import_react.useRef)(null);
  const highlightAbort = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    if (!narrationOffered) return;
    try {
      if (window.localStorage.getItem(HIGHLIGHT_PREF_KEY) === "1") {
        void enableHighlight(false);
      }
    } catch {
    }
  }, [narrationOffered]);
  (0, import_react.useEffect)(() => {
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
  (0, import_react.useEffect)(() => {
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
  (0, import_react.useEffect)(() => {
    alive.current = true;
    const element = media.current;
    return () => {
      alive.current = false;
      intent.current = false;
      request.current?.abort();
      element?.pause();
    };
  }, []);
  (0, import_react.useEffect)(() => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    resume.current = media.current?.currentTime ?? 0;
    setSource(audio);
    setDuration(durationOf(audio));
  }, [audio.url, audio.expires_at, audio.duration_ms]);
  (0, import_react.useEffect)(() => {
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
  (0, import_react.useEffect)(() => {
    if (media.current) {
      media.current.playbackRate = speed;
      media.current.preservesPitch = true;
    }
  }, [speed, source.url]);
  (0, import_react.useEffect)(() => {
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
  const peaks = (0, import_react.useMemo)(() => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: `sm-audio sm-audio--${variant}${className ? ` ${className}` : ""}`,
      style,
      role: "group",
      "aria-labelledby": labelId,
      "data-audio-variant": variant,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "sm-audio__play",
            onClick: toggle,
            "aria-label": playing || busy && pendingPlay ? "Pause narration" : "Play narration",
            children: playing || busy && pendingPlay ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 4h4v16H6zm8 0h4v16h-4z" }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 4v16l12-8z" }) })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sm-audio__content", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sm-audio__label", id: labelId, children: title }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sm-audio__times", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              time(current),
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sm-audio__elapsed", children: "elapsed" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: remaining })
          ] }),
          variant !== "inline" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              className: "sm-audio__seek",
              style: { "--sm-audio-progress": `${progress}%` },
              children: [
                variant === "waveform" && peaks.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "sm-audio__waveform", "aria-hidden": "true", children: peaks.map((peak, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "span",
                  {
                    style: {
                      height: `${peak * 100}%`,
                      background: (i + 0.5) / peaks.length * 100 <= progress ? "var(--sm-audio-accent)" : "var(--sm-audio-wave)"
                    }
                  },
                  i
                )) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "sm-audio__sr", htmlFor: sliderId, children: "Seek narration" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sm-audio__actions", children: [
          narrationOffered && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: `sm-audio__highlight${highlightOn ? " sm-audio__highlight--on" : ""}`,
              "aria-pressed": highlightOn,
              disabled: highlightBusy,
              onClick: () => highlightOn ? disableHighlight() : void enableHighlight(true),
              "aria-label": highlightOn ? "Turn off follow-along highlighting" : "Highlight the text as it is read",
              title: highlightOn ? "Turn off follow-along highlighting" : "Highlight the text as it is read",
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 5h16v2.5H4zm0 5.75h16v2.5H4zM4 16.5h9v2.5H4z" }) })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
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
        (busy || error) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "sm-audio__status", role: "status", children: busy ? "Loading audio\u2026" : error })
      ]
    }
  );
}

// src/components/network-audio-player.tsx
var import_react2 = require("react");

// src/network-audio/controller.ts
var EMPTY_SNAPSHOT = {
  queue: [],
  index: -1,
  position: 0,
  duration: 0,
  rate: 1,
  volume: 1,
  status: "idle",
  error: null,
  history: [],
  autoplayNext: true,
  allowRepeats: false,
  hidden: false,
  sessionMinutes: 0
};
var trackKey = (track) => JSON.stringify([track.publicationId, track.id]);
var storyKey = (track) => JSON.stringify([track.storyId ?? trackKey(track), track.revision ?? ""]);
var listeningRecord = (snapshot, track) => snapshot.history?.find((item) => storyKey(item.track) === storyKey(track));
var finite = (n) => typeof n === "number" && Number.isFinite(n);
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
  return [t.id, t.publicationId, t.title].every((v) => typeof v === "string" && v.length > 0 && v.length <= 1e3) && (t.publicationName === void 0 || typeof t.publicationName === "string" && t.publicationName.length <= 1e3) && safeHttpUrl(t.articleUrl) && [t.storyId, t.revision, t.section, t.publishedAt].every((v) => v === void 0 || typeof v === "string" && v.length <= 4096) && (t.durationSeconds === void 0 || finite(t.durationSeconds) && t.durationSeconds > 0 && t.durationSeconds <= 86400) && (t.automatic === void 0 || typeof t.automatic === "boolean");
}
var copyTrack = (t) => ({
  id: t.id,
  publicationId: t.publicationId,
  title: t.title,
  ...t.publicationName ? { publicationName: t.publicationName } : {},
  articleUrl: t.articleUrl,
  ...t.storyId ? { storyId: t.storyId } : {},
  ...t.revision ? { revision: t.revision } : {},
  ...t.durationSeconds ? { durationSeconds: t.durationSeconds } : {},
  ...t.section ? { section: t.section } : {},
  ...t.publishedAt ? { publishedAt: t.publishedAt } : {},
  ...t.automatic ? { automatic: true } : {}
});
function validSnapshot(value) {
  if (!value || typeof value !== "object") return false;
  const s = value;
  return Array.isArray(s.queue) && s.queue.length <= 100 && s.queue.every(validTrack) && new Set(s.queue.map(trackKey)).size === s.queue.length && Number.isInteger(s.index) && (s.queue.length ? s.index >= 0 && s.index < s.queue.length : s.index === -1) && finite(s.position) && s.position >= 0 && finite(s.duration) && s.duration >= 0 && finite(s.rate) && s.rate >= 0.5 && s.rate <= 3 && finite(s.volume) && s.volume >= 0 && s.volume <= 1 && ["idle", "loading", "playing", "paused", "error"].includes(s.status) && (s.history === void 0 || Array.isArray(s.history) && s.history.length <= 500 && s.history.every(validRecord)) && [s.autoplayNext, s.allowRepeats, s.hidden].every((v) => v === void 0 || typeof v === "boolean") && (s.historyClearedAt === void 0 || finite(s.historyClearedAt) && s.historyClearedAt >= 0 && s.historyClearedAt <= Date.now() + 6e4) && (s.settingsUpdatedAt === void 0 || finite(s.settingsUpdatedAt) && s.settingsUpdatedAt >= 0 && s.settingsUpdatedAt <= Date.now() + 6e4) && (s.sessionMinutes === void 0 || [0, 5, 10, 20].includes(s.sessionMinutes)) && (s.error === null || typeof s.error === "string" && s.error.length <= 1e3);
}
function validRecord(value) {
  if (!value || typeof value !== "object") return false;
  const r = value;
  return validTrack(r.track) && finite(r.position) && r.position >= 0 && finite(r.duration) && r.duration >= 0 && finite(r.updatedAt) && r.updatedAt >= 0 && r.updatedAt <= Date.now() + 6e4 && [r.completedAt, r.skippedAt].every((v) => v === void 0 || finite(v) && v > 0) && Array.isArray(r.ranges) && r.ranges.length <= 100 && r.ranges.every((v) => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]) && v[0] >= 0 && v[1] >= v[0] && v[1] <= r.duration + 1);
}
function mergeRanges(ranges) {
  const merged = [];
  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1] + 0.1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged.slice(-100);
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
    this.candidates = [];
    this.getSnapshot = () => this.snapshot;
    this.subscribe = (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    };
  }
  mergeListeningMemory(memory) {
    this.patch({ rate: memory.rate, autoplayNext: memory.autoplayNext, allowRepeats: memory.allowRepeats, settingsUpdatedAt: memory.settingsUpdatedAt, historyClearedAt: memory.historyClearedAt, history: memory.history });
    if (this.audio) this.audio.playbackRate = memory.rate;
  }
  setResolver(resolve) {
    this.resolve = resolve;
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
        const duration = finite(audio.duration) && audio.duration > 0 ? audio.duration : this.snapshot.duration;
        if (this.resumePosition !== null) {
          audio.currentTime = duration > 0 ? Math.min(this.resumePosition, duration) : this.resumePosition;
          this.resumePosition = null;
        }
        audio.playbackRate = this.snapshot.rate;
        this.patch({ duration, position: audio.currentTime });
      }),
      on("durationchange", () => {
        if (finite(audio.duration) && audio.duration > 0) this.patch({ duration: audio.duration });
      }),
      on("timeupdate", () => {
        if (this.resumePosition === null) {
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
        document.dispatchEvent(new CustomEvent("scalemule:audio:play", { detail: audio }));
      }),
      on("pause", () => {
        if (this.snapshot.status === "playing") this.patch({ status: "paused" });
      }),
      on("ended", () => {
        if (!this.intent) return;
        this.finish();
      }),
      on("error", () => {
        if (this.intent && !this.request) void this.recover();
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
    this.patch({ hidden: false });
    const found = this.snapshot.queue.findIndex((t) => storyKey(t) === storyKey(track));
    if (found !== -1) return found;
    if (this.snapshot.queue.length >= 100) throw new Error("The listening queue holds up to 100 articles.");
    const queue = [...this.snapshot.queue];
    const protectCurrent = this.source !== null || this.snapshot.status === "loading" || this.snapshot.status === "playing";
    const automatic = queue.findIndex((item, i) => item.automatic && (protectCurrent ? i > this.snapshot.index : i >= this.snapshot.index));
    const at = !track.automatic && automatic >= 0 ? automatic : queue.length;
    queue.splice(at, 0, copyTrack(track));
    const initial = this.snapshot.index === -1 || !protectCurrent && at <= this.snapshot.index;
    const record = listeningRecord(this.snapshot, track);
    this.patch({
      queue,
      index: initial ? at : this.snapshot.index,
      ...initial ? { position: record?.completedAt ? 0 : record?.position ?? 0, duration: record?.duration ?? track.durationSeconds ?? 0 } : {}
    });
    return at;
  }
  playTrack(track) {
    const index = this.enqueue(track);
    if (index === this.snapshot.index) void this.play();
    else this.select(index);
  }
  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.snapshot.queue.length) return;
    if (index === this.snapshot.index) {
      void this.play();
      return;
    }
    this.remember();
    this.cancel();
    this.source = null;
    const record = listeningRecord(this.snapshot, this.snapshot.queue[index]);
    this.patch({ index, position: record?.completedAt ? 0 : record?.position ?? 0, duration: record?.duration ?? 0, error: null, status: "paused", hidden: false });
    void this.play();
  }
  remove(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.snapshot.queue.length) return;
    this.remember();
    const wasPlaying = this.intent;
    const current = this.snapshot.index;
    const queue = this.snapshot.queue.filter((_, i) => i !== index);
    if (index !== current) {
      this.patch({ queue, index: index < current ? current - 1 : current });
      return;
    }
    this.cancel();
    this.source = null;
    const nextIndex = queue.length ? Math.min(index, queue.length - 1) : -1;
    const nextRecord = nextIndex >= 0 ? listeningRecord(this.snapshot, queue[nextIndex]) : void 0;
    this.patch({ queue, index: nextIndex, position: nextRecord?.completedAt ? 0 : nextRecord?.position ?? 0, duration: nextRecord?.duration ?? 0, status: "paused", error: null });
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
    this.remember();
    const pendingPosition = this.resumePosition;
    this.cancel();
    this.resumePosition = pendingPosition;
    this.patch({ status: this.snapshot.queue.length ? "paused" : "idle" });
  }
  clear() {
    this.remember();
    this.cancel();
    this.source = null;
    this.audio?.removeAttribute("src");
    this.patch({ ...this.snapshot, queue: [], index: -1, position: 0, duration: 0, status: "idle", error: null, hidden: false });
  }
  close() {
    this.pause();
    this.patch({ hidden: true });
  }
  setAutoplay(value) {
    this.patch({ autoplayNext: value, settingsUpdatedAt: Date.now() });
  }
  setRepeats(value) {
    this.patch({ allowRepeats: value, settingsUpdatedAt: Date.now() });
  }
  forgetHistory() {
    this.patch({ history: [], historyClearedAt: Date.now() });
  }
  restart() {
    this.seek(0);
    void this.play();
  }
  skip() {
    this.remember({ skippedAt: Date.now() });
    this.remove(this.snapshot.index);
  }
  remember(extra = {}) {
    const track = this.snapshot.queue[this.snapshot.index];
    if (!track || !this.snapshot.duration) return;
    const previous = listeningRecord(this.snapshot, track);
    const ranges = [...previous?.ranges ?? []];
    if (this.source && this.audio) for (let i = 0; i < this.audio.played.length; i++) ranges.push([this.audio.played.start(i), Math.min(this.snapshot.duration, this.audio.played.end(i))]);
    const record = {
      ...previous,
      track: copyTrack(track),
      position: this.snapshot.position,
      duration: this.snapshot.duration,
      ranges: mergeRanges(ranges),
      updatedAt: Date.now(),
      ...extra
    };
    this.patch({ history: [record, ...(this.snapshot.history ?? []).filter((item) => storyKey(item.track) !== storyKey(track))].slice(0, 500) });
  }
  finish() {
    this.remember();
    const track = this.snapshot.queue[this.snapshot.index];
    const record = track && listeningRecord(this.snapshot, track);
    const coverage = record?.ranges.reduce((sum, [start, end]) => sum + end - start, 0) ?? 0;
    if (this.snapshot.duration > 0 && coverage >= this.snapshot.duration * 0.9) this.remember({ completedAt: Date.now(), position: this.snapshot.duration });
    else {
      this.patch({ position: 0 });
      this.remember({ skippedAt: Date.now(), position: 0 });
    }
    const autoplay = this.snapshot.autoplayNext !== false;
    this.intent = false;
    this.remove(this.snapshot.index);
    if (autoplay && this.snapshot.queue.length) void this.play();
  }
  setRecommendations(tracks) {
    this.candidates = tracks.filter(validTrack).slice(0, 100);
  }
  /** Manual selections retain their order; recommendations are bounded and never replace them. */
  catchUp(minutes = 10) {
    if (![5, 10, 20].includes(minutes)) return;
    const active = this.snapshot.queue[this.snapshot.index];
    const manual = this.snapshot.queue.filter((item) => !item.automatic || item === active);
    const queueKeys = new Set(manual.map(storyKey));
    const eligible = this.candidates.filter((item) => !queueKeys.has(storyKey(item)));
    const unheard = eligible.filter((item) => {
      const record = listeningRecord(this.snapshot, item);
      return !record?.completedAt && (!record?.skippedAt || Date.now() - record.skippedAt > 864e5);
    });
    const pool = unheard.length || !this.snapshot.allowRepeats ? unheard : eligible.filter((item) => !listeningRecord(this.snapshot, item)?.skippedAt || Date.now() - listeningRecord(this.snapshot, item).skippedAt > 864e5);
    let budget = minutes * 60 - manual.reduce((sum, item) => sum + Math.max(0, (item.durationSeconds ?? 0) - (item === active ? this.snapshot.position : 0)) / this.snapshot.rate, 0);
    const added = [];
    let lastSection = active?.section;
    const remaining = [...pool];
    while (remaining.length && added.length + manual.length < 100) {
      let at = remaining.findIndex((item2) => item2.section !== lastSection && (item2.durationSeconds ?? Infinity) / this.snapshot.rate <= budget);
      if (at < 0) at = remaining.findIndex((item2) => (item2.durationSeconds ?? Infinity) / this.snapshot.rate <= budget);
      if (at < 0) break;
      const [item] = remaining.splice(at, 1);
      if (queueKeys.has(storyKey(item))) continue;
      queueKeys.add(storyKey(item));
      added.push({ ...copyTrack(item), automatic: true });
      budget -= item.durationSeconds / this.snapshot.rate;
      lastSection = item.section;
    }
    const queue = [...manual, ...added];
    const firstRecord = !active && queue[0] ? listeningRecord(this.snapshot, queue[0]) : void 0;
    this.patch({ queue, index: active ? queue.findIndex((item) => trackKey(item) === trackKey(active)) : queue.length ? 0 : -1, hidden: false, sessionMinutes: minutes, ...!active ? { position: firstRecord?.completedAt ? 0 : firstRecord?.position ?? 0, duration: firstRecord?.duration ?? queue[0]?.durationSeconds ?? 0 } : {} });
  }
  seek(position) {
    if (!finite(position)) return;
    const value = Math.max(0, this.snapshot.duration ? Math.min(position, this.snapshot.duration) : position);
    if (this.audio?.readyState && this.source) this.audio.currentTime = value;
    else this.resumePosition = value;
    this.patch({ position: value });
  }
  setRate(rate) {
    if (!finite(rate) || rate < 0.5 || rate > 3) return;
    if (this.audio) this.audio.playbackRate = rate;
    this.patch({ rate, settingsUpdatedAt: Date.now() });
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
      status: snapshot.queue.length ? "paused" : "idle",
      error: null,
      history: (snapshot.history ?? []).map((item) => ({
        track: copyTrack(item.track),
        position: item.position,
        duration: item.duration,
        ranges: item.ranges.map((range) => [...range]),
        updatedAt: item.updatedAt,
        ...item.completedAt ? { completedAt: item.completedAt } : {},
        ...item.skippedAt ? { skippedAt: item.skippedAt } : {}
      })),
      autoplayNext: snapshot.autoplayNext !== false,
      allowRepeats: snapshot.allowRepeats === true,
      hidden: snapshot.hidden === true,
      historyClearedAt: snapshot.historyClearedAt ?? 0,
      settingsUpdatedAt: snapshot.settingsUpdatedAt ?? 0,
      sessionMinutes: snapshot.sessionMinutes ?? 0
    });
    if (this.audio) {
      this.audio.playbackRate = snapshot.rate;
      this.audio.volume = snapshot.volume;
    }
  }
  async play() {
    if (!this.audio || !this.snapshot.queue[this.snapshot.index] || this.request) return;
    this.intent = true;
    this.refreshed = false;
    this.patch({ error: null, hidden: false });
    const expires = this.source?.expires_at ? Date.parse(this.source.expires_at) : Infinity;
    if (!this.source || expires <= Date.now() + 3e4) await this.load();
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
      this.source = source;
      this.resumePosition = this.snapshot.position;
      this.audio.src = source.url;
      this.audio.playbackRate = this.snapshot.rate;
      this.audio.volume = this.snapshot.volume;
      this.patch({ duration: source.duration_ms && source.duration_ms > 0 ? source.duration_ms / 1e3 : 0 });
      this.request = null;
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
    if (this.refreshed) {
      this.fail("Audio playback stopped. Try playing again or choose another article.");
      return;
    }
    this.refreshed = true;
    await this.load();
  }
  fail(error) {
    this.intent = false;
    this.audio?.pause();
    this.patch({ status: "error", error });
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
    case "close":
    case "skip":
    case "restart":
    case "forgetHistory":
      controller[c.action]();
      return true;
    case "autoplay":
    case "repeats":
      if (typeof c.value !== "boolean") return false;
      if (c.action === "autoplay") controller.setAutoplay(c.value);
      else controller.setRepeats(c.value);
      return true;
    case "catchUp":
      controller.catchUp(c.value);
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
        if (command && (command.action === "enqueue" || command.action === "playTrack") && (!validTrack(command.track) || !trackAllowed(command.track))) return;
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

// src/network-audio/memory.ts
function validMemory(value) {
  if (!value || typeof value !== "object") return false;
  const v = value;
  return v.version === 1 && Number.isFinite(v.rate) && v.rate >= 0.5 && v.rate <= 3 && typeof v.autoplayNext === "boolean" && typeof v.allowRepeats === "boolean" && Number.isFinite(v.historyClearedAt) && v.historyClearedAt >= 0 && v.historyClearedAt <= Date.now() + 6e4 && Number.isFinite(v.settingsUpdatedAt) && v.settingsUpdatedAt >= 0 && v.settingsUpdatedAt <= Date.now() + 6e4 && Array.isArray(v.history) && v.history.length <= 500 && v.history.every(validRecord);
}
function toMemory(snapshot) {
  return {
    version: 1,
    rate: snapshot.rate,
    autoplayNext: snapshot.autoplayNext !== false,
    allowRepeats: snapshot.allowRepeats === true,
    settingsUpdatedAt: snapshot.settingsUpdatedAt ?? 0,
    historyClearedAt: snapshot.historyClearedAt ?? 0,
    history: (snapshot.history ?? []).map((item) => ({ ...item, track: copyTrack(item.track) }))
  };
}
function mergeMemory(local, remote) {
  const historyClearedAt = Math.max(local.historyClearedAt, remote.historyClearedAt);
  const records = /* @__PURE__ */ new Map();
  for (const item of [...remote.history, ...local.history]) {
    if (item.updatedAt <= historyClearedAt) continue;
    const key = storyKey(item.track);
    const previous = records.get(key);
    if (!previous) records.set(key, item);
    else {
      const newest = item.updatedAt >= previous.updatedAt ? item : previous;
      records.set(key, {
        ...newest,
        ranges: mergeRanges([...previous.ranges, ...item.ranges]).filter((range) => range[1] <= newest.duration + 1),
        ...previous.completedAt || item.completedAt ? { completedAt: Math.max(previous.completedAt ?? 0, item.completedAt ?? 0) } : {}
      });
    }
  }
  return {
    ...remote.settingsUpdatedAt > local.settingsUpdatedAt ? remote : local,
    historyClearedAt,
    history: [...records.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 500)
  };
}

// src/network-audio/persistence.ts
function persistListening(controller, options) {
  const allowed = new Set(options.allowedOrigins);
  let ready = false;
  let iframe = null;
  let lastWrite = 0;
  let lastHubWrite = 0;
  let request = 0;
  const hubOrigin = options.hubUrl ? new URL(options.hubUrl).origin : null;
  try {
    const saved = JSON.parse(localStorage.getItem(options.storageKey) ?? "null");
    if (validSnapshot(saved) && saved.queue.every((item) => allowed.has(new URL(item.articleUrl).origin))) controller.restore(options.restoreQueue === false ? { ...saved, queue: [], index: -1, position: 0, duration: 0, hidden: false } : saved);
  } catch {
  }
  const url = new URL(window.location.href);
  const rate = Number(url.searchParams.get("sm_audio_rate"));
  if (url.searchParams.has("sm_audio_rate")) {
    if (rate >= 0.5 && rate <= 3) controller.setRate(rate);
    url.searchParams.delete("sm_audio_rate");
    window.history.replaceState(window.history.state, "", url);
  }
  const sync = () => {
    if (!ready || !iframe?.contentWindow || !hubOrigin) return;
    iframe.contentWindow.postMessage({
      type: "SM_LISTENING_SYNC",
      networkId: options.networkId,
      requestId: String(++request),
      memory: toMemory(controller.getSnapshot())
    }, hubOrigin);
  };
  const save = () => {
    try {
      localStorage.setItem(options.storageKey, JSON.stringify(controller.getSnapshot()));
    } catch {
    }
  };
  let previousQueue = controller.getSnapshot().queue;
  let previousCompleted = controller.getSnapshot().history?.[0]?.completedAt;
  let previousHidden = controller.getSnapshot().hidden;
  let previousClear = controller.getSnapshot().historyClearedAt;
  let previousSettings = controller.getSnapshot().settingsUpdatedAt;
  const unsubscribe = controller.subscribe(() => {
    const changed = previousSettings !== controller.getSnapshot().settingsUpdatedAt || previousClear !== controller.getSnapshot().historyClearedAt;
    const urgent = changed || previousQueue !== controller.getSnapshot().queue || previousCompleted !== controller.getSnapshot().history?.[0]?.completedAt || previousHidden !== controller.getSnapshot().hidden;
    previousQueue = controller.getSnapshot().queue;
    previousCompleted = controller.getSnapshot().history?.[0]?.completedAt;
    previousHidden = controller.getSnapshot().hidden;
    previousClear = controller.getSnapshot().historyClearedAt;
    previousSettings = controller.getSnapshot().settingsUpdatedAt;
    if (urgent || Date.now() - lastWrite > 1e3) {
      lastWrite = Date.now();
      save();
    }
    if (urgent || Date.now() - lastHubWrite > 5e3) {
      lastHubWrite = Date.now();
      sync();
    }
  });
  const receive = (event) => {
    if (!iframe || event.source !== iframe.contentWindow || event.origin !== hubOrigin) return;
    const data = event.data;
    if (data?.type !== "SM_LISTENING_STATE" || data.networkId !== options.networkId || data.requestId !== String(request) || !validMemory(data.memory)) return;
    if (!data.memory.history.every((item) => allowed.has(new URL(item.track.articleUrl).origin))) return;
    controller.mergeListeningMemory(mergeMemory(toMemory(controller.getSnapshot()), data.memory));
  };
  window.addEventListener("message", receive);
  if (options.hubUrl && hubOrigin && allowed.has(hubOrigin)) {
    iframe = document.createElement("iframe");
    iframe.src = options.hubUrl;
    iframe.hidden = true;
    iframe.title = "Shared listening preferences";
    iframe.setAttribute("aria-hidden", "true");
    iframe.onload = () => {
      ready = true;
      sync();
    };
    document.body.appendChild(iframe);
  }
  const decorate = (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(anchor instanceof HTMLAnchorElement)) return;
    try {
      const target = new URL(anchor.href);
      if (!allowed.has(target.origin) || target.origin === window.location.origin) return;
      target.searchParams.set("sm_audio_rate", String(controller.getSnapshot().rate));
      anchor.href = target.toString();
    } catch {
    }
  };
  const flush = () => {
    save();
    sync();
  };
  document.addEventListener("click", decorate, true);
  document.addEventListener("auxclick", decorate, true);
  window.addEventListener("pagehide", flush);
  return () => {
    save();
    unsubscribe();
    iframe?.remove();
    document.removeEventListener("click", decorate, true);
    document.removeEventListener("auxclick", decorate, true);
    window.removeEventListener("pagehide", flush);
    window.removeEventListener("message", receive);
  };
}

// src/components/network-audio-player.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var Context = (0, import_react2.createContext)(null);
var NarrationRegistration = (0, import_react2.createContext)(null);
var serverSnapshot = () => EMPTY_SNAPSHOT;
function NetworkAudioProvider({ children, resolveAudio, connection, host, checkpointStorageKey, persistence, loadRecommendations }) {
  if (connection && host) throw new Error("Use connection on reader pages and host on the dedicated player route, not both.");
  const [controller] = (0, import_react2.useState)(() => new NetworkAudioController(resolveAudio));
  const snapshot = (0, import_react2.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, serverSnapshot);
  const [remoteSnapshot, setRemoteSnapshot] = (0, import_react2.useState)(null);
  const [recommendationsLoading, setRecommendationsLoading] = (0, import_react2.useState)(false);
  const recommendationRequest = (0, import_react2.useRef)(null);
  const [notice, setNotice] = (0, import_react2.useState)(null);
  const [highlightEnabled, setHighlightEnabled] = (0, import_react2.useState)(false);
  const [narrationTracks, setNarrationTracks] = (0, import_react2.useState)(() => /* @__PURE__ */ new Map());
  const registerNarration = (0, import_react2.useCallback)((key) => {
    const id = /* @__PURE__ */ Symbol();
    setNarrationTracks((previous) => new Map(previous).set(id, key));
    return () => setNarrationTracks((previous) => {
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
  }, []);
  const client = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    controller.setResolver(resolveAudio);
  }, [controller, resolveAudio]);
  (0, import_react2.useEffect)(() => {
    const audio = document.createElement("audio");
    controller.attach(audio);
    return () => controller.detach();
  }, [controller]);
  (0, import_react2.useEffect)(() => {
    if (!checkpointStorageKey) return;
    try {
      const data = JSON.parse(sessionStorage.getItem(checkpointStorageKey) ?? "null");
      if (validSnapshot(data)) controller.restore(data);
    } catch {
    }
    let lastWrite = 0;
    const save = () => {
      try {
        sessionStorage.setItem(checkpointStorageKey, JSON.stringify(controller.getSnapshot()));
      } catch {
      }
    };
    const unsubscribe = controller.subscribe(() => {
      if (Date.now() - lastWrite > 1e3) {
        lastWrite = Date.now();
        save();
      }
    });
    window.addEventListener("pagehide", save);
    return () => {
      save();
      unsubscribe();
      window.removeEventListener("pagehide", save);
    };
  }, [controller, checkpointStorageKey]);
  const persistenceOrigins = JSON.stringify(persistence?.allowedOrigins ?? []);
  (0, import_react2.useEffect)(() => {
    if (persistence) return persistListening(controller, { ...persistence, restoreQueue: host && window.opener ? false : persistence.restoreQueue, allowedOrigins: JSON.parse(persistenceOrigins) });
  }, [controller, persistence?.storageKey, persistence?.networkId, persistence?.hubUrl, persistence?.restoreQueue, host?.networkId, persistenceOrigins]);
  (0, import_react2.useEffect)(() => () => recommendationRequest.current?.abort(), []);
  const catchUp = (0, import_react2.useCallback)(async (minutes) => {
    if (!loadRecommendations) return;
    recommendationRequest.current?.abort();
    const request = new AbortController();
    recommendationRequest.current = request;
    setRecommendationsLoading(true);
    setNotice(null);
    const timeout = setTimeout(() => request.abort(), 2e4);
    try {
      const tracks = await loadRecommendations(request.signal);
      if (request.signal.aborted) return;
      controller.setRecommendations(tracks.filter(validTrack));
      controller.catchUp(minutes);
      if (!controller.getSnapshot().queue.length) setNotice("No stories available for this queue. Try a longer session or replay a story from Recently listened.");
    } catch {
      if (recommendationRequest.current === request) setNotice("Could not load your catch-up queue. Your saved queue is still here. Please try again.");
    } finally {
      clearTimeout(timeout);
      if (recommendationRequest.current === request) setRecommendationsLoading(false);
    }
  }, [controller, loadRecommendations]);
  const allowedOrigins = JSON.stringify(host?.allowedOrigins ?? []);
  (0, import_react2.useEffect)(() => {
    if (!host) return;
    return hostNetworkPlayer(controller, { networkId: host.networkId, allowedOrigins: JSON.parse(allowedOrigins) });
  }, [controller, host?.networkId, allowedOrigins]);
  (0, import_react2.useEffect)(() => {
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
  const command = (0, import_react2.useCallback)((value) => {
    setNotice(null);
    try {
      if (value.action === "close") setHighlightEnabled(false);
      if (!client.current?.command(value)) runCommand(controller, value);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The article could not be added.");
    }
  }, [controller]);
  const openNetworkPlayer = (0, import_react2.useCallback)(() => client.current?.open(), []);
  const activeSnapshot = remoteSnapshot ?? snapshot;
  const activeTrack = activeSnapshot.queue[activeSnapshot.index];
  const highlightAvailable = !!activeTrack && [...narrationTracks.values()].includes(trackKey(activeTrack));
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Context.Provider, { value: {
    snapshot: activeSnapshot,
    remote: remoteSnapshot !== null,
    hosted: !!host,
    notice,
    command,
    openNetworkPlayer: connection ? openNetworkPlayer : void 0,
    highlightAvailable,
    highlightEnabled,
    setHighlightEnabled,
    catchUp: loadRecommendations ? catchUp : void 0,
    recommendationsLoading
  }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(NarrationRegistration.Provider, { value: registerNarration, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(NetworkMediaSession, {}),
    children
  ] }) });
}
function useNetworkAudio() {
  const context = (0, import_react2.useContext)(Context);
  if (!context) throw new Error("Mount NetworkAudioProvider above the player and article controls.");
  return context;
}
function NetworkMediaSession() {
  const { snapshot, remote, command } = useNetworkAudio();
  const track = snapshot.queue[snapshot.index];
  (0, import_react2.useEffect)(() => {
    if (remote || !track || !("mediaSession" in navigator)) return;
    const mediaSession = navigator.mediaSession;
    if (typeof MediaMetadata !== "undefined") mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.publicationName ?? "" });
    const handlers = [
      ["play", () => command({ action: "play" })],
      ["pause", () => command({ action: "pause" })],
      ["seekto", (details) => {
        if (details.seekTime != null) command({ action: "seek", value: details.seekTime });
      }]
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
  }, [remote, track, command]);
  (0, import_react2.useEffect)(() => {
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
  const supported = (0, import_react2.useSyncExternalStore)(subscribeCapabilities, narrationHighlightSupported, () => false);
  const registerNarration = (0, import_react2.useContext)(NarrationRegistration);
  const narrationKey = trackKey(track);
  const available = !!narration && supported;
  (0, import_react2.useEffect)(() => {
    if (available) return registerNarration?.(narrationKey);
  }, [available, narrationKey, registerNarration]);
  const active = snapshot.queue[snapshot.index];
  const matching = !!active && trackKey(active) === trackKey(track);
  const clock = (0, import_react2.useRef)({ snapshot, received: 0 });
  (0, import_react2.useEffect)(() => {
    clock.current = { snapshot, received: performance.now() };
  }, [snapshot]);
  (0, import_react2.useEffect)(() => {
    if (!narration || !matching || !highlightEnabled || !supported || snapshot.hidden) return;
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
  }, [snapshot.hidden, matching, highlightEnabled, supported, narration?.targetId, narration?.timingsUrl, track.id, track.publicationId]);
  return { highlightAvailable: !!narration && supported, highlightEnabled, setHighlightEnabled, matching };
}
function AudioIcon({ name }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { className: "sm-network-icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", focusable: "false", children: [
    name === "play" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "m9 5 11 7-11 7Z", fill: "currentColor", stroke: "none" }),
    name === "pause" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M7 5h3v14H7zm7 0h3v14h-3z", fill: "currentColor", stroke: "none" }),
    name === "queue" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M4 6h16M4 12h10M4 18h8m7-5v8m-4-4h8" }) }),
    name === "check" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "m5 12 4 4L19 6" }),
    name === "highlight" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "m7 14 7-9 5 4-7 9-5-4Zm0 0-3 5h8M16 3l5 4M3 22h17" }) }),
    name === "next" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "m6 5 10 7-10 7Z", fill: "currentColor", stroke: "none" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M19 5v14" })
    ] }),
    name === "chevron" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "m7 10 5 5 5-5" }),
    name === "external" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M14 4h6v6m0-6L10 14m10 1v5H4V4h5" }),
    name === "close" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "m6 6 12 12M18 6 6 18" })
  ] });
}
var formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
var PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
function ArticleAudioControls({ track, narration, durationMs, className = "" }) {
  const { snapshot, command } = useNetworkAudio();
  const { highlightAvailable, highlightEnabled, setHighlightEnabled, matching } = useArticleNarration(track, narration);
  const playing = matching && (snapshot.status === "playing" || snapshot.status === "loading");
  const record = listeningRecord(snapshot, track);
  const resume = !record?.completedAt && (matching ? snapshot.position : record?.position ?? 0) > 2;
  const updated = !record && snapshot.history?.some((item) => item.completedAt && item.track.storyId && item.track.storyId === track.storyId);
  const caption = playing ? "Pause this story" : record?.completedAt ? "Listen again" : resume ? "Resume this story" : "Listen to this story";
  const queued = snapshot.queue.some((item) => storyKey(item) === storyKey(track));
  const duration = matching && snapshot.duration > 0 ? snapshot.duration : (durationMs ?? 0) / 1e3;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `sm-network-article ${className}`, role: "group", "aria-label": "Article audio", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          type: "button",
          className: "sm-network-article__listen",
          "aria-label": caption,
          onClick: () => command(playing ? { action: "pause" } : { action: "playTrack", track }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sm-network-article__disc", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AudioIcon, { name: playing ? "pause" : "play" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "sm-network-article__caption", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: caption }),
              updated && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: "Updated since you listened" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sm-network-article__duration", children: matching && snapshot.status === "loading" ? "Loading audio\u2026" : duration > 0 ? `${formatTime(Math.max(0, duration - (resume ? matching ? snapshot.position : record?.position ?? 0 : 0)) / snapshot.rate)} ${resume ? "remaining" : "listening time"}` : "Article audio" })
            ] })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sm-network-article__actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", "aria-label": `Article playback speed ${snapshot.rate}\xD7`, onClick: () => command({ action: "rate", value: PLAYBACK_RATES.find((rate) => rate > snapshot.rate) ?? 1 }), children: [
          snapshot.rate,
          "\xD7"
        ] }),
        resume && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: () => {
          command({ action: "playTrack", track });
          command({ action: "restart" });
        }, children: "Start over" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "button",
          {
            type: "button",
            className: "sm-network-article__queue",
            "aria-label": queued ? "Queued" : "Add to queue",
            disabled: queued,
            onClick: () => command({ action: "enqueue", track }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AudioIcon, { name: queued ? "check" : "queue" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: queued ? "Queued" : "Queue" })
            ]
          }
        ),
        highlightAvailable && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "button",
          {
            type: "button",
            "aria-label": "Follow along: highlight words",
            "aria-pressed": highlightEnabled,
            title: "Highlight words as you listen",
            onClick: () => setHighlightEnabled(!highlightEnabled),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AudioIcon, { name: "highlight" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Follow along" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sm-network-toggle", "aria-hidden": "true" })
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ListeningLibrary, {})
  ] });
}
function NetworkAudioPlayer({ networkName = "Your listening queue", advertisement, className = "", style, fixed = true, renderArticleLink }) {
  const { snapshot, remote, hosted, notice, command, openNetworkPlayer, highlightAvailable, highlightEnabled, setHighlightEnabled } = useNetworkAudio();
  const [expanded, setExpanded] = (0, import_react2.useState)(false);
  const [height, setHeight] = (0, import_react2.useState)(0);
  const bar = (0, import_react2.useRef)(null);
  const detailsId = (0, import_react2.useId)();
  const track = snapshot.queue[snapshot.index];
  const playing = snapshot.status === "playing" || snapshot.status === "loading";
  const nextRate = PLAYBACK_RATES.find((rate) => rate > snapshot.rate) ?? 1;
  (0, import_react2.useEffect)(() => {
    const element = bar.current;
    if (!fixed || !element) return;
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fixed, !!track, expanded, notice, snapshot.error]);
  if (!track || snapshot.hidden) return notice ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "status", children: notice }) : null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    fixed && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { "aria-hidden": "true", style: { height } }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { ref: bar, className: `sm-network-player ${fixed ? "sm-network-player--fixed" : ""} ${className}`, style, "aria-label": "Network audio player", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sm-network-player__row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "sm-network-player__play", "aria-label": playing ? "Pause playback" : "Play playback", onClick: () => command({ action: playing ? "pause" : "play" }), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AudioIcon, { name: playing ? "pause" : "play" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sm-network-player__story", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: remote ? "Playing in network window" : networkName }),
          !hosted && renderArticleLink ? renderArticleLink(track) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href: track.articleUrl, target: "_blank", rel: "noopener noreferrer", children: track.title }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: track.publicationName })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sm-network-player__timeline", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: { "--sm-progress": `${snapshot.duration ? Math.min(100, snapshot.position / snapshot.duration * 100) : 0}%` }, type: "range", min: "0", max: snapshot.duration || 0, step: "0.1", value: Math.min(snapshot.position, snapshot.duration), disabled: !snapshot.duration, "aria-label": "Seek article audio", onChange: (e) => command({ action: "seek", value: Number(e.target.value) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: formatTime(snapshot.position) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "sm-network-player__remaining", "aria-label": `${formatTime(Math.max(0, snapshot.duration - snapshot.position) / snapshot.rate)} remaining`, children: [
              formatTime(Math.max(0, snapshot.duration - snapshot.position) / snapshot.rate),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sm-network-player__remaining-label", children: " remaining" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sm-network-player__shortcuts", role: "group", "aria-label": "Playback shortcuts", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "button",
            {
              type: "button",
              className: "sm-network-player__rate",
              "aria-label": `Playback speed ${snapshot.rate}\xD7. ${nextRate > snapshot.rate ? "Speed up" : "Reset"} to ${nextRate}\xD7`,
              title: `Playback speed: ${snapshot.rate}\xD7. Click for ${nextRate}\xD7`,
              onClick: () => command({ action: "rate", value: nextRate }),
              children: [
                snapshot.rate,
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\xD7" })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "button",
            {
              type: "button",
              className: "sm-network-player__highlight",
              "aria-label": "Follow along: highlight article words",
              "aria-pressed": highlightAvailable && highlightEnabled,
              disabled: !highlightAvailable,
              title: highlightAvailable ? "Highlight words as you listen" : "Open the playing article to use word highlighting when available",
              onClick: () => setHighlightEnabled(!highlightEnabled),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AudioIcon, { name: "highlight" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Follow along" })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: "sm-network-player__next",
              "aria-label": "Next article",
              title: "Next article",
              onClick: () => command({ action: "skip" }),
              children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AudioIcon, { name: "next" })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "button",
            {
              type: "button",
              className: "sm-network-player__queue",
              "aria-label": expanded ? "Close queue" : `Queue (${snapshot.queue.length})`,
              "aria-expanded": expanded,
              "aria-controls": detailsId,
              onClick: () => setExpanded(!expanded),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AudioIcon, { name: "queue" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sm-network-player__queue-label", children: expanded ? "Close queue" : "Queue" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sm-network-player__count", children: snapshot.queue.length }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AudioIcon, { name: "chevron" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "sm-network-player__close",
            "aria-label": "Close player",
            title: "Pause and close player. Your queue is saved.",
            onClick: () => {
              setExpanded(false);
              command({ action: "close" });
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AudioIcon, { name: "close" })
          }
        )
      ] }),
      (notice || snapshot.error) && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "status", className: "sm-network-player__notice", children: notice ?? snapshot.error }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { id: detailsId, hidden: !expanded, className: "sm-network-player__details", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sm-network-player__tools", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: () => command({ action: "seek", value: snapshot.position - 15 }), children: "Back 15 seconds" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: () => command({ action: "seek", value: snapshot.position + 30 }), children: "Forward 30 seconds" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "Speed ",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "sm-network-player__select", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("select", { value: snapshot.rate, onChange: (e) => command({ action: "rate", value: Number(e.target.value) }), children: PLAYBACK_RATES.map((rate) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value: rate, children: [
                rate,
                "\xD7"
              ] }, rate)) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AudioIcon, { name: "chevron" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: snapshot.autoplayNext !== false, onChange: (e) => command({ action: "autoplay", value: e.target.checked }) }),
            "Play next automatically"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
            "Volume ",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "range", min: "0", max: "1", step: "0.05", value: snapshot.volume, onChange: (e) => command({ action: "volume", value: Number(e.target.value) }) })
          ] }),
          openNetworkPlayer && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", onClick: openNetworkPlayer, children: [
            remote ? "Open player window" : "Listen across sites",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AudioIcon, { name: "external" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: () => command({ action: "clear" }), children: "Stop and clear queue" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sm-network-player__expanded", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: "Up next" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ol", { children: snapshot.queue.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { "aria-current": index === snapshot.index ? "true" : void 0, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "sm-network-player__queue-title", onClick: () => command({ action: "select", value: index }), children: [
                item.title,
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
                  item.publicationName,
                  index === snapshot.index ? " \u2014 Current article" : ""
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-label": `Remove ${item.title} from queue`, onClick: () => command({ action: "remove", value: index }), children: "Remove" })
            ] }, trackKey(item))) })
          ] }),
          advertisement && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("aside", { "aria-label": "Advertisement", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Advertisement" }),
            advertisement
          ] })
        ] })
      ] })
    ] })
  ] });
}
function ListeningLibrary({ open = false }) {
  const { snapshot, command, catchUp, recommendationsLoading, remote, notice } = useNetworkAudio();
  const [minutes, setMinutes] = (0, import_react2.useState)(10);
  const recent = (snapshot.history ?? []).filter((item) => item.completedAt).slice(0, 20);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { className: "sm-listening-library", open: open || void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("summary", { children: [
      "Your listening ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: snapshot.queue.length ? `${snapshot.queue.length} queued` : recent.length ? "Recently listened" : "Queue & catch up" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sm-listening-library__body", children: [
      catchUp && !remote && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sm-listening-library__catchup", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
          "Catch me up in ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("select", { "aria-label": "Catch-up length", value: minutes, onChange: (e) => setMinutes(Number(e.target.value)), children: [5, 10, 20].map((value) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value, children: [
            value,
            " minutes"
          ] }, value)) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", disabled: recommendationsLoading, onClick: () => void catchUp(minutes), children: recommendationsLoading ? "Finding stories\u2026" : "Build my queue" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
          "Unheard stories first, timed at ",
          snapshot.rate,
          "\xD7. Your selections stay first."
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "sm-listening-library__option", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: snapshot.allowRepeats === true, onChange: (e) => command({ action: "repeats", value: e.target.checked }) }),
        "Include repeats when I\u2019m caught up"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "sm-listening-library__option", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: snapshot.autoplayNext !== false, onChange: (e) => command({ action: "autoplay", value: e.target.checked }) }),
        "Play next automatically"
      ] }),
      notice && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { role: "status", children: notice }),
      snapshot.queue.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: "Up next" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { children: [
          snapshot.queue.length,
          " stories \xB7 ",
          formatTime(snapshot.queue.reduce((sum, item, index) => sum + Math.max(0, (item.durationSeconds ?? 0) - (index === snapshot.index ? snapshot.position : 0)) / snapshot.rate, 0)),
          " at ",
          snapshot.rate,
          "\xD7"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ol", { children: snapshot.queue.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: () => command({ action: "select", value: index }), children: item.title }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-label": `Remove ${item.title}`, onClick: () => command({ action: "remove", value: index }), children: "Remove" })
        ] }, trackKey(item))) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: () => command({ action: "clear" }), children: "Clear queue" })
      ] }),
      recent.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: "Recently listened" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ol", { children: recent.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: item.track.title }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-label": `Replay ${item.track.title}`, onClick: () => command({ action: "playTrack", track: { ...item.track, automatic: false } }), children: "Replay" })
        ] }, storyKey(item.track))) })
      ] }),
      recent.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: () => command({ action: "forgetHistory" }), children: "Clear listening history" }),
      !snapshot.queue.length && !notice && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: recent.length ? "You\u2019re caught up with your queue." : "Add a story or build a catch-up queue to start listening." })
    ] })
  ] });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ArticleAudioControls,
  AudioPlayer,
  ListeningLibrary,
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
});
