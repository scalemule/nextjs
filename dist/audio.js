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
  AudioPlayer: () => AudioPlayer
});
module.exports = __toCommonJS(audio_exports);

// src/components/audio-player.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var SPEEDS = [1, 1.25, 1.5, 2, 3];
var PLAY_EVENT = "scalemule:audio:play";
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
  showRefreshButton = false,
  onPlaybackError,
  playbackRateStorageKey = "scalemule:audio:playback-rate",
  exclusivePlayback = true
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
            preload,
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
          ),
          onRefresh && showRefreshButton && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "sm-audio__refresh",
              disabled: busy,
              onClick: () => void recover(true),
              children: "Refresh"
            }
          )
        ] }),
        (busy || error) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "sm-audio__status", role: "status", children: busy ? "Refreshing audio\u2026" : error })
      ]
    }
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AudioPlayer
});
