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
    const defQuality = keys.includes("Original (Full)")
      ? "Original (Full)"
      : (keys.includes("360p") ? "360p" : (keys[0] || "default"));
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
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().catch(err => {
        console.error("Fullscreen error:", err);
      });
    } else {
      document.exitFullscreen();
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

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = streamUrl.includes(".m3u8") || 
                  streamUrl.includes("/stream?url=") || 
                  streamUrl.includes("/fast_stream?");

    if (isHls) {
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
      video.src = streamUrl;
      video.load();
      if (previousTime > 0) {
        video.currentTime = previousTime;
      }
      if (wasPlaying) {
        video.play().catch(() => {});
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentStreamUrl, retryCount]);

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
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
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
    const handleMouseMove = () => {
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
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("mouseleave", () => {
        if (isPlaying) {
          setShowControls(false);
        }
      });
    }

    return () => {
      if (container) {
        container.removeEventListener("mousemove", handleMouseMove);
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

  const handleVideoClick = () => {
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
          crossOrigin="anonymous"
          autoPlay
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onProgress={handleProgress}
          onClick={handleVideoClick}
          onDoubleClick={toggleFullscreen}
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

// ─── main component ───────────────────────────────────────────────────────────

export default function Home() {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<TeraboxResult | null>(null);
  const [activeFile, setActiveFile] = useState<TeraboxFile | null>(null);
  const [workerUrl, setWorkerUrl] = useState<string>("https://mute-butterfly-061b.rahulmantri2002.workers.dev");

  useEffect(() => {
    // Dynamic config pickup if available
    const workerEnv = process.env.NEXT_PUBLIC_TERABOX_WORKER_URL;
    if (workerEnv) {
      setWorkerUrl(workerEnv);
    }
  }, []);

  async function resolveLink() {
    if (!link.trim()) return;
    setError("");
    setResult(null);
    setActiveFile(null);
    setStatus("Connecting to TeraBox…");
    setLoading(true);

    try {
      const res = await fetch("/api/terabox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link.trim() }),
      });
      setStatus("Processing response…");
      const json: TeraboxResult = await res.json();

      if (!res.ok || json.status !== "success") {
        setError(json.error || `Request failed (${res.status})`);
        setStatus("");
        return;
      }

      setResult(json);

      const first =
        json.list?.find((f) => f.is_dir !== "1" && (f.stream_url || (f.fast_stream_url && Object.keys(f.fast_stream_url).length > 0))) ?? null;
      setActiveFile(first);
      setStatus("Ready!");
      setTimeout(() => setStatus(""), 2000);
    } catch (err: any) {
      setError(`Network error: ${err?.message ?? String(err)}`);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  function renderMediaSection() {
    if (!activeFile) return null;

    const hasHls = (!!activeFile.stream_url && activeFile.stream_url.length > 0) || 
                   (activeFile.fast_stream_url && Object.keys(activeFile.fast_stream_url).length > 0);

    if (isVideo(activeFile.name) || hasHls) {
      return <VideoPlayer activeFile={activeFile} workerUrl={workerUrl} />;
    }

    if (isAudio(activeFile.name)) {
      return (
        <div className="player-wrap audio-wrap">
          <div className="audio-icon">🎵</div>
          <p className="audio-name">{activeFile.name}</p>
          <audio controls autoPlay className="audio-el">
            <source src={activeFile.stream_url || ""} />
          </audio>
        </div>
      );
    }

    if (isImage(activeFile.name)) {
      return (
        <div className="player-wrap img-wrap">
          <img src={activeFile.stream_url || ""} alt={activeFile.name} className="player-img" />
        </div>
      );
    }

    return (
      <div className="player-wrap generic-wrap">
        <p className="generic-icon">📄</p>
        <p className="generic-name">{activeFile.name}</p>
        <a href={activeFile.normal_dlink || "#"} download className="dl-btn">
          ⬇ Download ({activeFile.size_formatted})
        </a>
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

        .input-row { display: flex; gap: 10px; margin-bottom: 14px; }
        .url-input { flex: 1; background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--radius); padding: 14px 18px; color: var(--text); outline: none; }
        .play-btn { padding: 14px 28px; border-radius: var(--radius); border: none; background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #fff; font-weight: 600; cursor: pointer; }
        .status-bar { padding: 12px 16px; border-radius: 10px; background: rgba(92,110,248,.12); color: #a0aaff; margin-bottom: 14px; }
        .error-box { padding: 14px 18px; border-radius: 10px; background: rgba(239,68,68,.1); color: #fca5a5; margin-bottom: 14px; }

        .file-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .file-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 10px; background: var(--surface); border: 1.5px solid var(--border); cursor: pointer; }
        .file-row.active { border-color: var(--accent); background: rgba(92,110,248,.1); }
        .file-icon { font-size: 1.4rem; }
        .file-meta { flex: 1; min-width: 0; }
        .file-name { font-size: .9rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .file-size { font-size: .78rem; color: var(--muted); }
        .file-dl { flex-shrink: 0; }
        .icon-btn { background: none; border: none; cursor: pointer; padding: 6px 8px; color: var(--muted); font-size: 1rem; }

        .player-section { display: flex; flex-direction: column; gap: 12px; }
        
        /* Custom Player Container */
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
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          max-width: none !important;
          max-height: none !important;
          border-radius: 0 !important;
          border: none !important;
          z-index: 99999 !important;
        }

        .video-viewport {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
        }

        .player-video {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }

        /* Glassmorphic Controls Bar */
        .player-controls-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 20px 20px 14px;
          background: linear-gradient(to top, rgba(11, 13, 18, 0.95) 0%, rgba(11, 13, 18, 0.6) 65%, rgba(11, 13, 18, 0) 100%);
          backdrop-filter: blur(12px) saturate(180%);
          display: flex;
          flex-direction: column;
          gap: 12px;
          z-index: 5;
          transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          opacity: 0;
          pointer-events: none;
          transform: translateY(10px);
        }

        .player-controls-bar.visible {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }

        .custom-player-container.hide-cursor {
          cursor: none;
        }

        /* Timeline Scrubber */
        .timeline-container {
          position: relative;
          width: 100%;
          height: 16px;
          display: flex;
          align-items: center;
          cursor: pointer;
        }

        .timeline-rail {
          position: relative;
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 2px;
          overflow: hidden;
          transition: height 0.1s ease;
        }

        .timeline-container:hover .timeline-rail {
          height: 6px;
        }

        .timeline-bg, .timeline-buffered, .timeline-current {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          height: 100%;
          border-radius: 2px;
        }

        .timeline-buffered {
          background: rgba(255, 255, 255, 0.25);
          transition: width 0.2s ease;
        }

        .timeline-current {
          background: linear-gradient(90deg, var(--accent), var(--accent2));
        }

        .timeline-slider {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          opacity: 0;
          cursor: pointer;
          -webkit-appearance: none;
        }

        /* Controls Row Layout */
        .controls-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .controls-left, .controls-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .control-btn {
          background: none;
          border: none;
          color: #fff;
          cursor: pointer;
          padding: 6px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s ease, transform 0.1s ease;
          width: 32px;
          height: 32px;
        }

        .control-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: scale(1.05);
        }

        .control-btn:active {
          transform: scale(0.95);
        }
        
        .control-btn.active {
          color: var(--accent);
          background: rgba(92, 110, 248, 0.15);
        }

        /* Volume Control */
        .volume-control-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .volume-slider {
          width: 0;
          height: 4px;
          -webkit-appearance: none;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          outline: none;
          transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
          opacity: 0;
          cursor: pointer;
        }

        .volume-control-wrap:hover .volume-slider,
        .volume-slider:focus {
          width: 70px;
          opacity: 1;
        }

        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
        }

        /* Time display */
        .time-display {
          color: rgba(255, 255, 255, 0.8);
          font-size: 0.8rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 4px;
          user-select: none;
          font-variant-numeric: tabular-nums;
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
          backdrop-filter: blur(16px);
          border: 1.5px solid var(--border);
          border-radius: 12px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 220px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
          z-index: 10;
          animation: slideUp 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes slideUp {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .settings-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .settings-title {
          color: var(--muted);
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 4px;
        }

        .settings-options {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 150px;
          overflow-y: auto;
        }

        .settings-opt-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          text-align: left;
          padding: 6px 10px;
          font-size: 0.8rem;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .settings-opt-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }

        .settings-opt-btn.active {
          background: rgba(92, 110, 248, 0.15);
          color: var(--accent);
          font-weight: 600;
        }

        .speed-opts {
          flex-direction: row;
          flex-wrap: wrap;
          gap: 4px;
        }

        .speed-opts .settings-opt-btn {
          flex: 1 1 30%;
          text-align: center;
          justify-content: center;
          padding: 4px;
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

        /* Transient Icons */
        .transient-indicator-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 4;
        }

        .indicator-icon {
          background: rgba(11, 13, 18, 0.85);
          border-radius: 50%;
          width: 72px;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: scaleFade 0.5s ease-out forwards;
          backdrop-filter: blur(4px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        @keyframes scaleFade {
          0% { transform: scale(0.6); opacity: 0; }
          50% { transform: scale(1.1); opacity: 0.9; }
          100% { transform: scale(1); opacity: 0; }
        }

        .player-error-overlay {
          position: absolute;
          inset: 0;
          background: rgba(11, 13, 18, 0.95);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          z-index: 10;
          padding: 24px;
          text-align: center;
        }

        .error-icon {
          font-size: 2.2rem;
        }

        .error-message {
          font-size: 0.95rem;
          color: #fca5a5;
          max-width: 400px;
          line-height: 1.4;
        }

        .retry-btn {
          padding: 10px 24px;
          border-radius: 8px;
          border: none;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .retry-btn:hover {
          opacity: 0.9;
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
        .footer { margin-top: 32px; text-align: center; font-size: .78rem; color: var(--border); }
      `}</style>

      <div className="page">
        <div className="card">
          <div className="header">
            <div className="header-logo">⚡ TeraLink</div>
            <p className="header-sub">Stream or download any TeraBox share link — no ads, no redirects</p>
          </div>
          <div className="input-row">
            <input className="url-input" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !loading && resolveLink()} placeholder="Paste TeraBox link..." />
            <button className="play-btn" onClick={resolveLink} disabled={loading}>{loading ? "Resolving…" : "▶ Play"}</button>
          </div>
          {status && <div className="status-bar">{status}</div>}
          {error && <div className="error-box">{error}</div>}
          {result?.list && result.list.length > 0 && (
            <div className="file-list">
              {result.list.map((f) => (
                <div
                  key={f.fs_id}
                  className={`file-row${activeFile?.fs_id === f.fs_id ? " active" : ""}`}
                  onClick={() => {
                    if (f.is_dir !== "1" && (f.stream_url || (f.fast_stream_url && Object.keys(f.fast_stream_url).length > 0))) {
                      setActiveFile(f);
                    }
                  }}
                >
                  <span className="file-icon">{fileIcon(f)}</span>
                  <div className="file-meta">
                    <div className="file-name">{f.name}</div>
                    <div className="file-size">{f.size_formatted}</div>
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
        </div>
        <div className="footer">TeraLink — your own TeraBox streaming server</div>
      </div>
    </>
  );
}
