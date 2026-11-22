import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Square,
  RotateCw,
  Clock,
  Activity,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  Volume2,
  Sparkles,
  User,
  Heart,
  Baby,
  BookOpen,
} from 'lucide-react';
import { VoiceOption, VoiceFilter, SpeakingStyle } from '../types';
import { extractRetryDelayFromError, isQuotaError } from './FriendlyErrorBox';

interface VoiceLibraryPickerProps {
  voices: VoiceOption[];
  selectedVoiceId: string;
  onSelectVoice: (voice: VoiceOption) => void;
  language: 'urdu' | 'hindi' | 'english';
  speakingStyle: SpeakingStyle;
  favorites: string[];
  onToggleFavorite: (voiceId: string) => void;
  activeFilter: VoiceFilter;
  setActiveFilter: (filter: VoiceFilter) => void;
  sessionApiCalls: number;
  previewCallsCount: number;
  cooldownSecondsLeft: number;
  onRecordApiCall: (type: 'preview' | 'general') => void;
  onTriggerCooldown: (seconds: number) => void;
}

export const VoiceLibraryPicker: React.FC<VoiceLibraryPickerProps> = ({
  voices,
  selectedVoiceId,
  onSelectVoice,
  language,
  speakingStyle,
  favorites,
  onToggleFavorite,
  sessionApiCalls,
  previewCallsCount,
  cooldownSecondsLeft,
  onRecordApiCall,
  onTriggerCooldown,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [unifiedNotice, setUnifiedNotice] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlsMap = useRef<Map<string, string>>(new Map());

  // Cached preview set for free replay
  const [cachedVoiceIds, setCachedVoiceIds] = useState<Set<string>>(new Set());

  // Find the currently selected voice object or fallback to first
  const selectedVoice = voices.find((v) => v.id === selectedVoiceId) || voices[0];

  // Cache key generator: voiceId + language + speakingStyle
  const getCacheKey = useCallback(
    (voiceId: string) => `tts_prev_${voiceId}_${language}_${speakingStyle}`,
    [language, speakingStyle]
  );

  // Convert base64 audio to object URL
  const base64ToBlobUrl = (base64: string, mimeType = 'audio/wav'): string => {
    const byteChars = atob(base64);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNums[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNums);
    const blob = new Blob([byteArray], { type: mimeType });
    return URL.createObjectURL(blob);
  };

  const getStoredPreview = (cacheKey: string): string | null => {
    try {
      return localStorage.getItem(`tts_cache_${cacheKey}`);
    } catch {
      return null;
    }
  };

  const setStoredPreview = (cacheKey: string, base64: string) => {
    try {
      localStorage.setItem(`tts_cache_${cacheKey}`, base64);
    } catch (e) {
      console.warn('localStorage full or restricted for TTS caching', e);
    }
  };

  // Sync cached voices
  useEffect(() => {
    const newCachedSet = new Set<string>();
    voices.forEach((v) => {
      const key = getCacheKey(v.id);
      if (previewUrlsMap.current.has(key) || getStoredPreview(key)) {
        newCachedSet.add(v.id);
      }
    });
    setCachedVoiceIds(newCachedSet);
  }, [voices, language, speakingStyle, getCacheKey]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Audio cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = '';
      }
      previewUrlsMap.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsMap.current.clear();
    };
  }, []);

  // Stop playback when language changes
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    setPreviewingVoiceId(null);
  }, [language]);

  // Helper to get category styling & icon
  const getCategoryInfo = (voice: VoiceOption) => {
    if (voice.id === 'child-innocent') {
      return {
        label: 'بچوں کی آواز',
        enLabel: 'Child Voice',
        badgeClass: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
        icon: <Baby className="w-3.5 h-3.5 text-amber-400" />,
        avatarBg: 'bg-amber-950/60 border-amber-500/30 text-amber-300',
      };
    }
    if (voice.id === 'elder-oldman') {
      return {
        label: 'بوڑھا کہانی گو (دادا جان)',
        enLabel: 'Grandfather',
        badgeClass: 'bg-purple-500/15 border-purple-500/30 text-purple-300',
        icon: <BookOpen className="w-3.5 h-3.5 text-purple-400" />,
        avatarBg: 'bg-purple-950/60 border-purple-500/30 text-purple-300',
      };
    }
    if (voice.id === 'elder-oldwoman') {
      return {
        label: 'بڑھیا کہانی گو (دادی اماں)',
        enLabel: 'Grandmother',
        badgeClass: 'bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300',
        icon: <Heart className="w-3.5 h-3.5 text-fuchsia-400" />,
        avatarBg: 'bg-fuchsia-950/60 border-fuchsia-500/30 text-fuchsia-300',
      };
    }
    if (voice.id === 'leda-sarah') {
      return {
        label: 'صاف نرم لہجہ (انگلش و اردو)',
        enLabel: 'Bilingual Soft',
        badgeClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
        icon: <Sparkles className="w-3.5 h-3.5 text-emerald-400" />,
        avatarBg: 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300',
      };
    }
    if (voice.gender === 'female') {
      return {
        label: 'خاتون (نرم آواز)',
        enLabel: 'Female Voice',
        badgeClass: 'bg-pink-500/15 border-pink-500/30 text-pink-300',
        icon: <User className="w-3.5 h-3.5 text-pink-400" />,
        avatarBg: 'bg-pink-950/60 border-pink-500/30 text-pink-300',
      };
    }
    return {
      label: 'مرد (باوقار آواز)',
      enLabel: 'Male Voice',
      badgeClass: 'bg-blue-500/15 border-blue-500/30 text-blue-300',
      icon: <User className="w-3.5 h-3.5 text-blue-400" />,
      avatarBg: 'bg-blue-950/60 border-blue-500/30 text-blue-300',
    };
  };

  const playAudioUrl = (url: string, voiceId: string) => {
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio();
    }
    audioPlayerRef.current.src = url;
    audioPlayerRef.current.onended = () => setPreviewingVoiceId(null);
    audioPlayerRef.current.onerror = () => {
      setPreviewingVoiceId(null);
      setUnifiedNotice('آڈیو چلانے میں مسئلہ ہوا۔ (Playback failed)');
    };

    audioPlayerRef.current.play().then(
      () => {
        setPreviewingVoiceId(voiceId);
      },
      (err) => {
        console.warn('Playback interrupted or blocked by browser:', err);
        setPreviewingVoiceId(null);
      }
    );
  };

  // Handle preview playback
  const handleTogglePreview = async (voice: VoiceOption, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // If currently playing, stop it
    if (previewingVoiceId === voice.id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setPreviewingVoiceId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const cacheKey = getCacheKey(voice.id);

    // 1. Check in-memory map
    if (previewUrlsMap.current.has(cacheKey)) {
      const cachedUrl = previewUrlsMap.current.get(cacheKey)!;
      playAudioUrl(cachedUrl, voice.id);
      return;
    }

    // 2. Check localStorage
    const storedBase64 = getStoredPreview(cacheKey);
    if (storedBase64) {
      try {
        const cachedUrl = base64ToBlobUrl(storedBase64);
        previewUrlsMap.current.set(cacheKey, cachedUrl);
        setCachedVoiceIds((prev) => new Set([...prev, voice.id]));
        playAudioUrl(cachedUrl, voice.id);
        return;
      } catch (e) {
        console.warn('Failed restoring cached preview audio blob', e);
      }
    }

    // 3. Check cooldown
    if (cooldownSecondsLeft > 0) {
      setUnifiedNotice(
        `کوٹہ کی حد ہے۔ براہ کرم ${cooldownSecondsLeft} سیکنڈ بعد کوشش کریں۔ (Wait ${cooldownSecondsLeft}s)`
      );
      return;
    }

    // 4. Fetch fresh preview from server
    setLoadingPreviewId(voice.id);
    setUnifiedNotice(null);

    try {
      onRecordApiCall('preview');

      const res = await fetch('/api/preview-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceName: voice.geminiVoice,
          language,
          gender: voice.gender,
          style: speakingStyle,
          customStyleInstruction: voice.styleInstruction || '',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || 'Failed to generate voice preview');
      }

      setStoredPreview(cacheKey, data.audioBase64);

      const audioUrl = base64ToBlobUrl(data.audioBase64, data.mimeType || 'audio/wav');
      previewUrlsMap.current.set(cacheKey, audioUrl);
      setCachedVoiceIds((prev) => new Set([...prev, voice.id]));

      playAudioUrl(audioUrl, voice.id);
    } catch (err: any) {
      const isQuota = isQuotaError(err);
      if (isQuota) {
        const delaySec = extractRetryDelayFromError(err);
        onTriggerCooldown(delaySec);
        setUnifiedNotice(
          `کوٹہ کی حد مکمل ہو گئی ہے، براہ کرم ${delaySec} سیکنڈ بعد کوشش کریں۔ (Quota limit, wait ${delaySec}s)`
        );
        console.warn(`[Quota Notice] Preview for ${voice.name} paused for ${delaySec}s.`);
      } else {
        console.error(`Preview failed for ${voice.name}:`, err);
        setUnifiedNotice(err?.message || 'آواز سنانے میں خرابی۔ (Audio error)');
      }
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const selectedCategory = getCategoryInfo(selectedVoice);

  return (
    <div id="voice-library-picker-root" ref={containerRef} className="space-y-3">
      {/* 
        ========================================================================
        1. SINGLE UNIFIED QUOTA & CALLS BAR (صاف اور محفوظ کاؤنٹر باکس)
        ========================================================================
      */}
      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 font-mono font-bold text-xs">
            <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>استعمال شدہ کالز: {sessionApiCalls}</span>
            <span className="text-slate-400 font-normal">({sessionApiCalls} Used)</span>
          </div>

          <span className="text-[11px] text-slate-400 font-urdu">
            گوگل فری کوٹہ: ~10 تا 15 روزانہ (Daily Free Quota)
          </span>
        </div>

        {/* Live Cooldown status */}
        <div className="shrink-0">
          {cooldownSecondsLeft > 0 ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-300 text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>انتظار: {cooldownSecondsLeft}s باقی (Cooldown)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-urdu">کوٹہ تیار ہے (Ready)</span>
            </div>
          )}
        </div>
      </div>

      {/* Dismissible friendly alert */}
      {unifiedNotice && (
        <div className="p-2.5 rounded-lg bg-amber-950/50 border border-amber-800/50 text-amber-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-urdu">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{unifiedNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setUnifiedNotice(null)}
            className="text-slate-400 hover:text-white p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 
        ========================================================================
        2. THE MAIN SELECT BOX (باکس اور اس کے نیچے اسکرول والا ڈراپ ڈاؤن)
        ========================================================================
      */}
      <div className="relative">
        <label className="block text-xs font-bold text-slate-300 mb-1.5 font-urdu flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span>آواز منتخب کریں (Click to open Voice List)</span>
          </span>
          <span className="text-[11px] text-amber-400 font-mono font-normal">
            کل منتخب آوازیں: 8 (Curated Set)
          </span>
        </label>

        {/* The Clickable Voice Box */}
        <div
          id="active-voice-box"
          onClick={() => setIsDropdownOpen((prev) => !prev)}
          className={`w-full p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 border transition-all cursor-pointer shadow-lg flex items-center justify-between gap-3 ${
            isDropdownOpen
              ? 'border-amber-500 ring-2 ring-amber-500/20'
              : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/90'
          }`}
        >
          {/* Left: Avatar & Voice Info */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base border shrink-0 shadow-inner ${selectedCategory.avatarBg}`}
            >
              {selectedVoice.name.charAt(0)}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-white font-urdu">
                  {selectedVoice.name}
                </span>

                <span
                  className={`text-[10.5px] px-2 py-0.5 rounded-md border font-urdu flex items-center gap-1 ${selectedCategory.badgeClass}`}
                >
                  {selectedCategory.icon}
                  <span>{selectedCategory.label}</span>
                </span>

                <span className="text-[10px] text-slate-400 font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                  Gemini: {selectedVoice.geminiVoice}
                </span>
              </div>

              <p className="text-xs text-slate-400 font-urdu truncate max-w-md">
                {selectedVoice.description}
              </p>
            </div>
          </div>

          {/* Right: Quick Preview Button & Dropdown Chevron */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Quick 3s Sample Button on the Closed Box */}
            <button
              type="button"
              onClick={(e) => handleTogglePreview(selectedVoice, e)}
              disabled={loadingPreviewId === selectedVoice.id}
              className={`px-3 py-1.5 rounded-xl text-xs font-urdu font-medium flex items-center gap-1.5 transition-all cursor-pointer border ${
                previewingVoiceId === selectedVoice.id
                  ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                  : cachedVoiceIds.has(selectedVoice.id)
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/80'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
              }`}
              title="نمونہ آواز سنیں (Preview voice sample)"
            >
              {loadingPreviewId === selectedVoice.id ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
              ) : previewingVoiceId === selectedVoice.id ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span className="hidden sm:inline">
                {previewingVoiceId === selectedVoice.id
                  ? 'روکیں'
                  : cachedVoiceIds.has(selectedVoice.id)
                  ? 'مفت ری پلے'
                  : 'پریویو سنیں'}
              </span>
            </button>

            {/* Dropdown Chevron Button */}
            <div
              className={`w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-300 transition-transform duration-200 ${
                isDropdownOpen ? 'rotate-180 text-amber-400 border-amber-500/50' : ''
              }`}
            >
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* 
          ======================================================================
          3. SCROLLABLE DROPDOWN MENU (نیچے اسکرول والا مینو)
          ======================================================================
        */}
        {isDropdownOpen && (
          <div
            id="voice-dropdown-menu"
            className="absolute top-full left-0 right-0 mt-2 z-40 bg-slate-900/98 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-2.5 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="flex items-center justify-between px-2 pb-2 mb-1.5 border-b border-slate-800/80 text-xs text-slate-400 font-urdu">
              <span>آواز پر کلک کر کے منتخب کریں:</span>
              <span className="text-[11px] text-amber-400 font-mono">
                8 آوازیں (2 خواتین، 2 مرد، 1 صاف نرم، 1 بچہ، 2 بزرگ کہانیاں)
              </span>
            </div>

            {/* Scrollable container with 8 voices */}
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/40">
              {voices.map((voice) => {
                const isSelected = voice.id === selectedVoice.id;
                const category = getCategoryInfo(voice);
                const isPlaying = previewingVoiceId === voice.id;
                const isLoading = loadingPreviewId === voice.id;
                const isCached = cachedVoiceIds.has(voice.id);

                return (
                  <div
                    key={voice.id}
                    onClick={() => {
                      onSelectVoice(voice);
                      setIsDropdownOpen(false);
                    }}
                    className={`pt-1.5 pb-1 px-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 text-left ${
                      isSelected
                        ? 'bg-amber-500/15 border border-amber-500/60 shadow-sm'
                        : 'hover:bg-slate-800/70 border border-transparent'
                    }`}
                  >
                    {/* Voice details */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 border ${category.avatarBg}`}
                      >
                        {voice.name.charAt(0)}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-sm font-bold font-urdu ${
                              isSelected ? 'text-amber-300' : 'text-white'
                            }`}
                          >
                            {voice.name}
                          </span>

                          <span
                            className={`text-[10px] px-2 py-0.5 rounded border font-urdu flex items-center gap-1 ${category.badgeClass}`}
                          >
                            {category.icon}
                            <span>{category.label}</span>
                          </span>

                          {isSelected && (
                            <span className="text-[10px] bg-amber-500 text-slate-950 font-bold px-1.5 py-0.2 rounded font-urdu">
                              منتخب شدہ
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-400 font-urdu truncate max-w-sm">
                          {voice.description}
                        </p>
                      </div>
                    </div>

                    {/* Preview Button for each item */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleTogglePreview(voice, e)}
                        disabled={isLoading}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-urdu flex items-center gap-1 transition-all cursor-pointer border ${
                          isPlaying
                            ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                            : isCached
                            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                            : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300 hover:text-white'
                        }`}
                        title="آواز سنیں"
                      >
                        {isLoading ? (
                          <RotateCw className="w-3 h-3 animate-spin" />
                        ) : isPlaying ? (
                          <Square className="w-3 h-3 fill-current" />
                        ) : (
                          <Play className="w-3 h-3 fill-current" />
                        )}
                        <span>{isPlaying ? 'روکیں' : isCached ? 'فری پلے' : 'سنیں'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
