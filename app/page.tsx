"use client";

import { useState, useRef, useEffect } from "react";
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

  const [currentQuality, setCurrentQuality] = useState<string>("default");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [transientIndicator, setTransientIndicator] = useState<"play" | "pause" | "forward" | "rewind" | null>(null);
  
  const indicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Set default quality when activeFile changes
  useEffect(() => {
    const qualities = activeFile.fast_stream_url || {};
    const keys = Object.keys(qualities).filter(k => qualities[k]);
    const defQuality = keys.includes("480p")
      ? "480p"
      : (keys.includes("360p")
        ? "360p"
        : (keys.includes("720p")
          ? "720p"
          : (keys.includes("Original (Full)")
            ? "Original (Full)"
            : (keys[0] || "default"))));
    setCurrentQuality(defQuality);
  }, [activeFile.fs_id, activeFile.fast_stream_url]);

  const getAbsoluteUrl = (pathOrUrl: string) => {
    if (!pathOrUrl) return "";
    
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

    if (!document.fullscreenElement) {
      if (wrapper.requestFullscreen) {
        wrapper.requestFullscreen().catch(err => {
          console.error("Fullscreen error:", err);
          if (video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
          }
        });
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
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
        setIsPiP(false);
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        setIsPiP(true);
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
        const hls = new Hls({
          enableWorker: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          lowLatencyMode: true,
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
  }, [currentStreamUrl, retryCount]);

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
  }, [isPlaying, volume, isMuted, duration]);

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
          playsInline
          webkitPlaysInline={true}
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
                  {qualityKeys.length > 0 && (
                    <div className="settings-group">
                      <div className="settings-title">Quality</div>
                      <div className="settings-options">
                        {qualityKeys.map((q) => (
                          <button
                            key={q}
                            className={`settings-opt-btn ${currentQuality === q ? "active" : ""}`}
                            onClick={() => handleQualityChange(q)}
                          >
                            {q}
                          </button>
                        ))}
                        <button
                          className={`settings-opt-btn ${currentQuality === "default" ? "active" : ""}`}
                          onClick={() => handleQualityChange("default")}
                        >
                          Auto (Preview)
                        </button>
                      </div>
                    </div>
                  )}

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
  const [workerUrl, setWorkerUrl] = useState<string>("https://mute-butterfly-061b.rahulmantri2002.workers.dev");
  const [currentDir, setCurrentDir] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    console.log("[TeraLink DEBUG]", msg);
    setLogs(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  useEffect(() => {
    try {
      addLog("Home mounted");
      addLog("Default Worker: " + workerUrl);
      
      // Safe environment variable check
      let workerEnv = "";
      if (typeof process !== "undefined" && process.env) {
        workerEnv = process.env.NEXT_PUBLIC_TERABOX_WORKER_URL || "";
      }
      
      if (workerEnv) {
        setWorkerUrl(workerEnv);
        addLog("Worker overridden by env: " + workerEnv);
      }
    } catch (err: any) {
      console.error("Error in mount useEffect:", err);
      setLogs(prev => [...prev, `Mount error: ${err?.message ?? String(err)}`]);
    }
  }, []);

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
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      addLog("Exception in resolveLink: " + errMsg);
      setError(`Network error: ${errMsg}`);
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
    } catch (err: any) {
      setError(`Error opening folder: ${err?.message ?? String(err)}`);
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
      playerNode = <VideoPlayer activeFile={activeFile} workerUrl={workerUrl} />;
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
          <img src={activeFile.stream_url || ""} alt={activeFile.name} className="player-img" />
        </div>
      );
    } else {
      playerNode = (
        <div className="player-wrap generic-wrap">
          <p className="generic-icon">📄</p>
          <p className="generic-name">{activeFile.name}</p>
          <a href={activeFile.normal_dlink || "#"} download className="dl-btn">
            ⬇ Download ({activeFile.size_formatted})
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
            {activeFile.normal_dlink && (
              <a href={activeFile.normal_dlink} className="details-dl-btn" download={activeFile.name}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                {isVideo(activeFile.name) || hasHls ? "Download Video" : isAudio(activeFile.name) ? "Download Audio" : "Download Image"}
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <style>{`
        /* Reset & base styling */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg:       #0b0d12;
          --surface:  #12151e;
          --surface2: #1a1e2b;
          --border:   #252836;
          --accent:   #5c6ef8;
          --accent2:  #9b5cf8;
          --text:     #e8eaf6;
          --muted:    #7b82a8;
          --radius:   14px;
        }
        html, body { min-height: 100vh; background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; }

        .page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 16px 80px; }
        .card { width: 100%; max-width: 860px; }

        .header { text-align: center; margin-bottom: 36px; }
        .header-logo { font-size: 2.6rem; font-weight: 800; background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .header-sub { color: var(--muted); font-size: .93rem; margin-top: 6px; }

        .input-row { display: flex; gap: 10px; margin-bottom: 14px; transition: all 0.3s ease; }
        .url-input { flex: 1; background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius); padding: 14px 18px; color: var(--text); outline: none; transition: all 0.2s ease-in-out; }
        .url-input:hover { border-color: rgba(92, 110, 248, 0.4); }
        .url-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(92, 110, 248, 0.15); }
        .play-btn { padding: 14px 28px; border-radius: var(--radius); border: none; background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #fff; font-weight: 600; cursor: pointer; transition: all 0.2s ease-in-out; }
        .play-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .play-btn:active { transform: translateY(0); }
        .status-bar { padding: 12px 16px; border-radius: 10px; background: rgba(92,110,248,.12); color: #a0aaff; margin-bottom: 14px; }
        .error-box { padding: 14px 18px; border-radius: 10px; background: rgba(239,68,68,.1); color: #fca5a5; margin-bottom: 14px; }

        .file-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .file-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 10px; background: var(--surface); border: 1.5px solid var(--border); cursor: pointer; transition: all 0.2s ease-in-out; }
        .file-row:hover { border-color: rgba(255, 255, 255, 0.15); background: var(--surface2); transform: translateY(-1px); }
        .file-row.active { border-color: var(--accent); background: rgba(92,110,248,.14); }
        .file-row.active:hover { background: rgba(92,110,248,.18); }
        .file-row.folder-row { border-left: 4px solid #f59e0b; }
        .file-row.go-back-row { border-style: dashed; background: rgba(255, 255, 255, 0.02); opacity: 0.85; }
        .file-row.go-back-row:hover { background: rgba(255, 255, 255, 0.05); opacity: 1; transform: translateY(-1px); }
        .file-icon { font-size: 1.4rem; }
        .file-meta { flex: 1; min-width: 0; }
        .file-name { font-size: .9rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .file-size { font-size: .78rem; color: var(--muted); }
        .file-dl { flex-shrink: 0; }
        .icon-btn { background: none; border: none; cursor: pointer; padding: 6px 8px; color: var(--muted); font-size: 1rem; transition: color 0.2s; }
        .icon-btn:hover { color: #fff; }

        .player-section { display: flex; flex-direction: column; gap: 12px; }
        
        .active-file-details {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius);
          margin-top: 14px;
          gap: 16px;
        }
        .file-details-meta {
          flex: 1;
          min-width: 0;
        }
        .file-details-meta h3 {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        }
        .file-details-size {
          font-size: 0.8rem;
          color: var(--muted);
        }
        .details-dl-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          color: #fff;
          text-decoration: none;
          font-size: 0.85rem;
          white-space: nowrap;
          transition: opacity 0.2s;
        }
        .details-dl-btn:hover {
          opacity: 0.9;
        }

        /* Loading Spinner */
        .player-loading-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 3;
        }

        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-left-color: var(--accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .audio-wrap { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 20px; background: var(--surface); }
        .audio-icon { font-size: 3rem; }
        .audio-name { color: var(--muted); font-size: .9rem; }
        .audio-el { width: 100%; max-width: 480px; }
        .img-wrap { display: flex; justify-content: center; background: var(--surface); padding: 12px; }
        .player-img { max-width: 100%; max-height: 70vh; object-fit: contain; border-radius: 8px; }
        .generic-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 48px 20px; background: var(--surface); }
        .generic-icon { font-size: 3.5rem; }
        .generic-name { color: var(--muted); font-size: .9rem; }
        .dl-btn { display: inline-flex; align-items: center; gap: 6px; padding: 12px 24px; border-radius: 10px; font-weight: 600; background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #fff; text-decoration: none; font-size: .9rem; }

        .empty { padding: 60px 20px; text-align: center; border: 1.5px dashed var(--border); border-radius: var(--radius); }
        .empty-icon { font-size: 3.5rem; }
        .empty-title { color: var(--muted); font-size: 1rem; }
        .empty-sub { color: var(--border); font-size: .83rem; }
        /* Custom Video Player Styles */
        .custom-player-container {
          position: relative;
          width: 100%;
          aspect-ratio: 16/9;
          background: #000;
          border-radius: var(--radius);
          border: 1.5px solid var(--border);
          overflow: hidden;
          outline: none;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          transition: border-color 0.3s ease;
        }
        .custom-player-container:focus-within {
          border-color: var(--accent);
        }
        .custom-player-container.fullscreen {
          width: 100vw;
          height: 100vh;
          aspect-ratio: auto;
          border-radius: 0;
          border: none;
        }
        .custom-player-container.hide-cursor {
          cursor: none;
        }

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

        /* Loading / Buffering */
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
          width: 50px;
          height: 50px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-left-color: var(--accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        /* Transient Indicators (play/pause overlay animations) */
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
          background: rgba(0, 0, 0, 0.6);
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

        /* Player Error */
        .player-error-overlay {
          position: absolute;
          inset: 0;
          background: rgba(11, 13, 18, 0.95);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 6;
          padding: 24px;
          text-align: center;
        }
        .error-icon {
          font-size: 3rem;
          margin-bottom: 16px;
        }
        .error-message {
          color: #fca5a5;
          max-width: 500px;
          margin-bottom: 20px;
          font-size: 0.95rem;
          line-height: 1.5;
        }
        .retry-btn {
          padding: 10px 20px;
          background: var(--surface2);
          border: 1.5px solid var(--border);
          color: var(--text);
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
        }
        .retry-btn:hover {
          background: var(--border);
          border-color: var(--accent);
        }

        /* Control Bar Container */
        .player-controls-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(11, 13, 18, 0.95), rgba(11, 13, 18, 0.4) 70%, transparent);
          padding: 24px 20px 16px;
          z-index: 10;
          opacity: 0;
          transform: translateY(10px);
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

        /* Timeline Scrubber */
        .timeline-container {
          position: relative;
          width: 100%;
          height: 16px;
          display: flex;
          align-items: center;
          cursor: pointer;
          margin-bottom: 12px;
        }
        .timeline-rail {
          position: relative;
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          overflow: hidden;
          transition: height 0.1s ease;
        }
        .timeline-container:hover .timeline-rail {
          height: 6px;
        }
        .timeline-bg {
          position: absolute;
          inset: 0;
        }
        .timeline-buffered {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.35);
          border-radius: 2px;
        }
        .timeline-current {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          background: linear-gradient(90deg, var(--accent), var(--accent2));
          border-radius: 2px;
        }
        .timeline-slider {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          z-index: 2;
          margin: 0;
        }

        /* Controls Row */
        .controls-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .controls-left, .controls-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .control-btn {
          background: none;
          border: none;
          color: #fff;
          opacity: 0.85;
          cursor: pointer;
          padding: 8px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .control-btn:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.1);
          transform: scale(1.08);
        }
        .control-btn.active {
          color: var(--accent);
          opacity: 1;
        }

        /* Volume Controls */
        .volume-control-wrap {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .volume-slider {
          width: 0;
          height: 4px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 2px;
          appearance: none;
          outline: none;
          transition: width 0.25s ease, opacity 0.2s ease;
          opacity: 0;
          cursor: pointer;
        }
        .volume-control-wrap:hover .volume-slider,
        .volume-slider:focus {
          width: 70px;
          opacity: 1;
        }
        .volume-slider::-webkit-slider-runnable-track {
          background: transparent;
        }
        .volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 0 2px rgba(0,0,0,0.5);
          margin-top: -3px;
        }

        /* Time Display */
        .time-display {
          font-size: 0.82rem;
          color: rgba(255, 255, 255, 0.8);
          font-weight: 500;
          margin-left: 6px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .time-divider {
          color: rgba(255, 255, 255, 0.4);
        }
        .total-time {
          color: rgba(255, 255, 255, 0.55);
        }

        /* Settings Menu & Popover */
        .settings-menu-wrap {
          position: relative;
        }
        .settings-popover {
          position: absolute;
          bottom: 45px;
          right: 0;
          background: rgba(18, 21, 30, 0.95);
          backdrop-filter: blur(12px);
          border: 1.5px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          width: 240px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
          z-index: 12;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .settings-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .settings-title {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--muted);
          font-weight: 700;
          border-bottom: 1.5px solid var(--border);
          padding-bottom: 6px;
        }
        .settings-options {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .settings-opt-btn {
          flex: 1;
          min-width: 60px;
          background: var(--surface2);
          border: 1px solid var(--border);
          color: var(--text);
          font-size: 0.78rem;
          padding: 6px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }
        .settings-opt-btn:hover {
          border-color: var(--accent);
          background: rgba(92, 110, 248, 0.15);
        }
        .settings-opt-btn.active {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
          font-weight: 600;
        }

        .footer { margin-top: 32px; text-align: center; font-size: .78rem; color: var(--border); }

        /* Mobile responsive adjustments */
        @media (max-width: 768px) {
          .page {
            padding: 24px 12px 60px;
          }
          .header {
            margin-bottom: 24px;
          }
          .header-logo {
            font-size: 2.1rem;
          }
          .custom-player-container {
            border-radius: 8px;
          }
          .active-file-details {
            padding: 12px 14px;
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }
          .details-dl-btn {
            justify-content: center;
            padding: 12px;
            font-size: 0.9rem;
          }
          .file-row {
            padding: 10px 12px;
          }
          .file-name {
            font-size: 0.85rem;
          }
        }

        @media (max-width: 520px) {
          .input-row {
            flex-direction: column;
            gap: 8px;
          }
          .url-input {
            width: 100%;
            padding: 12px 16px;
            font-size: 0.9rem;
            border-radius: 10px;
          }
          .play-btn {
            width: 100%;
            padding: 12px;
            font-size: 0.95rem;
            border-radius: 10px;
          }
          .player-controls-bar {
            padding: 16px 12px 10px;
          }
          .timeline-container {
            margin-bottom: 8px;
            height: 20px;
          }
          .volume-control-wrap {
            display: none;
          }
          .control-btn[title="Picture in Picture"] {
            display: none;
          }
          .control-btn {
            padding: 6px;
          }
          .time-display {
            font-size: 0.75rem;
            margin-left: 2px;
          }
          .controls-left, .controls-right {
            gap: 6px;
          }
          .settings-popover {
            width: 200px;
            padding: 12px;
            bottom: 40px;
          }
          .settings-opt-btn {
            font-size: 0.72rem;
            padding: 4px;
            min-width: 50px;
          }
        }
      `}</style>

      <div className="page">
        <div className="card">
          <div className="header">
            <div className="header-logo">⚡ TeraLink</div>
            <p className="header-sub">Stream or download any TeraBox share link — no ads, no redirects</p>
          </div>
          <div className="input-row">
            <input className="url-input" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !loading && resolveLink()} placeholder="Paste TeraBox link..." />
            <button 
              className="play-btn" 
              onClick={(e) => { e.preventDefault(); if (!loading) resolveLink(); }} 
              onTouchStart={(e) => { e.preventDefault(); if (!loading) resolveLink(); }} 
              disabled={loading}
            >
              {loading ? "Resolving…" : "▶ Play"}
            </button>
          </div>
          {status && <div className="status-bar">{status}</div>}
          {error && <div className="error-box">{error}</div>}
          {result?.list && result.list.length > 0 && (
            <div className="file-list">
              {currentDir && (
                <div
                  className="file-row go-back-row"
                  onClick={() => {
                    const parts = currentDir.split('/').filter(Boolean);
                    parts.pop();
                    const parent = parts.length > 0 ? '/' + parts.join('/') : '';
                    openFolder(parent);
                  }}
                >
                  <span className="file-icon">📁</span>
                  <div className="file-meta">
                    <div className="file-name">.. (Go Back)</div>
                    <div className="file-size">Parent directory</div>
                  </div>
                </div>
              )}
              {result.list.map((f) => (
                <div
                  key={f.fs_id}
                  className={`file-row${activeFile?.fs_id === f.fs_id ? " active" : ""}${f.is_dir === "1" ? " folder-row" : ""}`}
                  onClick={() => {
                    if (f.is_dir === "1") {
                      openFolder(f.file_path);
                    } else if (f.stream_url || (f.fast_stream_url && Object.keys(f.fast_stream_url).length > 0)) {
                      setActiveFile(f);
                    }
                  }}
                >
                  <span className="file-icon">{fileIcon(f)}</span>
                  <div className="file-meta">
                    <div className="file-name">{f.name}</div>
                    <div className="file-size">{f.is_dir === "1" ? "Folder" : f.size_formatted}</div>
                  </div>
                  {f.is_dir !== "1" && f.normal_dlink && (
                    <div className="file-dl" onClick={(e) => e.stopPropagation()}>
                      <a className="icon-btn" href={f.normal_dlink} download={f.name} title="Download">⬇</a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeFile ? renderMediaSection() : !result && (
            <div className="empty">
              <div className="empty-icon">📺</div>
              <p className="empty-title">Paste a TeraBox link above and click Play</p>
              <p className="empty-sub">terabox.com · terasharefile.com · 1024tera.com · teraboxapp.com</p>
            </div>
          )}

          {/* Visual Debug Console Logs */}
          <div className="debug-logs-panel" style={{
            marginTop: "24px",
            padding: "16px",
            background: "#181b24",
            border: "1.5px solid var(--border)",
            borderRadius: "var(--radius)",
            fontSize: "0.78rem",
            fontFamily: "monospace",
            color: "#a0aaff",
            maxHeight: "180px",
            overflowY: "auto",
            textAlign: "left",
            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", borderBottom: "1px dashed var(--border)", paddingBottom: "6px" }}>
              <span style={{ fontWeight: "700", color: "#e8eaf6" }}>Mobile Debug Console:</span>
              <button 
                onClick={() => setLogs([])} 
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.72rem" }}
              >
                Clear Logs
              </button>
            </div>
            {logs.length === 0 ? (
              <div style={{ color: "var(--muted)", fontStyle: "italic" }}>Console is empty. Paste a link and tap "Play" to capture event traces.</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} style={{ padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{log}</div>
              ))
            )}
          </div>
        </div>
        <div className="footer">TeraLink — your own TeraBox streaming server</div>
      </div>
    </>
  );
}
