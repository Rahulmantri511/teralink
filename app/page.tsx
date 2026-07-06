"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Hls from "hls.js";
import type { TeraboxFile, TeraboxResult } from "../lib/terabox";

// ─── helpers ──────────────────────────────────────────────────────────────────

function isVideo(filename: string) {
  return /\.(mp4|mkv|webm|avi|mov|flv|m4v|ts|3gp)$/i.test(filename);
}
function isAudio(filename: string) {
  return /\.(mp3|aac|ogg|flac|wav|m4a|opus)$/i.test(filename);
}
function isImage(filename: string) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename);
}
function fileIcon(f: TeraboxFile) {
  if (f.is_dir === "1") return "📁";
  if (isVideo(f.name)) return "🎬";
  if (isAudio(f.name)) return "🎵";
  if (isImage(f.name)) return "🖼️";
  return "📄";
}

// ─── custom video player component ────────────────────────────────────────────

interface VideoPlayerProps {
  activeFile: TeraboxFile;
  workerUrl: string;
}

function VideoPlayer({ activeFile, workerUrl }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const qualities = activeFile.fast_stream_url || {};
  const qualityKeys = Object.keys(qualities).filter(k => qualities[k]);

  const [currentQuality, setCurrentQuality] = useState<string>(() => {
    const qualities = activeFile.fast_stream_url || {};
    const keys = Object.keys(qualities).filter(k => qualities[k]);
    // Prioritize the full video ("Original (Full)") by default so the full length plays.
    // If it's not present, fall back to segmented preview qualities.
    const preferredOrder = [
      "480p", "360p", "720p", "1080p",
      "Original (Full)",
      "Preview (480p)", "Preview (360p)", "Preview (720p)", "Preview (1080p)"
    ];
    for (const key of preferredOrder) {
      if (keys.includes(key)) return key;
    }
    return keys[0] || "default";
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [transientIndicator, setTransientIndicator] = useState<"play" | "pause" | "forward" | "rewind" | null>(null);

  // Mobile gesture state: vertical swipe on left half = brightness, right half = volume.
  // We use CSS filter: brightness() on the video element (works on all browsers;
  // true OS-level brightness is not exposed to web).
  const [gestureOverlay, setGestureOverlay] = useState<{ kind: "brightness" | "volume"; value: number } | null>(null);
  const [videoBrightness, setVideoBrightness] = useState(1); // 0..2, default 1
  const touchStateRef = useRef<{ active: boolean; startX: number; startY: number; side: "left" | "right" | null; startValue: number; moved: boolean; startTime: number }>({ active: false, startX: 0, startY: 0, side: null, startValue: 0, moved: false, startTime: 0 });
  // Stores the last-tap event's timeStamp (DOMHighResTimeStamp from the
  // browser-assigned event time, not Date.now() — avoids the react-hooks
  // purity rule that flags direct Date.now() calls inside the component).
  const lastTapRef = useRef<{ time: number; x: number; side: "left" | "right" }>({ time: 0, x: 0, side: "left" });

  const indicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gestureOverlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getAbsoluteUrl = (pathOrUrl: string) => {
    if (!pathOrUrl) return "";
    
    // If it's a local API endpoint, return as-is
    if (pathOrUrl.startsWith("/api/")) {
      return pathOrUrl;
    }
    
    // If it's already an absolute URL pointing to a stream or fast_stream endpoint, return as-is
    if (pathOrUrl.startsWith("http")) {
      const isWorkerEndpoint = pathOrUrl.includes("/stream") || 
                               pathOrUrl.includes("/fast_stream") || 
                               pathOrUrl.includes("/share/streaming");
      if (isWorkerEndpoint) {
        return pathOrUrl;
      }
      // Encode external URL
      const encoded = btoa(pathOrUrl).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const base = workerUrl.replace(/\/$/, "");
      return `${base}/stream?url=${encoded}`;
    }

    const base = workerUrl.replace(/\/$/, "");
    return `${base}${pathOrUrl}`;
  };

  const currentStreamUrl = currentQuality === "default" 
    ? (activeFile.stream_url)
    : (qualities[currentQuality] || activeFile.stream_url);

  const handleRetry = () => {
    setPlayerError(null);
    setRetryCount(prev => prev + 1);
  };

  const triggerTransientIndicator = (type: "play" | "pause" | "forward" | "rewind") => {
    setTransientIndicator(type);
    if (indicatorTimeoutRef.current) {
      clearTimeout(indicatorTimeoutRef.current);
    }
    indicatorTimeoutRef.current = setTimeout(() => {
      setTransientIndicator(null);
    }, 500);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      triggerTransientIndicator("pause");
    } else {
      video.play().catch(() => {});
      triggerTransientIndicator("play");
    }
  };

  const skipTime = (amount: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + amount, duration));
    triggerTransientIndicator(amount > 0 ? "forward" : "rewind");
  };

  const handleVolumeChange = (newVal: number) => {
    setVolume(newVal);
    if (videoRef.current) {
      videoRef.current.volume = newVal;
      const shouldMute = newVal === 0;
      setIsMuted(shouldMute);
      videoRef.current.muted = shouldMute;
    }
  };

  const toggleMute = () => {
    const newMute = !isMuted;
    setIsMuted(newMute);
    if (videoRef.current) {
      videoRef.current.muted = newMute;
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSettings(false);
  };

  const handleQualityChange = (q: string) => {
    setCurrentQuality(q);
    setShowSettings(false);
  };

  const toggleFullscreen = () => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current;
    if (!wrapper || !video) return;

    // webkitEnterFullscreen is a non-standard iOS Safari API, absent from TS DOM types
    interface WebkitVideoElement extends HTMLVideoElement {
      webkitEnterFullscreen?: () => void;
    }
    const videoWebkit = video as WebkitVideoElement;

    if (!document.fullscreenElement) {
      if (wrapper.requestFullscreen) {
        wrapper.requestFullscreen().catch(err => {
          console.error("Fullscreen error:", err);
          if (videoWebkit.webkitEnterFullscreen) {
            videoWebkit.webkitEnterFullscreen();
          }
        });
      } else if (videoWebkit.webkitEnterFullscreen) {
        videoWebkit.webkitEnterFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.error("PiP error:", err);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const seekTime = parseFloat(e.target.value);
    video.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    
    // Sync buffered percentage
    if (video.duration > 0 && video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      setBufferedPercent((bufferedEnd / video.duration) * 100);
    }
  };

  const handleProgress = () => {
    const video = videoRef.current;
    if (video && video.duration > 0 && video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      setBufferedPercent((bufferedEnd / video.duration) * 100);
    }
  };

  // Setup HLS.js or native playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentStreamUrl) return;

    const streamUrl = getAbsoluteUrl(currentStreamUrl);
    setPlayerError(null);

    const previousTime = video.currentTime;
    const wasPlaying = isPlaying;

    const checkIsHls = (urlStr: string) => {
      if (urlStr.includes(".m3u8") || urlStr.includes("/fast_stream?")) {
        return true;
      }
      if (urlStr.includes("/stream?")) {
        try {
          const u = new URL(urlStr, window.location.origin);
          if (u.searchParams.get("dl") === "1") return false;
          if (u.searchParams.get("format") === "mp4") return false;
          if (u.pathname.endsWith("/stream") || u.pathname.endsWith("/fast_stream")) {
            return true;
          }
        } catch {}
      }
      if (urlStr.includes("/stream?url=")) {
        try {
          const u = new URL(urlStr, window.location.origin);
          const target = u.searchParams.get("url") || "";
          let decoded = "";
          try {
            decoded = atob(target.replace(/-/g, '+').replace(/_/g, '/'));
          } catch {
            decoded = decodeURIComponent(target);
          }
          return decoded.includes(".m3u8") || 
                 decoded.includes("/share/streaming") || 
                 decoded.includes("type=M3U8");
        } catch {
          return false;
        }
      }
      return false;
    };

    const isHls = checkIsHls(streamUrl);

    if (isHls) {
      if (hlsRef.current) {
        hlsRef.current.loadSource(streamUrl);
        hlsRef.current.once(Hls.Events.MANIFEST_PARSED, () => {
          if (previousTime > 0) {
            video.currentTime = previousTime;
          }
          if (wasPlaying) {
            video.play().catch(() => {});
          }
        });
        return;
      }

      if (Hls.isSupported()) {
        // HLS.js supported (desktop, Android Chrome/Firefox, etc.)
        const hls = new Hls({
          enableWorker: true,
          maxBufferLength: 60,
          maxMaxBufferLength: 600,
          lowLatencyMode: false,
        });
        hlsRef.current = hls;

        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (previousTime > 0) {
            video.currentTime = previousTime;
          }
          if (wasPlaying) {
            video.play().catch(() => {});
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error("HLS.js error:", data);
          if (data.fatal) {
            const isVerificationErr = data.response?.code === 403;
            if (isVerificationErr) {
              setPlayerError("TeraBox guest session expired or verification is required. Please try refreshing/re-generating the play link.");
              return;
            }
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                setPlayerError("Streaming timeout or CORS block. Press retry below.");
                break;
            }
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // iOS Safari native HLS — no HLS.js support here.
        // The stream URL is already proxied via /api/stream which rewrites segments
        // through the worker, so iOS can play it via native HLS too.
        video.src = streamUrl;
        video.addEventListener("loadedmetadata", () => {
          if (previousTime > 0) {
            video.currentTime = previousTime;
          }
          if (wasPlaying) {
            video.play().catch(() => {});
          }
        }, { once: true });
      } else {
        setPlayerError("Your browser does not support HLS streaming.");
      }
    } else {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.src = streamUrl;
      video.load();
      video.addEventListener("loadedmetadata", () => {
        if (previousTime > 0) {
          video.currentTime = previousTime;
        }
        if (wasPlaying) {
          video.play().catch(() => {});
        }
      }, { once: true });
    }
  }, [currentStreamUrl, retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // Preserve volume, mute, speed on source changes
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = volume;
      video.muted = isMuted;
      video.playbackRate = playbackRate;
    }
  }, [volume, isMuted, playbackRate, currentStreamUrl]);

  // Sync fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    const handleWebKitFullscreenChange = (e: Event) => {
      setIsFullscreen(e.type === "webkitbeginfullscreen");
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    const video = videoRef.current;
    if (video) {
      video.addEventListener("webkitbeginfullscreen", handleWebKitFullscreenChange);
      video.addEventListener("webkitendfullscreen", handleWebKitFullscreenChange);
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (video) {
        video.removeEventListener("webkitbeginfullscreen", handleWebKitFullscreenChange);
        video.removeEventListener("webkitendfullscreen", handleWebKitFullscreenChange);
      }
    };
  }, []);

  // Global Keyboard Shortcuts (ignoring inputs)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "arrowright":
          e.preventDefault();
          skipTime(10);
          break;
        case "arrowleft":
          e.preventDefault();
          skipTime(-10);
          break;
        case "arrowup":
          e.preventDefault();
          const nextVolUp = Math.min((videoRef.current?.volume ?? volume) + 0.05, 1);
          handleVolumeChange(nextVolUp);
          break;
        case "arrowdown":
          e.preventDefault();
          const nextVolDown = Math.max((videoRef.current?.volume ?? volume) - 0.05, 0);
          handleVolumeChange(nextVolDown);
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isPlaying, volume, isMuted, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-hide controls
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const resetAutoHide = () => {
      setShowControls(true);
      clearTimeout(timeoutId);
      if (isPlaying) {
        timeoutId = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    };

    const container = wrapperRef.current;
    if (container) {
      container.addEventListener("mousemove", resetAutoHide);
      container.addEventListener("touchstart", resetAutoHide, { passive: true });
      container.addEventListener("mouseleave", () => {
        if (isPlaying) {
          setShowControls(false);
        }
      });
    }

    return () => {
      if (container) {
        container.removeEventListener("mousemove", resetAutoHide);
        container.removeEventListener("touchstart", resetAutoHide);
      }
      clearTimeout(timeoutId);
    };
  }, [isPlaying]);

  // Settings popover click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const remainingTime = duration > 0 ? duration - currentTime : 0;
  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds < 0) return "00:00";
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    
    const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
    if (hours > 0) {
      const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
      return `${hours}:${formattedMinutes}:${formattedSeconds}`;
    }
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return `${formattedMinutes}:${formattedSeconds}`;
  };

  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowControls(prev => !prev);
  };

  const handleVideoDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePlay();
  };

  // ── Mobile gestures ─────────────────────────────────────────────────────────
  // Single tap: show/hide controls. Double tap: rewind/forward 10s based on
  // which half of the video was tapped. Vertical drag on left half adjusts
  // brightness (via CSS filter), on right half adjusts volume.

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const side: "left" | "right" = x < rect.width / 2 ? "left" : "right";
    touchStateRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      side,
      startValue: side === "left" ? videoBrightness : (videoRef.current?.volume ?? volume),
      moved: false,
      // Use the browser-assigned event timeStamp (DOMHighResTimeStamp) instead
      // of Date.now() — the React 19 purity rule flags Date.now() inside
      // component-defined handlers.
      startTime: e.timeStamp,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const ts = touchStateRef.current;
    if (!ts.active || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dy = ts.startY - touch.clientY; // up = positive
    const dx = Math.abs(touch.clientX - ts.startX);
    const dyAbs = Math.abs(dy);
    // Only treat as gesture if vertical movement is dominant
    if (dyAbs > 8 && dyAbs > dx) {
      if (!ts.moved) {
        e.preventDefault();
        ts.moved = true;
      }
      if (ts.side === "left") {
        // Brightness: full screen height ≈ 2x range (0..2)
        const delta = dy / (window.innerHeight * 0.5);
        const next = Math.max(0, Math.min(2, ts.startValue + delta));
        setVideoBrightness(next);
        showGestureOverlay("brightness", next / 2);
      } else {
        // Volume: full screen height ≈ 1.0 range
        const delta = dy / (window.innerHeight * 0.5);
        const next = Math.max(0, Math.min(1, ts.startValue + delta));
        handleVolumeChange(next);
        showGestureOverlay("volume", next);
      }
    } else if (dx > 10 || dyAbs > 10) {
      // Horizontal or diagonal drag — cancel gesture so native scroll/click works
      ts.moved = true;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const ts = touchStateRef.current;
    if (!ts.active) return;
    // e.timeStamp is set by the browser when the event was created — same
    // high-resolution clock for both touchstart and touchend, no Date.now()
    // call needed inside the component (would trigger react-hooks/purity).
    const duration = e.timeStamp - ts.startTime;
    const wasTap = !ts.moved && duration < 300;
    ts.active = false;
    hideGestureOverlay();

    if (!wasTap) return;

    // Detect double-tap (within 300ms, same side)
    const last = lastTapRef.current;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    // Find the touch end position
    const touch = e.changedTouches[0];
    const x = touch.clientX - rect.left;
    const side: "left" | "right" = x < rect.width / 2 ? "left" : "right";
    if (e.timeStamp - last.time < 300 && last.side === side) {
      // Double tap detected
      e.preventDefault();
      if (side === "left") skipTime(-10);
      else skipTime(10);
      lastTapRef.current = { time: 0, x: 0, side: "left" }; // reset
    } else {
      lastTapRef.current = { time: e.timeStamp, x, side };
    }
  };

  const showGestureOverlay = (kind: "brightness" | "volume", value: number) => {
    if (gestureOverlayTimeoutRef.current) clearTimeout(gestureOverlayTimeoutRef.current);
    setGestureOverlay({ kind, value });
  };

  const hideGestureOverlay = () => {
    if (gestureOverlayTimeoutRef.current) clearTimeout(gestureOverlayTimeoutRef.current);
    gestureOverlayTimeoutRef.current = setTimeout(() => setGestureOverlay(null), 500);
  };

  return (
    <div 
      ref={wrapperRef}
      className={`custom-player-container ${isFullscreen ? "fullscreen" : ""} ${!showControls ? "hide-cursor" : ""}`}
      tabIndex={0}
    >
      <div className="video-viewport">
        <video
          ref={videoRef}
          className="player-video"
          style={{ filter: `brightness(${videoBrightness})` }}
          playsInline
          autoPlay
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onProgress={handleProgress}
          onClick={handleVideoClick}
          onDoubleClick={handleVideoDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onError={(e) => {
            const err = (e.target as HTMLVideoElement).error;
            console.error("Video element playback error:", err);
            if (err) {
              setPlayerError(`Playback error (code ${err.code}): ${err.message || "Failed to load video or format is unsupported."}`);
            }
          }}
        >
          Your browser does not support the video tag.
        </video>

        {isBuffering && (
          <div className="player-loading-overlay">
            <div className="spinner"></div>
          </div>
        )}

        {gestureOverlay && (
          <div className={`gesture-overlay ${gestureOverlay.kind === "brightness" ? "left" : "right"}`}>
            <div className="gesture-icon">
              {gestureOverlay.kind === "brightness" ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              )}
            </div>
            <div className="gesture-bar-track">
              <div className="gesture-bar-fill" style={{ width: `${Math.round(gestureOverlay.value * 100)}%` }}></div>
            </div>
            <div className="gesture-value">{Math.round(gestureOverlay.value * 100)}%</div>
          </div>
        )}

        {transientIndicator && (
          <div className="transient-indicator-overlay">
            <div className="indicator-icon">
              {transientIndicator === "play" ? (
                <svg viewBox="0 0 24 24" fill="white" width="36" height="36">
                  <polygon points="6 3 20 12 6 21 6 3"></polygon>
                </svg>
              ) : transientIndicator === "pause" ? (
                <svg viewBox="0 0 24 24" fill="white" width="36" height="36">
                  <rect x="6" y="4" width="4" height="16" rx="1" fill="white"></rect>
                  <rect x="14" y="4" width="4" height="16" rx="1" fill="white"></rect>
                </svg>
              ) : transientIndicator === "forward" ? (
                <svg viewBox="0 0 24 24" fill="white" width="36" height="36">
                  <polygon points="13 19 22 12 13 5 13 19"></polygon>
                  <polygon points="2 19 11 12 2 5 2 19"></polygon>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="white" width="36" height="36">
                  <polygon points="11 19 2 12 11 5 11 19"></polygon>
                  <polygon points="22 19 13 12 22 5 22 19"></polygon>
                </svg>
              )}
            </div>
          </div>
        )}

        {playerError && (
          <div className="player-error-overlay">
            <span className="error-icon">⚠️</span>
            <p className="error-message">{playerError}</p>
            <button className="retry-btn" onClick={handleRetry}>
              🔄 Retry Connection
            </button>
          </div>
        )}
      </div>

      <div className={`player-controls-bar ${showControls ? "visible" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="timeline-container">
          <div className="timeline-rail">
            <div className="timeline-bg"></div>
            <div className="timeline-buffered" style={{ width: `${bufferedPercent}%` }}></div>
            <div className="timeline-current" style={{ width: `${currentPercent}%` }}></div>
          </div>
          <input
            type="range"
            className="timeline-slider"
            min={0}
            max={duration || 100}
            step="any"
            value={currentTime}
            onChange={handleSeek}
          />
        </div>

        <div className="controls-row">
          <div className="controls-left">
            <button className="control-btn" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="4" x2="18" y2="20"></line><line x1="6" y1="4" x2="6" y2="20"></line></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
              )}
            </button>

            <button className="control-btn" onClick={() => skipTime(-10)} title="Rewind 10s">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg>
            </button>

            <button className="control-btn" onClick={() => skipTime(10)} title="Fast Forward 10s">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>
            </button>

            <div className="volume-control-wrap">
              <button className="control-btn" onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"}>
                {isMuted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="22" y1="9" x2="16" y2="15"></line><line x1="16" y1="9" x2="22" y2="15"></line></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                )}
              </button>
              <input
                type="range"
                className="volume-slider"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              />
            </div>

            <div className="time-display">
              <span className="current-time">{formatTime(currentTime)}</span>
              <span className="time-divider">/</span>
              <span className="total-time">-{formatTime(remainingTime)}</span>
            </div>
          </div>

          <div className="controls-right">
            <div className="settings-menu-wrap" ref={settingsRef}>
              <button className={`control-btn ${showSettings ? "active" : ""}`} onClick={() => setShowSettings(!showSettings)} title="Playback Settings">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </button>
              
              {showSettings && (
                <div className="settings-popover">
                  <div className="settings-group">
                    <div className="settings-title">Quality</div>
                    <div className="settings-options">
                      {qualityKeys.length > 0 ? (
                        <>
                          {qualityKeys.map((q) => (
                            <button
                              key={q}
                              className={`settings-opt-btn ${currentQuality === q ? "active" : ""}`}
                              onClick={() => handleQualityChange(q)}
                            >
                              {q}
                            </button>
                          ))}
                        </>
                      ) : (
                        <div className="settings-note">Auto (server default)</div>
                      )}
                      <button
                        className={`settings-opt-btn ${currentQuality === "default" ? "active" : ""}`}
                        onClick={() => handleQualityChange("default")}
                      >
                        Auto
                      </button>
                    </div>
                  </div>

                  <div className="settings-group">
                    <div className="settings-title">Speed</div>
                    <div className="settings-options speed-opts">
                      {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                        <button
                          key={rate}
                          className={`settings-opt-btn ${playbackRate === rate ? "active" : ""}`}
                          onClick={() => handleSpeedChange(rate)}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button className="control-btn" onClick={togglePiP} title="Picture in Picture">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="13" y="13" width="7" height="7"></rect></svg>
            </button>

            <button className="control-btn" onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4"></path></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<TeraboxResult | null>(null);
  const [activeFile, setActiveFile] = useState<TeraboxFile | null>(null);
  // The worker URL is fixed per deployment (env var). Use a const so we don't
  // carry a setter that's never called.
  const workerUrl = "https://mute-butterfly-061b.rahulmantri2002.workers.dev";
  const [currentDir, setCurrentDir] = useState<string>("");
  const [dlProgress, setDlProgress] = useState<number>(-1); // -1 = idle, 0-100 = downloading
  const [dlFileName, setDlFileName] = useState<string>("");

  const addLog = (msg: string) => {
    console.log("[TeraLink DEBUG]", msg);
  };

  async function handleDownload(streamUrl: string, filename: string) {
    if (dlProgress >= 0) return; // already downloading
    setDlFileName(filename);
    setDlProgress(0);
    try {
      // Fetch the proxied M3U8 playlist
      const absUrl = streamUrl.startsWith('http') ? streamUrl : window.location.origin + streamUrl;
      const resp = await fetch(absUrl);
      if (!resp.ok) throw new Error('Failed to fetch playlist');
      const text = await resp.text();

      // Parse segment URLs from M3U8
      const segments = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      if (!segments.length) throw new Error('No segments found');

      const baseName = filename.replace(/\.mp4$/i, '').replace(/\.mkv$/i, '') || 'video';
      const outName = baseName + '.ts';

      // Try File System Access API (Chrome desktop) for true streaming to disk
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as Window & typeof globalThis & { showSaveFilePicker: (o: object) => Promise<{ createWritable: () => Promise<{ write: (d: ArrayBuffer) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker({
            suggestedName: outName,
            types: [{ description: 'Video file', accept: { 'video/mp2t': ['.ts'] } }],
          });
          const writable = await handle.createWritable();
          for (let i = 0; i < segments.length; i++) {
            const segResp = await fetch(segments[i]);
            if (!segResp.ok) continue;
            const buf = await segResp.arrayBuffer();
            await writable.write(buf);
            setDlProgress(Math.round(((i + 1) / segments.length) * 100));
          }
          await writable.close();
          setDlProgress(-1);
          return;
        } catch (fsErr: unknown) {
          if ((fsErr as { name?: string })?.name === 'AbortError') { setDlProgress(-1); return; } // user cancelled
          // fall through to in-memory approach
        }
      }

      // Fallback: collect all segments in memory then trigger download
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < segments.length; i++) {
        const segResp = await fetch(segments[i]);
        if (!segResp.ok) continue;
        const buf = await segResp.arrayBuffer();
        chunks.push(new Uint8Array(buf));
        setDlProgress(Math.round(((i + 1) / segments.length) * 100));
      }
      const total = chunks.reduce((s, c) => s + c.byteLength, 0);
      const combined = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { combined.set(c, offset); offset += c.byteLength; }
      const blob = new Blob([combined], { type: 'video/mp2t' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err: unknown) {
      console.error('Download failed:', err);
      alert('Download failed: ' + ((err as { message?: string })?.message || String(err)));
    } finally {
      setDlProgress(-1);
      setDlFileName('');
    }
  }

 
  async function resolveLink() {
    addLog("resolveLink() called. Current link: '" + link + "'");
    try {
      const trimmed = (link || "").trim();
      addLog("Trimmed link: '" + trimmed + "'");
      if (!trimmed) {
        setError("Please paste or type a TeraBox link first.");
        addLog("Aborted: link is empty");
        return;
      }
      setError("");
      setResult(null);
      setActiveFile(null);
      setCurrentDir("");
      setStatus("Connecting to TeraBox…");
      setLoading(true);
      addLog("Sending POST request to /api/terabox...");

      const res = await fetch("/api/terabox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      addLog("HTTP response status: " + res.status);
      
      setStatus("Processing response…");
      const json: TeraboxResult = await res.json();
      addLog("API response status field: " + json.status);

      if (!res.ok || json.status !== "success") {
        const errMsg = json.error || `Request failed (${res.status})`;
        setError(errMsg);
        addLog("API error detail: " + errMsg);
        setStatus("");
        return;
      }

      setResult(json);
      addLog("Successfully loaded file list. Total files/folders: " + (json.list?.length ?? 0));

      const first =
        json.list?.find((f) => f.is_dir !== "1" && (f.stream_url || (f.fast_stream_url && Object.keys(f.fast_stream_url).length > 0))) ?? null;
      addLog("First playable file determined: " + (first ? first.name : "None"));
      setActiveFile(first);
      setStatus("Ready!");
      setTimeout(() => setStatus(""), 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addLog("Exception in resolveLink: " + message);
      setError(`Network error: ${message}`);
      setStatus("");
    } finally {
      setLoading(false);
      addLog("resolveLink() execution finished");
    }
  }

  async function openFolder(path: string) {
    setError("");
    setLoading(true);
    setStatus(`Opening folder ${path}…`);

    try {
      const res = await fetch("/api/terabox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: (link || "").trim(), dir: path }),
      });
      setStatus("Loading folder contents…");
      const json: TeraboxResult = await res.json();

      if (!res.ok || json.status !== "success") {
        setError(json.error || `Failed to open folder (${res.status})`);
        setStatus("");
        return;
      }

      setResult(json);
      setCurrentDir(path);

      // Automatically play the first video/audio in the new folder
      const first =
        json.list?.find((f) => f.is_dir !== "1" && (f.stream_url || (f.fast_stream_url && Object.keys(f.fast_stream_url).length > 0))) ?? null;
      if (first) {
        setActiveFile(first);
      }
      setStatus("");
    } catch (err: unknown) {
      setError(`Error opening folder: ${err instanceof Error ? err.message : String(err)}`);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  function renderMediaSection() {
    if (!activeFile) return null;

    const hasHls = (!!activeFile.stream_url && activeFile.stream_url.length > 0) || 
                   (activeFile.fast_stream_url && Object.keys(activeFile.fast_stream_url).length > 0);

    let playerNode = null;

    if (isVideo(activeFile.name) || hasHls) {
      playerNode = <VideoPlayer key={activeFile.fs_id} activeFile={activeFile} workerUrl={workerUrl} />;
    } else if (isAudio(activeFile.name)) {
      playerNode = (
        <div className="player-wrap audio-wrap">
          <div className="audio-icon">🎵</div>
          <p className="audio-name">{activeFile.name}</p>
          <audio controls autoPlay className="audio-el">
            <source src={activeFile.stream_url || ""} />
          </audio>
        </div>
      );
    } else if (isImage(activeFile.name)) {
      playerNode = (
        <div className="player-wrap img-wrap">
          <Image
            src={activeFile.stream_url || ""}
            alt={activeFile.name}
            className="player-img"
            width={1280}
            height={720}
            unoptimized
          />
        </div>
      );
    } else {
      playerNode = (
        <div className="player-wrap generic-wrap">
          <p className="generic-icon">📄</p>
          <p className="generic-name">{activeFile.name}</p>
          <a href={activeFile.normal_dlink || link} download={!!activeFile.normal_dlink} target="_blank" rel="noopener noreferrer" className="dl-btn">
            ⬇ {activeFile.normal_dlink ? `Download (${activeFile.size_formatted})` : "Download (via TeraBox)"}
          </a>
        </div>
      );
    }

    const isGeneric = !isVideo(activeFile.name) && !isAudio(activeFile.name) && !isImage(activeFile.name) && !hasHls;

    return (
      <div className="player-section-wrap">
        {playerNode}
        {!isGeneric && (
          <div className="active-file-details">
            <div className="file-details-meta">
              <h3>{activeFile.name}</h3>
              <span className="file-details-size">{activeFile.size_formatted}</span>
            </div>
            {activeFile.normal_dlink ? (
              <a href={activeFile.normal_dlink} className="details-dl-btn" download={activeFile.name} target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                {isVideo(activeFile.name) || hasHls ? "Download Video" : isAudio(activeFile.name) ? "Download Audio" : "Download Image"}
              </a>
            ) : activeFile.stream_url ? (
              <button
                className={`details-dl-btn${dlProgress >= 0 ? ' dl-progress-btn' : ''}`}
                onClick={() => handleDownload(activeFile.stream_url, activeFile.name)}
                disabled={dlProgress >= 0}
                title="Download video by assembling stream segments"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                {dlProgress >= 0 && dlFileName === activeFile.name
                  ? `Downloading… ${dlProgress}%`
                  : `Download Video`}
              </button>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  const jsonLdApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "TeraLink",
    "url": "https://teralink.in",
    "operatingSystem": "All",
    "applicationCategory": "MultimediaApplication",
    "offers": {
      "@type": "Offer",
      "price": "0.00",
      "priceCurrency": "USD"
    },
    "description": "TeraLink is a free online TeraBox Video Player and Downloader. Stream TeraBox videos in HD or generate direct download links — no app, no login.",
    "softwareVersion": "1.0.0",
    "featureList": [
      "TeraBox Video Streaming",
      "TeraBox Direct Download",
      "HD Quality Playback",
      "No Registration Required",
      "Works on Android and iOS",
      "Secure & Private Experience"
    ]
  };

  const jsonLdFAQ = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Can I play TeraBox videos online without the app?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes! TeraLink serves as a free online TeraBox Video Player. You can stream any shared TeraBox video directly in Chrome, Safari, Firefox, or Edge without downloading or installing any mobile apps."
        }
      },
      {
        "@type": "Question",
        "name": "How do I open a TeraBox link online?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Simply paste your TeraBox share link (from terabox.com, terasharefile.com, or 1024tera.com) into the input box on TeraLink and click Play. Your video will start streaming instantly — no login or app required."
        }
      },
      {
        "@type": "Question",
        "name": "Is TeraLink a free TeraBox downloader?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, TeraLink is 100% free. You can generate high-speed direct download links for TeraBox files with no registration, no subscription fees, and no account logins required."
        }
      },
      {
        "@type": "Question",
        "name": "Does the TeraBox player work on Android and iOS?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes! TeraLink uses HLS.js and native streaming technology, fully optimized for mobile browsers including Android Chrome and iOS Safari. No app installation is needed."
        }
      },
      {
        "@type": "Question",
        "name": "What TeraBox link formats does TeraLink support?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "TeraLink supports all major TeraBox domains including terabox.com, terasharefile.com, 1024tera.com, and teraboxapp.com."
        }
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdApp) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }}
      />
      <style>{`
        /* ── Page Layout ─────────────────────────────────────────────────── */
        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 48px 16px 100px;
          position: relative;
          z-index: 1;
        }
        .card { width: 100%; max-width: 900px; }

        /* ── Hero Header ─────────────────────────────────────────────────── */
        .header {
          text-align: center;
          margin-bottom: 40px;
          animation: fadeInDown 0.7s ease both;
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .header-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 14px;
          border-radius: 100px;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.3);
          font-size: 0.75rem;
          font-weight: 600;
          color: #a5b4fc;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 20px;
        }
        .header-badge-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #6366f1;
          box-shadow: 0 0 6px #6366f1;
          animation: pulse-dot 2s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.8); }
        }
        .header-logo {
          font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
          font-size: clamp(2.4rem, 6vw, 3.6rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.1;
          background: linear-gradient(135deg, #818cf8 0%, #a78bfa 40%, #c084fc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 12px;
        }
        .header-sub {
          font-size: 1.05rem;
          color: var(--text2);
          max-width: 520px;
          margin: 0 auto 20px;
          line-height: 1.6;
        }
        .header-pills {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 4px;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 12px;
          border-radius: 100px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 0.78rem;
          color: var(--text2);
          font-weight: 500;
        }

        /* ── Search / Input Section ──────────────────────────────────────── */
        .input-section {
          margin-bottom: 20px;
          animation: fadeInUp 0.7s 0.15s ease both;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .input-glass {
          background: rgba(17, 20, 34, 0.7);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 6px 6px 6px 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
          box-shadow: 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .input-glass:focus-within {
          border-color: rgba(99, 102, 241, 0.6);
          box-shadow: 0 4px 24px rgba(0,0,0,0.4), 0 0 0 3px rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .input-icon {
          color: var(--text3);
          flex-shrink: 0;
          display: flex;
        }
        .url-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text);
          font-size: 0.95rem;
          font-family: inherit;
          padding: 10px 0;
          min-width: 0;
        }
        .url-input::placeholder { color: var(--text3); }
        .play-btn {
          padding: 12px 28px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          color: #fff;
          font-weight: 700;
          font-size: 0.9rem;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
          white-space: nowrap;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
        }
        .play-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .play-btn:hover::after { opacity: 1; }
        .play-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 25px rgba(99, 102, 241, 0.5);
        }
        .play-btn:active { transform: translateY(0); }
        .play-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        /* ── Status / Error ──────────────────────────────────────────────── */
        .status-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 12px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          color: #a5b4fc;
          font-size: 0.88rem;
          margin-bottom: 14px;
          animation: fadeInUp 0.3s ease both;
        }
        .status-spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(99, 102, 241, 0.3);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }
        .error-box {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 14px 18px;
          border-radius: 12px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fca5a5;
          font-size: 0.88rem;
          margin-bottom: 14px;
          animation: fadeInUp 0.3s ease both;
        }

        /* ── File List ───────────────────────────────────────────────────── */
        .file-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 16px;
          animation: fadeInUp 0.5s 0.1s ease both;
        }
        .file-list-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 4px;
          margin-bottom: 4px;
        }
        .file-list-title {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--text3);
        }
        .file-list-count {
          font-size: 0.72rem;
          color: var(--text3);
          background: rgba(255,255,255,0.05);
          padding: 2px 8px;
          border-radius: 100px;
          border: 1px solid rgba(255,255,255,0.07);
        }
        .file-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 16px;
          border-radius: 12px;
          background: rgba(17, 20, 34, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.06);
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(8px);
        }
        .file-row:hover {
          border-color: rgba(255, 255, 255, 0.12);
          background: rgba(24, 28, 46, 0.8);
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }
        .file-row.active {
          border-color: rgba(99, 102, 241, 0.5);
          background: rgba(99, 102, 241, 0.1);
          box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2) inset;
        }
        .file-row.active:hover { background: rgba(99, 102, 241, 0.15); }
        .file-row.folder-row { border-left: 3px solid #f59e0b; }
        .file-row.go-back-row {
          border-style: dashed;
          background: rgba(255, 255, 255, 0.02);
          opacity: 0.75;
        }
        .file-row.go-back-row:hover { opacity: 1; transform: translateY(-1px); }
        .file-icon-wrap {
          width: 38px; height: 38px;
          border-radius: 10px;
          background: rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          flex-shrink: 0;
        }
        .file-row.active .file-icon-wrap {
          background: rgba(99, 102, 241, 0.2);
        }
        .file-meta { flex: 1; min-width: 0; }
        .file-name {
          font-size: 0.88rem;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--text);
          margin-bottom: 3px;
        }
        .file-row.active .file-name { color: #c7d2fe; }
        .file-size {
          font-size: 0.74rem;
          color: var(--text3);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .file-type-badge {
          display: inline-block;
          padding: 1px 7px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .badge-video { background: rgba(99,102,241,0.15); color: #818cf8; }
        .badge-audio { background: rgba(16,185,129,0.12); color: #34d399; }
        .badge-image { background: rgba(245,158,11,0.12); color: #fbbf24; }
        .badge-folder { background: rgba(245,158,11,0.15); color: #f59e0b; }
        .badge-file { background: rgba(255,255,255,0.05); color: var(--text3); }
        .file-dl { flex-shrink: 0; }
        .icon-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          cursor: pointer;
          padding: 6px 10px;
          color: var(--text3);
          font-size: 0.9rem;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
        }
        .icon-btn:hover {
          color: #fff;
          background: rgba(99,102,241,0.15);
          border-color: rgba(99,102,241,0.3);
        }

        /* ── Empty State ─────────────────────────────────────────────────── */
        .empty {
          padding: 72px 20px;
          text-align: center;
          border: 1.5px dashed rgba(255,255,255,0.08);
          border-radius: 20px;
          animation: fadeInUp 0.5s ease both;
        }
        .empty-icon {
          font-size: 4rem;
          margin-bottom: 16px;
          display: block;
          filter: grayscale(0.3);
        }
        .empty-title {
          color: var(--text2);
          font-size: 1.05rem;
          font-weight: 500;
          margin-bottom: 8px;
        }
        .empty-sub {
          color: var(--text3);
          font-size: 0.82rem;
        }
        .empty-domains {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 16px;
        }
        .empty-domain {
          padding: 4px 12px;
          border-radius: 100px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          font-size: 0.74rem;
          color: var(--text3);
        }

        /* ── Player Section ──────────────────────────────────────────────── */
        .player-section-wrap {
          animation: fadeInUp 0.4s ease both;
        }
        .player-section { display: flex; flex-direction: column; gap: 12px; }
        .active-file-details {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: rgba(17, 20, 34, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          margin-top: 14px;
          gap: 16px;
          backdrop-filter: blur(12px);
        }
        .file-details-meta { flex: 1; min-width: 0; }
        .file-details-meta h3 {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        }
        .file-details-size { font-size: 0.8rem; color: var(--text3); }
        .details-dl-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 600;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          color: #fff;
          text-decoration: none;
          font-size: 0.85rem;
          white-space: nowrap;
          transition: all 0.2s;
          border: none;
          cursor: pointer;
          font-family: inherit;
          box-shadow: 0 4px 14px rgba(99,102,241,0.35);
        }
        .details-dl-btn:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(99,102,241,0.45);
        }
        .details-dl-btn:disabled, .dl-progress-btn {
          opacity: 0.7;
          cursor: wait;
          background: linear-gradient(135deg, #3a4a9a, #6a3a9a);
        }

        /* ── Audio/Image/Generic Wrappers ────────────────────────────────── */
        .player-wrap { border-radius: 16px; overflow: hidden; }
        .audio-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 48px 20px;
          background: rgba(17, 20, 34, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .audio-icon { font-size: 3.5rem; }
        .audio-name { color: var(--text3); font-size: .9rem; text-align: center; }
        .audio-el { width: 100%; max-width: 480px; }
        .img-wrap {
          display: flex;
          justify-content: center;
          background: rgba(17, 20, 34, 0.7);
          padding: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .player-img { max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 10px; }
        .generic-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 56px 20px;
          background: rgba(17, 20, 34, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .generic-icon { font-size: 3.5rem; }
        .generic-name { color: var(--text3); font-size: .9rem; }
        .dl-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 600;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          color: #fff;
          text-decoration: none;
          font-size: .9rem;
          transition: all 0.2s;
          box-shadow: 0 4px 14px rgba(99,102,241,0.35);
        }
        .dl-btn:hover { transform: translateY(-1px); opacity: 0.9; }

        /* ── Custom Video Player ─────────────────────────────────────────── */
        .custom-player-container {
          position: relative;
          width: 100%;
          aspect-ratio: 16/9;
          background: #000;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
          outline: none;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.05);
          transition: border-color 0.3s ease;
        }
        .custom-player-container:focus-within {
          border-color: rgba(99, 102, 241, 0.4);
          box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 3px rgba(99,102,241,0.1);
        }
        .custom-player-container.fullscreen {
          width: 100vw;
          height: 100vh;
          aspect-ratio: auto;
          border-radius: 0;
          border: none;
        }
        .custom-player-container.hide-cursor { cursor: none; }
        .video-viewport {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .player-video {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        /* ── Buffering/Loading ───────────────────────────────────────────── */
        .player-loading-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 5;
        }
        .spinner {
          width: 48px;
          height: 48px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-left-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* ── Transient Indicator ─────────────────────────────────────────── */
        .transient-indicator-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 4;
          pointer-events: none;
        }
        .indicator-icon {
          background: rgba(0, 0, 0, 0.65);
          border-radius: 50%;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: scalePulse 0.5s ease-out forwards;
          backdrop-filter: blur(4px);
        }
        @keyframes scalePulse {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.1); opacity: 0.9; }
          100% { transform: scale(1); opacity: 0; }
        }

        /* ── Player Error ────────────────────────────────────────────────── */
        .player-error-overlay {
          position: absolute;
          inset: 0;
          background: rgba(6, 8, 18, 0.95);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 6;
          padding: 24px;
          text-align: center;
        }
        .error-icon { font-size: 3rem; margin-bottom: 16px; }
        .error-message {
          color: #fca5a5;
          max-width: 500px;
          margin-bottom: 20px;
          font-size: 0.95rem;
          line-height: 1.5;
        }
        .retry-btn {
          padding: 10px 22px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          color: var(--text);
          border-radius: 10px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
          font-family: inherit;
        }
        .retry-btn:hover {
          background: rgba(99,102,241,0.15);
          border-color: rgba(99,102,241,0.4);
        }

        /* ── Player Controls Bar ─────────────────────────────────────────── */
        .player-controls-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0.5) 70%, transparent);
          padding: 28px 20px 16px;
          z-index: 10;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.3s ease, transform 0.3s ease;
          pointer-events: none;
        }
        .player-controls-bar.visible,
        .custom-player-container:hover .player-controls-bar,
        .custom-player-container:focus-within .player-controls-bar {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }

        /* ── Timeline Scrubber ───────────────────────────────────────────── */
        .timeline-container {
          position: relative;
          width: 100%;
          height: 18px;
          display: flex;
          align-items: center;
          cursor: pointer;
          margin-bottom: 10px;
        }
        .timeline-rail {
          position: relative;
          width: 100%;
          height: 3px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 2px;
          overflow: hidden;
          transition: height 0.15s ease;
        }
        .timeline-container:hover .timeline-rail { height: 5px; }
        .timeline-bg { position: absolute; inset: 0; }
        .timeline-buffered {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 2px;
        }
        .timeline-current {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          background: linear-gradient(90deg, #6366f1, #a855f7);
          border-radius: 2px;
        }
        .timeline-slider {
          position: absolute;
          left: 0; top: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          z-index: 2;
          margin: 0;
        }

        /* ── Controls Row ────────────────────────────────────────────────── */
        .controls-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .controls-left, .controls-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .control-btn {
          background: none;
          border: none;
          color: rgba(255,255,255,0.85);
          cursor: pointer;
          padding: 8px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.18s;
          font-family: inherit;
        }
        .control-btn:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
          transform: scale(1.1);
        }
        .control-btn.active { color: #818cf8; }

        /* ── Volume ──────────────────────────────────────────────────────── */
        .volume-control-wrap {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .volume-slider {
          width: 0;
          height: 3px;
          background: rgba(255, 255, 255, 0.25);
          border-radius: 2px;
          appearance: none;
          outline: none;
          transition: width 0.25s ease, opacity 0.2s ease;
          opacity: 0;
          cursor: pointer;
        }
        .volume-control-wrap:hover .volume-slider,
        .volume-slider:focus { width: 70px; opacity: 1; }
        .volume-slider::-webkit-slider-runnable-track { background: transparent; }
        .volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 10px; height: 10px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          margin-top: -4px;
        }

        /* ── Time Display ────────────────────────────────────────────────── */
        .time-display {
          font-size: 0.75rem;
          font-variant-numeric: tabular-nums;
          color: rgba(255,255,255,0.75);
          padding: 0 4px;
        }

        /* ── Quality / Settings Panel ────────────────────────────────────── */
        .quality-wrap {
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(0,0,0,0.4);
          border-radius: 100px;
          padding: 2px;
        }
        .quality-btn {
          background: none;
          border: none;
          color: rgba(255,255,255,0.65);
          cursor: pointer;
          padding: 4px 10px;
          border-radius: 100px;
          font-size: 0.72rem;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.15s;
        }
        .quality-btn.active {
          background: linear-gradient(135deg, #6366f1, #a855f7);
          color: #fff;
        }
        .quality-btn:hover:not(.active) {
          background: rgba(255,255,255,0.1);
          color: #fff;
        }
        .settings-panel {
          position: absolute;
          bottom: calc(100% + 12px);
          right: 12px;
          background: rgba(17, 20, 34, 0.97);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px;
          padding: 16px;
          min-width: 200px;
          z-index: 20;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
          animation: fadeInUp 0.15s ease;
        }
        .settings-group { margin-bottom: 14px; }
        .settings-group:last-child { margin-bottom: 0; }
        .settings-title {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text3);
          margin-bottom: 8px;
        }
        .settings-options {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .settings-opt-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: var(--text2);
          font-size: 0.8rem;
          font-weight: 500;
          padding: 5px 12px;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
        }
        .settings-opt-btn:hover {
          background: rgba(99,102,241,0.15);
          border-color: rgba(99,102,241,0.3);
          color: #fff;
        }
        .settings-opt-btn.active {
          background: rgba(99,102,241,0.2);
          border-color: rgba(99,102,241,0.5);
          color: #a5b4fc;
        }
        .speed-opts { display: flex; gap: 6px; }

        /* ── Gesture Overlay ─────────────────────────────────────────────── */
        .gesture-overlay {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          border-radius: 12px;
          padding: 12px 20px;
          color: #fff;
          font-size: 0.9rem;
          font-weight: 600;
          z-index: 15;
          pointer-events: none;
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(255,255,255,0.1);
        }

        /* ── SEO Content Section ─────────────────────────────────────────── */
        .seo-container {
          margin-top: 64px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: fadeInUp 0.6s 0.3s ease both;
        }
        .seo-divider {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 4px;
        }
        .seo-divider-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
        }
        .seo-divider-text {
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text3);
          white-space: nowrap;
        }
        .seo-card {
          background: rgba(17, 20, 34, 0.6);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 20px;
          padding: 32px;
          position: relative;
          overflow: hidden;
          transition: border-color 0.3s ease;
        }
        .seo-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent);
        }
        .seo-card:hover {
          border-color: rgba(255, 255, 255, 0.12);
        }
        .seo-card-icon {
          width: 44px; height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2));
          border: 1px solid rgba(99,102,241,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.3rem;
          margin-bottom: 16px;
        }
        .seo-title {
          font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
          font-size: 1.25rem;
          font-weight: 700;
          color: #fff;
          margin-bottom: 14px;
          letter-spacing: -0.01em;
        }
        .seo-text {
          font-size: 0.92rem;
          line-height: 1.7;
          color: var(--text2);
          margin-bottom: 16px;
        }
        .seo-text:last-child { margin-bottom: 0; }
        .seo-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-top: 16px;
        }
        .seo-feature-item {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          transition: all 0.2s;
        }
        .seo-feature-item:hover {
          background: rgba(99,102,241,0.06);
          border-color: rgba(99,102,241,0.15);
        }
        .seo-feature-icon {
          font-size: 1.4rem;
          flex-shrink: 0;
        }
        .seo-item-title {
          font-size: 0.88rem;
          font-weight: 600;
          color: #e2e4f0;
          margin-bottom: 4px;
        }
        .seo-item-text {
          font-size: 0.8rem;
          color: var(--text3);
          line-height: 1.5;
        }

        /* ── Stats Row ───────────────────────────────────────────────────── */
        .stats-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 0;
        }
        .stat-item {
          text-align: center;
          padding: 20px 16px;
          background: rgba(17,20,34,0.6);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          backdrop-filter: blur(12px);
          transition: all 0.2s;
        }
        .stat-item:hover {
          border-color: rgba(99,102,241,0.2);
          transform: translateY(-2px);
        }
        .stat-number {
          font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
          font-size: 1.8rem;
          font-weight: 800;
          background: linear-gradient(135deg, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1;
          margin-bottom: 6px;
        }
        .stat-label {
          font-size: 0.78rem;
          color: var(--text3);
          font-weight: 500;
        }

        /* ── How-to Steps ────────────────────────────────────────────────── */
        .steps-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
          list-style: none;
          padding: 0;
          counter-reset: steps;
        }
        .step-item {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          counter-increment: steps;
        }
        .step-number {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2));
          border: 1px solid rgba(99,102,241,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          font-weight: 700;
          color: #a5b4fc;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .step-content { flex: 1; }
        .step-title { font-size: 0.9rem; font-weight: 600; color: var(--text); margin-bottom: 3px; }
        .step-desc { font-size: 0.82rem; color: var(--text3); line-height: 1.5; }

        /* ── FAQ ─────────────────────────────────────────────────────────── */
        .faq-list { display: flex; flex-direction: column; gap: 0; }
        .faq-item {
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding: 18px 0;
        }
        .faq-item:first-child { padding-top: 4px; }
        .faq-item:last-child { border-bottom: none; padding-bottom: 4px; }
        .faq-question {
          font-size: 0.92rem;
          font-weight: 600;
          color: #e2e4f0;
          margin-bottom: 8px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .faq-q-icon {
          width: 20px; height: 20px;
          border-radius: 50%;
          background: rgba(99,102,241,0.15);
          color: #818cf8;
          font-size: 0.7rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .faq-answer {
          font-size: 0.87rem;
          color: var(--text2);
          line-height: 1.65;
          padding-left: 30px;
        }

        /* ── Footer ──────────────────────────────────────────────────────── */
        .footer {
          margin-top: 72px;
          width: 100%;
          max-width: 900px;
          border-top: 1px solid rgba(255,255,255,0.06);
          padding-top: 40px;
        }
        .footer-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 40px;
          margin-bottom: 40px;
        }
        .footer-brand .footer-logo-text {
          font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
          font-size: 1.3rem;
          font-weight: 800;
          background: linear-gradient(135deg, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 10px;
        }
        .footer-brand p {
          font-size: 0.82rem;
          color: var(--text3);
          line-height: 1.6;
          max-width: 220px;
        }
        .footer-col-title {
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text3);
          margin-bottom: 14px;
        }
        .footer-links-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .footer-link {
          font-size: 0.85rem;
          color: var(--text2);
          text-decoration: none;
          transition: color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .footer-link:hover { color: #a5b4fc; }
        .footer-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,0.05);
          flex-wrap: wrap;
          gap: 12px;
        }
        .footer-copy {
          font-size: 0.78rem;
          color: var(--text3);
        }
        .footer-disclaimer {
          font-size: 0.75rem;
          color: var(--text3);
          opacity: 0.7;
          max-width: 400px;
          text-align: right;
          line-height: 1.4;
        }

        /* ── Responsive ──────────────────────────────────────────────────── */
        @media (max-width: 640px) {
          .input-glass { padding: 5px 5px 5px 14px; }
          .play-btn { padding: 12px 18px; font-size: 0.85rem; }
          .seo-grid { grid-template-columns: 1fr; }
          .stats-row { grid-template-columns: 1fr; gap: 10px; }
          .footer-grid { grid-template-columns: 1fr; gap: 28px; }
          .footer-bottom { flex-direction: column; }
          .footer-disclaimer { text-align: left; }
          .seo-card { padding: 22px; }
          .header-logo { font-size: 2.2rem; }
          .quality-wrap { display: none; }
        }
        @media (max-width: 480px) {
          .controls-left .time-display { display: none; }
        }
      `}</style>

      <div className="page">
        <div className="card">

          {/* ── Hero Header ────────────────────────────────────────────── */}
          <header className="header">
            <div className="header-badge">
              <span className="header-badge-dot" />
              Free &amp; Open · No Login Required
            </div>
            <h1 className="header-logo">⚡ TeraLink</h1>
            <p className="header-sub">
              Stream or download any TeraBox shared link — HD quality, no app install.
            </p>
            <div className="header-pills">
              <span className="pill">🎬 Video Streaming</span>
              <span className="pill">⬇️ Direct Download</span>
              <span className="pill">📱 Mobile Ready</span>
              <span className="pill">🔒 Secure &amp; Private</span>
            </div>
          </header>

          {/* ── Input Section ──────────────────────────────────────────── */}
          <div className="input-section">
            <div className="input-glass">
              <span className="input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </span>
              <input
                id="terabox-url-input"
                className="url-input"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && resolveLink()}
                placeholder="Paste your TeraBox link here… (terabox.com, terasharefile.com, 1024tera.com)"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                id="resolve-btn"
                className="play-btn"
                onClick={(e) => { e.preventDefault(); if (!loading) resolveLink(); }}
                onTouchStart={(e) => { e.preventDefault(); if (!loading) resolveLink(); }}
                disabled={loading}
                aria-label={loading ? "Resolving link…" : "Play TeraBox video"}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                    Loading…
                  </span>
                ) : "▶ Play"}
              </button>
            </div>
          </div>

          {status && (
            <div className="status-bar" role="status">
              <span className="status-spinner" />
              {status}
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── File List ──────────────────────────────────────────────── */}
          {result?.list && result.list.length > 0 && (
            <div className="file-list">
              <div className="file-list-header">
                <span className="file-list-title">Files</span>
                <span className="file-list-count">{result.list.length} item{result.list.length !== 1 ? 's' : ''}</span>
              </div>

              {currentDir && (
                <div
                  className="file-row go-back-row"
                  onClick={() => {
                    const parts = currentDir.split('/').filter(Boolean);
                    parts.pop();
                    const parent = parts.length > 0 ? '/' + parts.join('/') : '';
                    openFolder(parent);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Go to parent directory"
                >
                  <span className="file-icon-wrap">📁</span>
                  <div className="file-meta">
                    <div className="file-name">.. (Go Back)</div>
                    <div className="file-size">Parent directory</div>
                  </div>
                </div>
              )}

              {result.list.map((f) => {
                const isActive = activeFile?.fs_id === f.fs_id;
                const isFolder = f.is_dir === "1";
                const typeBadge = isFolder ? <span className="file-type-badge badge-folder">Folder</span>
                  : isVideo(f.name) ? <span className="file-type-badge badge-video">Video</span>
                  : isAudio(f.name) ? <span className="file-type-badge badge-audio">Audio</span>
                  : isImage(f.name) ? <span className="file-type-badge badge-image">Image</span>
                  : <span className="file-type-badge badge-file">File</span>;

                return (
                  <div
                    key={f.fs_id}
                    className={`file-row${isActive ? " active" : ""}${isFolder ? " folder-row" : ""}`}
                    onClick={() => {
                      if (isFolder) {
                        openFolder(f.file_path);
                      } else if (f.stream_url || (f.fast_stream_url && Object.keys(f.fast_stream_url).length > 0)) {
                        setActiveFile(f);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActive}
                    aria-label={`${isFolder ? 'Open folder' : 'Play'} ${f.name}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (isFolder) openFolder(f.file_path);
                        else if (f.stream_url || (f.fast_stream_url && Object.keys(f.fast_stream_url).length > 0)) setActiveFile(f);
                      }
                    }}
                  >
                    <span className="file-icon-wrap">{fileIcon(f)}</span>
                    <div className="file-meta">
                      <div className="file-name">{f.name}</div>
                      <div className="file-size">
                        {isFolder ? "Folder" : f.size_formatted}
                        {!isFolder && <span style={{marginLeft: '4px'}}>{typeBadge}</span>}
                      </div>
                    </div>
                    {!isFolder && (
                      <div className="file-dl" onClick={(e) => e.stopPropagation()}>
                        {f.normal_dlink ? (
                          <a className="icon-btn" href={f.normal_dlink} download={f.name} title="Download" aria-label={`Download ${f.name}`} target="_blank" rel="noopener noreferrer">⬇</a>
                        ) : f.stream_url ? (
                          <button
                            className="icon-btn"
                            onClick={() => handleDownload(f.stream_url, f.name)}
                            disabled={dlProgress >= 0}
                            title={dlProgress >= 0 && dlFileName === f.name ? `${dlProgress}%` : "Download"}
                            aria-label={`Download ${f.name}`}
                            style={{ background: 'none', border: 'none', cursor: dlProgress >= 0 ? 'wait' : 'pointer', color: 'inherit', padding: '6px 10px', font: 'inherit' }}
                          >
                            {dlProgress >= 0 && dlFileName === f.name ? `${dlProgress}%` : '⬇'}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Media Player ───────────────────────────────────────────── */}
          {activeFile ? renderMediaSection() : !result && (
            <div className="empty" role="region" aria-label="Empty state">
              <span className="empty-icon">📺</span>
              <p className="empty-title">Paste a TeraBox link above to get started</p>
              <p className="empty-sub">Stream videos instantly or generate direct download links</p>
              <div className="empty-domains" aria-label="Supported domains">
                {["terabox.com", "terasharefile.com", "1024tera.com", "teraboxapp.com"].map(d => (
                  <span key={d} className="empty-domain">{d}</span>
                ))}
              </div>
            </div>
          )}

          {/* ── SEO Content Section ─────────────────────────────────────── */}
          <section className="seo-container" aria-label="About TeraLink">

            {/* Stats Row */}
            <div className="stats-row">
              <div className="stat-item">
                <div className="stat-number">100%</div>
                <div className="stat-label">Free Forever</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">Instant</div>
                <div className="stat-label">No Login Needed</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">HD</div>
                <div className="stat-label">Video Quality</div>
              </div>
            </div>

            {/* Main Feature Card */}
            <div className="seo-card">
              <div className="seo-card-icon">⚡</div>
              <h2 className="seo-title">Free Online TeraBox Video Player &amp; Downloader</h2>
              <p className="seo-text">
                Tired of installing heavy applications just to watch a shared video? <strong style={{color:'#c7d2fe'}}>TeraLink</strong> is a completely free, browser-based <strong style={{color:'#c7d2fe'}}>TeraBox Video Player</strong> and <strong style={{color:'#c7d2fe'}}>TeraBox Link Downloader</strong>. With our clean interface, stream or download shared TeraBox links directly in high-definition (HD) from any device — no accounts, no downloads, no redirects.
              </p>
              <div className="seo-grid">
                {[
                  { icon: "🚀", title: "Fast Link Opener", desc: "Bypass TeraBox app restrictions instantly. Processes your link and opens it in seconds." },
                  { icon: "🎥", title: "HD Online Streaming", desc: "Play TeraBox videos with multiple quality options (360p, 480p, 720p, 1080p) and adaptive bitrate." },
                  { icon: "⬇️", title: "Direct Download", desc: "Generate direct download links for offline viewing. High-speed CDN — no registration needed." },
                  { icon: "🔒", title: "Secure &amp; Private", desc: "No harmful redirects, no hidden tracking. We keep your session private and your data safe." },
                ].map((item) => (
                  <div key={item.title} className="seo-feature-item">
                    <span className="seo-feature-icon">{item.icon}</span>
                    <div>
                      <div className="seo-item-title">{item.title}</div>
                      <div className="seo-item-text" dangerouslySetInnerHTML={{ __html: item.desc }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What is TeraBox */}
            <div className="seo-card">
              <div className="seo-card-icon">☁️</div>
              <h2 className="seo-title">What is TeraBox?</h2>
              <p className="seo-text">
                TeraBox is a widely-used cloud storage provider that grants users <strong style={{color:'#c7d2fe'}}>1 TB (1024 GB) of free cloud storage</strong> to back up, sync, and share files, photos, and large videos. Although highly useful for storing large media libraries, TeraBox places significant restrictions on non-registered viewers — limiting previews to 30 seconds, capping download speeds, and constantly pushing you to install their app.
              </p>
              <p className="seo-text">
                <strong style={{color:'#c7d2fe'}}>TeraLink</strong> removes these limitations. It functions as a direct web player and link opener, converting restricted shared links into clean, instantly-playable streams — right inside your browser, in full HD, with no redirects.
              </p>
            </div>

            {/* How to Use */}
            <div className="seo-card">
              <div className="seo-card-icon">📖</div>
              <h2 className="seo-title">How to Use the TeraBox Link Player</h2>
              <p className="seo-text" style={{marginBottom: '20px'}}>Getting started is simple and works on all devices — mobile phones, tablets, and desktops:</p>
              <ol className="steps-list">
                <li className="step-item">
                  <span className="step-number">1</span>
                  <div className="step-content">
                    <div className="step-title">Copy your TeraBox Share Link</div>
                    <div className="step-desc">Go to TeraBox and copy the public share link (e.g. <code style={{background:'rgba(99,102,241,0.1)',padding:'1px 6px',borderRadius:'4px',fontSize:'0.82rem',color:'#a5b4fc'}}>https://terasharefile.com/s/...</code>).</div>
                  </div>
                </li>
                <li className="step-item">
                  <span className="step-number">2</span>
                  <div className="step-content">
                    <div className="step-title">Paste the Link into TeraLink</div>
                    <div className="step-desc">Open TeraLink and paste your link into the input field at the top of this page.</div>
                  </div>
                </li>
                <li className="step-item">
                  <span className="step-number">3</span>
                  <div className="step-content">
                    <div className="step-title">Stream or Download Instantly</div>
                    <div className="step-desc">Click <strong style={{color:'#a5b4fc'}}>▶ Play</strong> to load your files. Choose to stream in-browser or save the file for offline viewing.</div>
                  </div>
                </li>
              </ol>
            </div>

            {/* FAQ */}
            <div className="seo-card">
              <div className="seo-card-icon">❓</div>
              <h2 className="seo-title">Frequently Asked Questions</h2>
              <div className="faq-list">
                {[
                  {
                    q: "Can I play TeraBox videos online without the app?",
                    a: "Yes! TeraLink serves as an online TeraBox Video Player, letting you stream any shared video directly in Chrome, Safari, Firefox, or Edge without downloading or installing any mobile apps."
                  },
                  {
                    q: "Does TeraLink support high-speed direct downloading?",
                    a: "Absolutely. Generated download links point directly to high-speed CDN servers, bypass mobile speed caps, and allow you to download files at maximum speed using any download manager or browser."
                  },
                  {
                    q: "Is TeraLink completely free to use?",
                    a: "Yes, TeraLink is 100% free and does not require registration, subscription fees, or account logins of any kind. No hidden costs, no premium tiers."
                  },
                  {
                    q: "Does the TeraBox player work on Android and iOS?",
                    a: "Yes! We use advanced native and HLS.js streaming technology, fully optimized for mobile browsers including Android Chrome and iOS Safari. No app installation needed."
                  },
                  {
                    q: "What TeraBox link formats are supported?",
                    a: "TeraLink supports all major TeraBox domains including terabox.com, terasharefile.com, 1024tera.com, teraboxapp.com and more."
                  },
                ].map((item) => (
                  <div key={item.q} className="faq-item" itemScope itemType="https://schema.org/Question">
                    <h3 className="faq-question" itemProp="name">
                      <span className="faq-q-icon">Q</span>
                      {item.q}
                    </h3>
                    <p className="faq-answer" itemProp="acceptedAnswer" itemScope itemType="https://schema.org/Answer">
                      <span itemProp="text">{item.a}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </section>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="footer" role="contentinfo">
          <div className="footer-grid">
            <div className="footer-brand">
              <div className="footer-logo-text">⚡ TeraLink</div>
              <p>Free TeraBox video player and direct link downloader. No registration, no limits.</p>
            </div>
            <div>
              <div className="footer-col-title">Legal &amp; Guides</div>
              <ul className="footer-links-list">
                <li><a href="/blog" className="footer-link">Blog &amp; Tutorials</a></li>
                <li><a href="/privacy" className="footer-link">Privacy Policy</a></li>
                <li><a href="/terms" className="footer-link">Terms &amp; Conditions</a></li>
              </ul>
            </div>
            <div>
              <div className="footer-col-title">Supported Domains</div>
              <ul className="footer-links-list">
                {["terabox.com", "terasharefile.com", "1024tera.com", "teraboxapp.com"].map(d => (
                  <li key={d}><span className="footer-link">{d}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p className="footer-copy">© {new Date().getFullYear()} TeraLink. All rights reserved. Not affiliated with TeraBox.</p>
            <p className="footer-disclaimer">We do not host any content on our servers. This service is a tool to play and download publicly shared TeraBox links.</p>
          </div>
        </footer>
      </div>
    </>
  );
}

