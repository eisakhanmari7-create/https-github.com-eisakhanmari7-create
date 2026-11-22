import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Download,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Check,
  Headphones,
  FileAudio,
  FastForward,
} from 'lucide-react';
import { GeneratedVoiceover } from '../types';
import { wavToMp3Blob } from '../utils/audioEncoder';

interface AudioPlayerProps {
  currentVoiceover: GeneratedVoiceover | null;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ currentVoiceover }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastLoadedIdRef = useRef<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  // When a new voiceover track is generated or selected, load and auto-play
  useEffect(() => {
    if (!currentVoiceover || !audioRef.current) return;
    if (lastLoadedIdRef.current === currentVoiceover.id) return;

    lastLoadedIdRef.current = currentVoiceover.id;
    setCurrentTime(0);
    setIsPlaying(false);
    audioRef.current.load();

    const playPromise = audioRef.current.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          // Autoplay policy might require manual interaction
          setIsPlaying(false);
        });
    }
  }, [currentVoiceover?.id]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.error('Play failed:', err));
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const ct = audioRef.current.currentTime;
      setCurrentTime((prev) => (Math.abs(prev - ct) > 0.1 ? ct : prev));
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const audioDuration = audioRef.current.duration;
      const validDuration =
        Number.isFinite(audioDuration) && audioDuration > 0
          ? audioDuration
          : currentVoiceover?.duration || 0;
      setDuration((prev) => (Math.abs(prev - validDuration) > 0.1 ? validDuration : prev));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 1;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const changePlaybackRate = () => {
    const rates = [0.8, 1.0, 1.25, 1.5];
    const nextIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIndex];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleDownload = (format: 'mp3' | 'wav') => {
    if (!currentVoiceover) return;

    try {
      // Decode base64 to Uint8Array
      const byteCharacters = atob(currentVoiceover.audioBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      let blob: Blob;
      if (format === 'mp3') {
        // Encode using LAME MP3 encoder at 24000Hz mono
        blob = wavToMp3Blob(byteArray.buffer, 24000, 1, 128);
      } else {
        blob = new Blob([byteArray], { type: 'audio/wav' });
      }

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const sanitizedName = (currentVoiceover.voice.name || 'voiceover')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');
      const timestamp = new Date().toISOString().slice(0, 10);
      link.download = `${sanitizedName}_${currentVoiceover.voice.accent}_${timestamp}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setDownloadSuccess(`Downloaded as .${format.toUpperCase()}`);
      setTimeout(() => setDownloadSuccess(null), 3000);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!currentVoiceover) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-center">
        <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 mx-auto flex items-center justify-center text-slate-400 mb-3">
          <Headphones className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-white mb-1">
          5. Audio Preview & Download Studio
        </h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Generate a script and click &apos;Generate Voiceover&apos; above. Your high-quality audio
          will appear here ready for playback and MP3 download.
        </p>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-700/80 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
      {/* Hidden HTML audio element */}
      <audio
        ref={audioRef}
        src={currentVoiceover.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Decorative ambient glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 p-0.5 flex items-center justify-center shadow-md">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <FileAudio className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Voiceover Master Track</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Ready
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {currentVoiceover.voice.name} • {currentVoiceover.voice.accentLabel} • {currentVoiceover.tone} tone
            </p>
          </div>
        </div>

        {/* Download Buttons Group */}
        <div className="flex items-center gap-2">
          {/* Main Download MP3 Button */}
          <button
            id="btn-download-mp3"
            type="button"
            onClick={() => handleDownload('mp3')}
            className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Download Voiceover as MP3 audio file"
          >
            <Download className="w-3.5 h-3.5 text-slate-950" />
            <span>Download MP3</span>
          </button>

          {/* Download WAV Button */}
          <button
            id="btn-download-wav"
            type="button"
            onClick={() => handleDownload('wav')}
            className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
            title="Download Voiceover in lossless Studio WAV format"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>WAV</span>
          </button>
        </div>
      </div>

      {downloadSuccess && (
        <div className="mb-3 p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-1.5 animate-fadeIn">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{downloadSuccess} - Saved to your device</span>
        </div>
      )}

      {/* Visual Soundwave Animation Bars */}
      <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 mb-4">
        <div className="flex items-center justify-between gap-1 h-12 px-2">
          {Array.from({ length: 36 }).map((_, i) => {
            const barProgress = (i / 36) * 100;
            const isPassed = barProgress <= progressPercent;
            // Generate rhythmic heights
            const baseHeights = [20, 35, 60, 85, 45, 75, 90, 65, 30, 80, 50, 70, 95, 40, 60, 80, 55, 90];
            const height = baseHeights[i % baseHeights.length];
            return (
              <div
                key={i}
                className="flex-1 flex items-center justify-center h-full"
              >
                <div
                  className={`w-full rounded-full transition-all duration-150 ${
                    isPassed
                      ? 'bg-gradient-to-t from-emerald-500 to-amber-400'
                      : 'bg-slate-800'
                  } ${isPlaying && isPassed ? 'animate-pulse' : ''}`}
                  style={{
                    height: `${height}%`,
                    maxWidth: '4px',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Seek Bar */}
      <div className="space-y-1.5 mb-4">
        <div className="relative flex items-center">
          <input
            id="audio-seek-slider"
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none"
          />
        </div>
        <div className="flex justify-between text-[11px] font-mono text-slate-400">
          <span>{formatTime(currentTime)}</span>
          <span className="text-amber-400/90 font-medium">Total: {formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls Bar: Play/Pause, Replay, Speed, Volume */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-2">
          {/* Main Play/Pause Button */}
          <button
            id="btn-toggle-play"
            type="button"
            onClick={togglePlay}
            className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/30 transition-all cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          {/* Reset to Start */}
          <button
            type="button"
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                setCurrentTime(0);
              }
            }}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Rewind to start"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Playback Rate Toggle */}
          <button
            type="button"
            onClick={changePlaybackRate}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-xs font-mono text-slate-300 hover:text-white transition-colors flex items-center gap-1"
            title="Change Playback Speed"
          >
            <FastForward className="w-3 h-3 text-amber-400" />
            <span>{playbackRate}x</span>
          </button>
        </div>

        {/* Volume Slider */}
        <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={toggleMute}
            className="text-slate-400 hover:text-white transition-colors"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-slate-300" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 sm:w-24 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-400"
            title="Volume"
          />
        </div>
      </div>
    </div>
  );
};
