import React, { useState, useRef, useEffect } from 'react';
import {
  Mic2,
  Play,
  Pause,
  Download,
  Share2,
  RotateCw,
  Sparkles,
  Clock,
  AlertCircle,
  FileArchive,
  CheckCircle2,
  Layers,
  Languages,
  Wand2,
  Trash2,
} from 'lucide-react';
import JSZip from 'jszip';
import { VOICES } from '../data/voices';
import { VoiceOption, AudioChunk, SpeakingStyle, VoiceFilter } from '../types';
import { wavBase64ToMp3Blob } from '../utils/audioEncoder';
import { mergeWavAudiosToMp3 } from '../utils/videoRenderer';
import { categorizeError } from './CleanVideoStudio';
import { VoiceLibraryPicker } from './VoiceLibraryPicker';
import {
  FriendlyErrorBox,
  extractRetryDelayFromError,
  isQuotaError,
} from './FriendlyErrorBox';

export type TargetLengthOption = 'auto' | '30s' | '1m' | '2m' | '3m' | 'custom';

const SPEAKING_STYLES: { id: SpeakingStyle; label: string; labelUrdu: string }[] = [
  { id: 'Normal', label: 'Normal', labelUrdu: 'عام / معمول' },
  { id: 'Cheerful', label: 'Cheerful', labelUrdu: 'خوشگوار' },
  { id: 'Serious', label: 'Serious', labelUrdu: 'سنجیدہ' },
  { id: 'Calm', label: 'Calm', labelUrdu: 'پرسکون' },
  { id: 'Excited', label: 'Excited', labelUrdu: 'پرجوش' },
  { id: 'Whisper', label: 'Whisper', labelUrdu: 'سرگوشی' },
  { id: 'Storyteller', label: 'Storyteller', labelUrdu: 'کہانی انداز' },
  { id: 'News Anchor', label: 'News Anchor', labelUrdu: 'نیوز اینکر' },
];

interface VoiceStudioTabProps {
  promptText: string;
  setPromptText: (text: string) => void;
  language: 'urdu' | 'hindi' | 'english';
  setLanguage: (lang: 'urdu' | 'hindi' | 'english') => void;
  selectedVoiceId: string;
  setSelectedVoiceId: (id: string) => void;
  isTestMode?: boolean;
}

export const VoiceStudioTab: React.FC<VoiceStudioTabProps> = ({
  promptText,
  setPromptText,
  language,
  setLanguage,
  selectedVoiceId,
  setSelectedVoiceId,
  isTestMode = false,
}) => {
  // Voice selection (all 30 Gemini voices + 2 child voices from VOICES)
  const selectedVoice = VOICES.find((v) => v.id === selectedVoiceId) || VOICES[0];

  // Speaking Style selector state (Requirement 5)
  const [speakingStyle, setSpeakingStyle] = useState<SpeakingStyle>('Normal');

  // Filter chips state (Requirement 3)
  const [activeFilter, setActiveFilter] = useState<VoiceFilter>('All');

  // Favorites state with localStorage persistence (Requirement 6)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('tts_voice_favorites');
      return saved ? JSON.parse(saved) : ['kore-ayesha', 'fenrir-tariq'];
    } catch {
      return ['kore-ayesha', 'fenrir-tariq'];
    }
  });

  const handleToggleFavorite = (voiceId: string) => {
    setFavorites((prev) => {
      const updated = prev.includes(voiceId)
        ? prev.filter((id) => id !== voiceId)
        : [voiceId, ...prev];
      try {
        localStorage.setItem('tts_voice_favorites', JSON.stringify(updated));
      } catch (e) {
        console.warn('Could not save favorites to localStorage', e);
      }
      return updated;
    });
  };

  // Auto-translate script state (Requirement 1)
  const [isTranslatingScript, setIsTranslatingScript] = useState<boolean>(false);
  const [translateMessage, setTranslateMessage] = useState<string | null>(null);

  // Target length state
  const [targetLength, setTargetLength] = useState<TargetLengthOption>('auto');
  const [customTargetSec, setCustomTargetSec] = useState<number>(45);
  const [isAdjustingScript, setIsAdjustingScript] = useState<boolean>(false);
  const [adjustMessage, setAdjustMessage] = useState<string | null>(null);

  // Audio chunks and generated audio
  const [chunks, setChunks] = useState<AudioChunk[]>([]);
  const [fullAudioBlob, setFullAudioBlob] = useState<Blob | null>(null);
  const [fullAudioUrl, setFullAudioUrl] = useState<string | null>(null);
  const [serverDownloadUrl, setServerDownloadUrl] = useState<string | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [canNativeShare, setCanNativeShare] = useState<boolean>(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState<boolean>(false);
  const [generationProgressText, setGenerationProgressText] = useState<string>('');
  const [generationGlobalError, setGenerationGlobalError] = useState<any | null>(null);

  // Quota tracking & Cooldown timer state (Requirement 4 & 6)
  const [sessionApiCalls, setSessionApiCalls] = useState<number>(() => {
    try {
      const val = sessionStorage.getItem('tts_session_api_calls');
      return val ? parseInt(val, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const [previewCallsCount, setPreviewCallsCount] = useState<number>(() => {
    try {
      const val = sessionStorage.getItem('tts_preview_calls_count');
      return val ? parseInt(val, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const handleRecordApiCall = (type: 'preview' | 'general') => {
    setSessionApiCalls((prev) => {
      const next = prev + 1;
      try {
        sessionStorage.setItem('tts_session_api_calls', String(next));
      } catch {}
      return next;
    });

    if (type === 'preview') {
      setPreviewCallsCount((prev) => {
        const next = prev + 1;
        try {
          sessionStorage.setItem('tts_preview_calls_count', String(next));
        } catch {}
        return next;
      });
    }
  };

  // Cooldown countdown state
  const [cooldownUntil, setCooldownUntil] = useState<number>(() => {
    try {
      const val = sessionStorage.getItem('tts_cooldown_until');
      return val ? parseInt(val, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const [cooldownSecondsLeft, setCooldownSecondsLeft] = useState<number>(0);

  const handleTriggerCooldown = (seconds: number) => {
    const delay = Math.max(5, seconds || 30);
    const until = Date.now() + delay * 1000;
    try {
      sessionStorage.setItem('tts_cooldown_until', String(until));
    } catch {}
    setCooldownUntil(until);
  };

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
      setCooldownSecondsLeft(left);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  // Audio Playback
  const [isPlayingFull, setIsPlayingFull] = useState<boolean>(false);
  const [playingChunkId, setPlayingChunkId] = useState<string | null>(null);
  const fullAudioRef = useRef<HTMLAudioElement | null>(null);
  const chunkAudioRef = useRef<HTMLAudioElement | null>(null);

  // 1. Spoken length estimation
  // Requirement 1: Urdu/Hindi about 2.2 words per second, English about 2.7 words per second
  const isEnglish = language === 'english';
  const wordsPerSecond = isEnglish ? 2.7 : 2.2;
  const wordList = promptText.trim() ? promptText.trim().split(/\s+/).filter(Boolean) : [];
  const wordCount = wordList.length;

  const estimatedSeconds = Math.round(wordCount / wordsPerSecond);
  const estMins = Math.floor(estimatedSeconds / 60);
  const estSecs = estimatedSeconds % 60;
  const estFormattedEn =
    wordCount === 0
      ? '0s'
      : estMins > 0
      ? `${estMins} min ${estSecs} sec`
      : `${estSecs} sec`;
  const estFormattedUrdu =
    wordCount === 0
      ? '0 سیکنڈ'
      : estMins > 0
      ? `${estMins} منٹ ${estSecs} سیکنڈ`
      : `${estSecs} سیکنڈ`;

  // Target calculation
  const getTargetSeconds = (): number | null => {
    switch (targetLength) {
      case '30s':
        return 30;
      case '1m':
        return 60;
      case '2m':
        return 120;
      case '3m':
        return 180;
      case 'custom':
        return Math.max(10, customTargetSec);
      case 'auto':
      default:
        return null;
    }
  };

  const targetSec = getTargetSeconds();
  const targetWords = targetSec ? Math.round(targetSec * wordsPerSecond) : null;
  const isTooShort = targetWords !== null && wordCount > 0 && wordCount < targetWords * 0.8;
  const isTooLong = targetWords !== null && wordCount > targetWords * 1.2;

  // Clean up audio URLs on unmount
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
      setCanNativeShare(true);
    }
    return () => {
      if (fullAudioUrl) URL.revokeObjectURL(fullAudioUrl);
      chunks.forEach((c) => {
        if (c.audioUrl) URL.revokeObjectURL(c.audioUrl);
      });
    };
  }, []);

  // Helper to prepare direct server-side download link for mobile / iframe resilience
  const prepareServerDownload = async (blob: Blob, voiceName: string) => {
    try {
      const filename = `voiceover-${voiceName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.mp3`;
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const resText = (reader.result as string) || '';
          const base64Data = resText.includes(',') ? resText.split(',')[1] : resText;
          const res = await fetch('/api/prepare-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64Data,
              filename,
              mimeType: 'audio/mpeg',
            }),
          });
          const data = await res.json();
          if (data && data.downloadUrl) {
            setServerDownloadUrl(data.downloadUrl);
          }
        } catch (postErr) {
          console.warn('Could not post prepare-download:', postErr);
        }
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn('prepareServerDownload error:', err);
    }
  };

  // Requirement 1: Auto-translate script using Gemini
  const handleAutoTranslate = async () => {
    if (!promptText.trim() || isTranslatingScript) return;
    if (cooldownSecondsLeft > 0) {
      setTranslateMessage(
        `کوٹہ کی حد، برائے مہربانی ${cooldownSecondsLeft} سیکنڈ بعد کوشش کریں۔ (Try again in ${cooldownSecondsLeft}s)`
      );
      return;
    }

    setIsTranslatingScript(true);
    setTranslateMessage(
      language === 'urdu'
        ? 'اسکرپٹ کا اردو میں ترجمہ ہو رہا ہے...'
        : language === 'hindi'
        ? 'स्क्रिप्ट का हिन्दी में अनुवाद हो रहा है...'
        : 'Translating script into natural English...'
    );

    handleRecordApiCall('general');

    try {
      const res = await fetch('/api/translate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: promptText,
          targetLanguage: language,
        }),
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Server returned invalid response (${res.status})`);
      }

      if (!res.ok || !data.success) {
        if (res.status === 429 || isQuotaError(data)) {
          const delay = extractRetryDelayFromError(data);
          handleTriggerCooldown(delay);
        }
        throw data.error || data || new Error('Failed to translate script');
      }

      setPromptText(data.translatedScript);
      const targetLabel = language === 'urdu' ? 'اردو' : language === 'hindi' ? 'हिन्दी' : 'English';
      setTranslateMessage(
        `ترجمہ مکمل ہو گیا! (${data.wordCount} الفاظ، زبان: ${targetLabel})`
      );
      setTimeout(() => setTranslateMessage(null), 4000);
    } catch (err: any) {
      console.error('Translation failed:', err);
      const isQuota = isQuotaError(err);
      if (isQuota) {
        const delay = extractRetryDelayFromError(err);
        handleTriggerCooldown(delay);
        setTranslateMessage(
          `کوٹہ کی حد مکمل ہو گئی ہے، براہ کرم ${delay} سیکنڈ بعد دوبارہ کوشش کریں۔ (Quota exceeded, retry in ${delay}s)`
        );
      } else {
        setTranslateMessage(`ترجمہ میں خرابی: ${err?.message || 'Error occurred'}`);
      }
      setTimeout(() => setTranslateMessage(null), 6000);
    } finally {
      setIsTranslatingScript(false);
    }
  };

  // Expand or Shorten script with Gemini API
  const handleAdjustScript = async (action: 'expand' | 'shorten') => {
    if (!promptText.trim() || !targetSec || isAdjustingScript) return;
    if (cooldownSecondsLeft > 0) {
      setAdjustMessage(
        `کوٹہ کی حد، برائے مہربانی ${cooldownSecondsLeft} سیکنڈ بعد کوشش کریں۔ (Try again in ${cooldownSecondsLeft}s)`
      );
      return;
    }

    setIsAdjustingScript(true);
    setAdjustMessage(action === 'expand' ? 'متن طویل کیا جا رہا ہے...' : 'متن مختصر کیا جا رہا ہے...');

    handleRecordApiCall('general');

    try {
      const res = await fetch('/api/adjust-script-length', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: promptText,
          targetDurationSeconds: targetSec,
          action,
          language,
        }),
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Server returned invalid response (${res.status}): ${rawText.slice(0, 100) || 'empty response'}`);
      }

      if (!res.ok || !data.success) {
        if (res.status === 429 || isQuotaError(data)) {
          const delay = extractRetryDelayFromError(data);
          handleTriggerCooldown(delay);
        }
        throw data.error || data || new Error('Failed to adjust script length');
      }

      setPromptText(data.script);
      setAdjustMessage(
        `متن ایڈجسٹ ہو گیا! (${data.wordCount} الفاظ، تقریباً ${data.estimatedSeconds} سیکنڈز)`
      );
      setTimeout(() => setAdjustMessage(null), 4000);
    } catch (err: any) {
      console.error('Adjust script error:', err);
      const isQuota = isQuotaError(err);
      if (isQuota) {
        const delay = extractRetryDelayFromError(err);
        handleTriggerCooldown(delay);
        setAdjustMessage(
          `کوٹہ کی حد مکمل ہو گئی ہے، براہ کرم ${delay} سیکنڈ بعد دوبارہ کوشش کریں۔ (Quota exceeded, retry in ${delay}s)`
        );
      } else {
        setAdjustMessage(`Error: ${err?.message || 'Could not adjust script'}`);
      }
      setTimeout(() => setAdjustMessage(null), 6000);
    } finally {
      setIsAdjustingScript(false);
    }
  };

  // Helper to split text into coherent spoken chunks (~110 to 140 words each)
  const splitTextIntoChunks = (text: string): AudioChunk[] => {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const totalWords = trimmed.split(/\s+/).filter(Boolean);

    // If text is within comfortable single-request capacity (up to ~140 words) or test mode is active
    if (totalWords.length <= 140 || isTestMode) {
      return [
        {
          id: 'chunk-1',
          chunkIndex: 1,
          text: trimmed,
          wordCount: totalWords.length,
          estimatedSeconds: Math.round(totalWords.length / wordsPerSecond),
          status: 'pending',
        },
      ];
    }

    // Split by sentence breaks (Urdu full stop '۔', '.', '!', '?', '\n\n', '\n')
    const rawSentences = trimmed
      .split(/(?<=[۔.!?\n])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const chunkItems: AudioChunk[] = [];
    let currentChunkSentences: string[] = [];
    let currentWords = 0;

    for (const sentence of rawSentences) {
      const sWords = sentence.split(/\s+/).filter(Boolean).length;
      if (currentWords > 0 && currentWords + sWords > 125) {
        const chunkText = currentChunkSentences.join(' ');
        chunkItems.push({
          id: `chunk-${chunkItems.length + 1}`,
          chunkIndex: chunkItems.length + 1,
          text: chunkText,
          wordCount: currentWords,
          estimatedSeconds: Math.round(currentWords / wordsPerSecond),
          status: 'pending',
        });
        currentChunkSentences = [sentence];
        currentWords = sWords;
      } else {
        currentChunkSentences.push(sentence);
        currentWords += sWords;
      }
    }

    if (currentChunkSentences.length > 0) {
      const chunkText = currentChunkSentences.join(' ');
      chunkItems.push({
        id: `chunk-${chunkItems.length + 1}`,
        chunkIndex: chunkItems.length + 1,
        text: chunkText,
        wordCount: currentWords,
        estimatedSeconds: Math.round(currentWords / wordsPerSecond),
        status: 'pending',
      });
    }

    return chunkItems;
  };

  // Generate audio for a single chunk with speaking style and child voice instruction
  const generateChunkAudio = async (
    chunkText: string
  ): Promise<{ audioBase64: string; duration: number }> => {
    if (cooldownSecondsLeft > 0) {
      throw {
        isQuotaError: true,
        retryDelaySeconds: cooldownSecondsLeft,
        message: `Quota limit cooldown active. Please retry after ${cooldownSecondsLeft} seconds.`,
      };
    }

    handleRecordApiCall('general');

    const res = await fetch('/api/generate-voiceover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: chunkText,
        voiceName: selectedVoice.geminiVoice,
        voice: selectedVoice.geminiVoice,
        accent: selectedVoice.accent,
        gender: selectedVoice.gender,
        language,
        speakingStyle,
        customStyleInstruction: selectedVoice.styleInstruction || '',
      }),
    });

    const rawText = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(
        `Server returned non-JSON response (${res.status}): ${rawText.slice(0, 120) || 'Empty body'}`
      );
    }

    if (!res.ok || !data.success || !data.audioBase64) {
      if (res.status === 429 || isQuotaError(data)) {
        const delay = extractRetryDelayFromError(data);
        handleTriggerCooldown(delay);
      }
      throw data.error || data || new Error('Failed to generate voiceover');
    }

    return {
      audioBase64: data.audioBase64,
      duration: data.duration || 8,
    };
  };

  // Generate All Voice Chunks
  const handleGenerateVoice = async () => {
    if (!promptText.trim() || isGeneratingVoice) return;

    if (cooldownSecondsLeft > 0) {
      setGenerationGlobalError({
        isQuotaError: true,
        retryDelaySeconds: cooldownSecondsLeft,
        message: `Quota limit cooldown active. Please retry after ${cooldownSecondsLeft} seconds.`,
      });
      return;
    }

    setGenerationGlobalError(null);
    setIsGeneratingVoice(true);
    setGenerationProgressText('اسکرپٹ کو حصوں میں تقسیم کیا جا رہا ہے...');

    const initialChunks = splitTextIntoChunks(promptText);
    setChunks(initialChunks);

    const updatedChunks: AudioChunk[] = [...initialChunks];
    const generatedBase64s: string[] = [];

    for (let i = 0; i < updatedChunks.length; i++) {
      const c = updatedChunks[i];

      // Smart pacing pause between multi-chunk requests to prevent quota bursts
      if (i > 0) {
        setGenerationProgressText(`حصہ ${i + 1} آف ${updatedChunks.length} کے لیے تیاری...`);
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }

      setGenerationProgressText(`حصہ ${i + 1} آف ${updatedChunks.length} کی آواز تیار ہو رہی ہے...`);

      setChunks((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: 'generating', errorMessage: undefined } : item))
      );

      try {
        const { audioBase64, duration } = await generateChunkAudio(c.text);
        const mp3Blob = wavBase64ToMp3Blob(audioBase64);
        const audioUrl = URL.createObjectURL(mp3Blob);

        updatedChunks[i] = {
          ...c,
          status: 'done',
          audioBase64,
          audioUrl,
          duration,
          errorMessage: undefined,
          errorDetails: undefined,
          rawError: undefined,
        };
        generatedBase64s.push(audioBase64);

        setChunks([...updatedChunks]);
      } catch (err: any) {
        const isQuota = isQuotaError(err);
        if (isQuota) {
          const delaySec = extractRetryDelayFromError(err);
          handleTriggerCooldown(delaySec);
          console.warn(`[Quota Notice] Chunk ${i + 1} paused for cooldown (${delaySec}s).`);
        } else {
          console.error(`Chunk ${i + 1} failed:`, err);
        }
        updatedChunks[i] = {
          ...c,
          status: 'failed',
          errorMessage: isQuota ? 'Quota exceeded' : (err?.message || 'TTS Error'),
          errorDetails: err?.message || String(err),
          rawError: err,
        };
        setChunks([...updatedChunks]);

        // If quota was exceeded, halt further requests during this batch to respect cooldown
        if (isQuota) {
          setGenerationGlobalError(err);
          break;
        }
      }
    }

    // Join all generated audio into one single MP3
    if (generatedBase64s.length > 0) {
      try {
        setGenerationProgressText('تمام حصوں کو ایک فائل میں یکجا کیا جا رہا ہے...');
        const joinedMp3 = await mergeWavAudiosToMp3(generatedBase64s);
        if (fullAudioUrl) URL.revokeObjectURL(fullAudioUrl);
        const url = URL.createObjectURL(joinedMp3);
        setFullAudioBlob(joinedMp3);
        setFullAudioUrl(url);
        prepareServerDownload(joinedMp3, selectedVoice.name);
      } catch (mergeErr) {
        console.warn('Could not merge MP3 chunks into single file:', mergeErr);
      }
    }

    setGenerationProgressText('');
    setIsGeneratingVoice(false);
  };

  // Regenerate a single chunk
  const handleRegenerateChunk = async (chunkId: string) => {
    const chunkIdx = chunks.findIndex((c) => c.id === chunkId);
    if (chunkIdx === -1) return;

    if (cooldownSecondsLeft > 0) {
      setGenerationGlobalError({
        isQuotaError: true,
        retryDelaySeconds: cooldownSecondsLeft,
        message: `Quota limit cooldown active. Please retry after ${cooldownSecondsLeft} seconds.`,
      });
      return;
    }

    const targetChunk = chunks[chunkIdx];
    setChunks((prev) =>
      prev.map((c) => (c.id === chunkId ? { ...c, status: 'generating', errorMessage: undefined } : c))
    );

    try {
      const { audioBase64, duration } = await generateChunkAudio(targetChunk.text);
      const mp3Blob = wavBase64ToMp3Blob(audioBase64);
      const audioUrl = URL.createObjectURL(mp3Blob);

      const nextChunks = [...chunks];
      nextChunks[chunkIdx] = {
        ...targetChunk,
        status: 'done',
        audioBase64,
        audioUrl,
        duration,
        errorMessage: undefined,
        errorDetails: undefined,
        rawError: undefined,
      };
      setChunks(nextChunks);

      // Re-join full audio if all successful chunks available
      const allBase64 = nextChunks.map((c) => c.audioBase64).filter(Boolean) as string[];
      if (allBase64.length > 0) {
        const joinedMp3 = await mergeWavAudiosToMp3(allBase64);
        if (fullAudioUrl) URL.revokeObjectURL(fullAudioUrl);
        const url = URL.createObjectURL(joinedMp3);
        setFullAudioBlob(joinedMp3);
        setFullAudioUrl(url);
        prepareServerDownload(joinedMp3, selectedVoice.name);
      }
    } catch (err: any) {
      const isQuota = isQuotaError(err);
      if (isQuota) {
        const delaySec = extractRetryDelayFromError(err);
        handleTriggerCooldown(delaySec);
        setGenerationGlobalError(err);
        console.warn(`[Quota Notice] Regenerate chunk ${chunkId} paused for cooldown (${delaySec}s).`);
      } else {
        console.error(`Regenerate chunk ${chunkId} failed:`, err);
      }
      setChunks((prev) =>
        prev.map((c) =>
          c.id === chunkId
            ? {
                ...c,
                status: 'failed',
                errorMessage: isQuota ? 'Quota exceeded' : (err?.message || 'TTS Error'),
                errorDetails: err?.message || String(err),
                rawError: err,
              }
            : c
        )
      );
    }
  };

  // Retry all failed chunks only
  const handleRetryFailedChunks = async () => {
    const failedChunks = chunks.filter((c) => c.status === 'failed');
    if (failedChunks.length === 0) return;

    if (cooldownSecondsLeft > 0) {
      setGenerationGlobalError({
        isQuotaError: true,
        retryDelaySeconds: cooldownSecondsLeft,
        message: `Quota limit cooldown active. Please retry after ${cooldownSecondsLeft} seconds.`,
      });
      return;
    }

    setIsGeneratingVoice(true);
    for (const c of failedChunks) {
      if (cooldownSecondsLeft > 0) break;
      await handleRegenerateChunk(c.id);
    }
    setIsGeneratingVoice(false);
  };

  // Play full audio
  const handleTogglePlayFull = () => {
    if (!fullAudioUrl) return;
    if (!fullAudioRef.current) {
      fullAudioRef.current = new Audio(fullAudioUrl);
      fullAudioRef.current.onended = () => setIsPlayingFull(false);
    }

    if (isPlayingFull) {
      fullAudioRef.current.pause();
      setIsPlayingFull(false);
    } else {
      if (chunkAudioRef.current) {
        chunkAudioRef.current.pause();
        setPlayingChunkId(null);
      }
      fullAudioRef.current.src = fullAudioUrl;
      fullAudioRef.current
        .play()
        .then(() => {
          setIsPlayingFull(true);
        })
        .catch((err) => {
          console.warn('Playback interrupted or blocked:', err);
          setIsPlayingFull(false);
        });
    }
  };

  // Play single chunk audio
  const handleTogglePlayChunk = (chunk: AudioChunk) => {
    if (!chunk.audioUrl) return;

    if (playingChunkId === chunk.id) {
      if (chunkAudioRef.current) {
        chunkAudioRef.current.pause();
      }
      setPlayingChunkId(null);
      return;
    }

    if (fullAudioRef.current) {
      fullAudioRef.current.pause();
      setIsPlayingFull(false);
    }

    if (chunkAudioRef.current) {
      chunkAudioRef.current.pause();
    }

    chunkAudioRef.current = new Audio(chunk.audioUrl);
    chunkAudioRef.current.onended = () => setPlayingChunkId(null);
    chunkAudioRef.current
      .play()
      .then(() => {
        setPlayingChunkId(chunk.id);
      })
      .catch((err) => {
        console.warn('Chunk playback interrupted or blocked:', err);
        setPlayingChunkId(null);
      });
  };

  // Download full MP3 (Resilient for mobile browsers & iframes)
  const handleDownloadFullMp3 = (e?: React.MouseEvent) => {
    const filename = `voiceover-${selectedVoice.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.mp3`;
    const targetUrl = serverDownloadUrl || fullAudioUrl;
    if (!targetUrl) return;

    setDownloadNotice('ڈاؤن لوڈ شروع ہو گیا ہے۔ فائل محفوظ ہو رہی ہے... (Downloading)');
    setTimeout(() => setDownloadNotice(null), 5000);

    try {
      const a = document.createElement('a');
      a.href = targetUrl;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.warn('Download programmatic click failed, redirecting:', err);
      if (serverDownloadUrl) {
        window.location.href = serverDownloadUrl;
      }
    }
  };

  // Mobile Web Share API handler (Android / iOS native share sheet: Save to Files, WhatsApp, Drive, etc.)
  const handleMobileShareAudio = async () => {
    if (!fullAudioBlob) return;
    const filename = `voiceover-${selectedVoice.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.mp3`;

    try {
      const file = new File([fullAudioBlob], filename, { type: 'audio/mpeg' });
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Voiceover - ${selectedVoice.name}`,
          text: 'مکمل وائس اوور آڈیو فائل',
        });
        setDownloadNotice('فائل کامیابی سے محفوظ / شیئر ہو گئی!');
        setTimeout(() => setDownloadNotice(null), 4000);
      } else {
        handleDownloadFullMp3();
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('Mobile share dismissed or failed:', err);
        handleDownloadFullMp3();
      }
    }
  };

  // Delete all generated audio & reset back cleanly
  const handleDeleteGeneratedAudio = () => {
    if (fullAudioRef.current) {
      fullAudioRef.current.pause();
      fullAudioRef.current.currentTime = 0;
    }
    if (chunkAudioRef.current) {
      chunkAudioRef.current.pause();
    }
    setIsPlayingFull(false);
    setPlayingChunkId(null);

    if (fullAudioUrl) {
      try {
        URL.revokeObjectURL(fullAudioUrl);
      } catch {}
    }
    chunks.forEach((c) => {
      if (c.audioUrl) {
        try {
          URL.revokeObjectURL(c.audioUrl);
        } catch {}
      }
    });

    setFullAudioBlob(null);
    setFullAudioUrl(null);
    setServerDownloadUrl(null);
    setChunks([]);
    setDownloadNotice(null);
    setGenerationGlobalError(null);
  };

  // Delete a single chunk
  const handleDeleteSingleChunk = (chunkId: string) => {
    const chunkToDelete = chunks.find((c) => c.id === chunkId);
    if (chunkToDelete?.audioUrl) {
      try {
        URL.revokeObjectURL(chunkToDelete.audioUrl);
      } catch {}
    }
    if (playingChunkId === chunkId && chunkAudioRef.current) {
      chunkAudioRef.current.pause();
      setPlayingChunkId(null);
    }
    const remainingChunks = chunks.filter((c) => c.id !== chunkId);
    setChunks(remainingChunks);

    // If no chunks remain, clear full audio
    if (remainingChunks.length === 0) {
      handleDeleteGeneratedAudio();
    }
  };

  // Download single chunk MP3
  const handleDownloadChunkMp3 = (chunk: AudioChunk) => {
    if (!chunk.audioUrl) return;
    const a = document.createElement('a');
    a.href = chunk.audioUrl;
    a.download = `voiceover-chunk-${chunk.chunkIndex}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download Chunks ZIP
  const handleDownloadChunksZip = async () => {
    const validChunks = chunks.filter((c) => c.audioBase64 && c.status === 'done');
    if (validChunks.length === 0) return;

    const zip = new JSZip();
    const folder = zip.folder('voiceover_chunks');

    validChunks.forEach((c) => {
      const blob = wavBase64ToMp3Blob(c.audioBase64!);
      folder?.file(`chunk_${c.chunkIndex}.mp3`, blob);
    });

    folder?.file(
      'script.txt',
      validChunks.map((c) => `[Chunk ${c.chunkIndex}]\n${c.text}\n`).join('\n')
    );

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voiceover-chunks-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const failedCount = chunks.filter((c) => c.status === 'failed').length;
  const doneCount = chunks.filter((c) => c.status === 'done').length;

  return (
    <div className="space-y-5">
      {/* 1. TOP VOICE CONTROLS: LANGUAGE SELECTOR & SPEAKING STYLE */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Language Selector + Auto-Translate Button (Requirement 1) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-amber-400" />
              <label className="text-xs font-bold text-amber-400 font-urdu">
                زبان / Language Selection:
              </label>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Language Switcher Buttons */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setLanguage('urdu')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    language === 'urdu'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  اردو (Urdu)
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('hindi')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    language === 'hindi'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  हिन्दी (Hindi)
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('english')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    language === 'english'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  English
                </button>
              </div>

              {/* Auto-Translate Script Button (Gemini Powered) */}
              <button
                type="button"
                disabled={isTranslatingScript || !promptText.trim()}
                onClick={handleAutoTranslate}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm border border-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title="Translate script into the currently selected language using Gemini"
              >
                {isTranslatingScript ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                )}
                <span className="font-urdu">متن کا ترجمہ کریں</span>
                <span className="text-[10px] font-sans opacity-80">(Auto-translate script)</span>
              </button>
            </div>
          </div>

          {/* Style Control (Requirement 5: Normal, Cheerful, Serious, Calm, Excited, Whisper, Storyteller, News Anchor) */}
          <div className="space-y-2 lg:max-w-md w-full lg:w-auto">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="speaking-style-select"
                className="text-xs font-bold text-amber-400 font-urdu flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>بولنے کا انداز / Speaking Style:</span>
              </label>
              <span className="text-[11px] text-slate-400 font-urdu">
                {SPEAKING_STYLES.find((s) => s.id === speakingStyle)?.labelUrdu}
              </span>
            </div>

            <div className="relative">
              <select
                id="speaking-style-select"
                value={speakingStyle}
                onChange={(e) => setSpeakingStyle(e.target.value as SpeakingStyle)}
                className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 pr-8 cursor-pointer font-medium"
              >
                {SPEAKING_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label} &bull; {style.labelUrdu}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Translation Status Toast/Message */}
        {translateMessage && (
          <div className="p-2.5 rounded-xl bg-indigo-950/70 border border-indigo-500/40 text-xs text-indigo-200 font-urdu flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{translateMessage}</span>
          </div>
        )}
      </div>

      {/* 2. SPOKEN LENGTH & TARGET LENGTH SELECTOR */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <div>
              <h3 className="text-xs font-bold text-white font-urdu">
                آواز کے دورانیے کا تخمینہ / Spoken Duration
              </h3>
              <p className="text-[11px] text-slate-400">
                Pacing rate: ~{wordsPerSecond} words/sec ({isEnglish ? 'English' : 'Urdu/Hindi'})
              </p>
            </div>
          </div>

          {/* Immediate Live Estimate */}
          <div className="bg-slate-950 px-3.5 py-1.5 rounded-xl border border-amber-500/30 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-bold text-amber-300">
              Estimated voice length: about {estFormattedEn} ({wordCount} words)
            </span>
            <span className="text-[11px] text-slate-400 font-urdu hidden md:inline">
              ({estFormattedUrdu})
            </span>
          </div>
        </div>

        {/* Target Length Selector */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-300 font-urdu">
              ہدف دورانیہ / Target Length:
            </span>
            <div className="flex items-center gap-1 flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800">
              {(['auto', '30s', '1m', '2m', '3m', 'custom'] as TargetLengthOption[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setTargetLength(opt)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    targetLength === opt
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt === 'auto'
                    ? 'Auto (from text)'
                    : opt === '30s'
                    ? '30 sec'
                    : opt === '1m'
                    ? '1 min'
                    : opt === '2m'
                    ? '2 min'
                    : opt === '3m'
                    ? '3 min'
                    : 'Custom'}
                </button>
              ))}
            </div>

            {targetLength === 'custom' && (
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="number"
                  min={10}
                  max={600}
                  value={customTargetSec}
                  onChange={(e) => setCustomTargetSec(Math.max(10, parseInt(e.target.value) || 10))}
                  className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-mono"
                />
                <span className="text-xs text-slate-400">sec</span>
              </div>
            )}
          </div>

          {/* Script Match / Expand / Shorten Buttons */}
          {targetLength !== 'auto' && targetWords && (
            <div className="flex items-center gap-2 flex-wrap">
              {isTooShort && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                    Too short: needs ~{targetWords} words (currently {wordCount})
                  </span>
                  <button
                    type="button"
                    disabled={isAdjustingScript}
                    onClick={() => handleAdjustScript('expand')}
                    className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {isAdjustingScript ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span className="font-urdu">متن طویل کریں (Expand script)</span>
                  </button>
                </div>
              )}

              {isTooLong && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-500/30 px-2.5 py-1 rounded-lg">
                    Too long: needs ~{targetWords} words (currently {wordCount})
                  </span>
                  <button
                    type="button"
                    disabled={isAdjustingScript}
                    onClick={() => handleAdjustScript('shorten')}
                    className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {isAdjustingScript ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span className="font-urdu">متن مختصر کریں (Shorten script)</span>
                  </button>
                </div>
              )}

              {!isTooShort && !isTooLong && (
                <span className="text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Matches target duration (~{targetWords} words)</span>
                </span>
              )}
            </div>
          )}
        </div>

        {adjustMessage && (
          <div className="p-2 rounded-lg bg-indigo-950/60 border border-indigo-500/40 text-xs text-indigo-200 font-urdu flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{adjustMessage}</span>
          </div>
        )}
      </div>

      {/* 3. VOICE LIBRARY SELECTOR */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-white font-urdu flex items-center gap-2">
              <span>آواز کا انتخاب (AI Voice Persona)</span>
              <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-mono font-normal">
                Active: {selectedVoice.name}
              </span>
            </h3>
            <p className="text-[11.5px] text-slate-400 font-urdu">
              خاتون، مرد، بچے اور بوڑھا/بڑھیا کہانی گو کی منتخب آوازیں (Curated Voices with Fast Selection)
            </p>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span className="font-urdu">منتخب آواز:</span>
            <span className="text-white font-semibold font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
              {selectedVoice.name} ({selectedVoice.geminiVoice})
            </span>
          </div>
        </div>

        {/* Voice Library Picker Component */}
        <VoiceLibraryPicker
          voices={VOICES}
          selectedVoiceId={selectedVoiceId}
          onSelectVoice={(voice) => setSelectedVoiceId(voice.id)}
          language={language}
          speakingStyle={speakingStyle}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          sessionApiCalls={sessionApiCalls}
          previewCallsCount={previewCallsCount}
          onRecordApiCall={handleRecordApiCall}
          cooldownSecondsLeft={cooldownSecondsLeft}
          onTriggerCooldown={handleTriggerCooldown}
        />
      </div>

      {/* Global Generation Error Display (Bilingual with Cooldown & Details toggle) */}
      {generationGlobalError && (
        <FriendlyErrorBox
          error={generationGlobalError}
          cooldownSeconds={cooldownSecondsLeft}
          onRetry={handleRetryFailedChunks}
          onDismiss={() => setGenerationGlobalError(null)}
          language={language}
        />
      )}

      {/* 4. PRIMARY GENERATE ACTION */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Generate Voice Button */}
          <button
            type="button"
            disabled={isGeneratingVoice || !promptText.trim() || cooldownSecondsLeft > 0}
            onClick={handleGenerateVoice}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 cursor-pointer shadow-lg shadow-amber-500/20 disabled:opacity-40 transition-all active:scale-[0.99]"
            title={cooldownSecondsLeft > 0 ? `Wait ${cooldownSecondsLeft}s before generating` : 'Generate voice'}
          >
            {isGeneratingVoice ? (
              <RotateCw className="w-4 h-4 animate-spin text-slate-950" />
            ) : (
              <Mic2 className="w-4 h-4 text-slate-950" />
            )}
            <span className="font-urdu">آواز تیار کریں</span>
            {cooldownSecondsLeft > 0 ? (
              <span className="text-xs font-mono font-bold text-slate-950">({cooldownSecondsLeft}s)</span>
            ) : (
              <span className="text-xs font-sans opacity-80">(Generate Voice)</span>
            )}
          </button>

          {/* Retry Failed Chunks */}
          {failedCount > 0 && !isGeneratingVoice && (
            <button
              type="button"
              onClick={handleRetryFailedChunks}
              className="px-3.5 py-2.5 rounded-xl bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-500/40 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="font-urdu">ناکام حصے دوبارہ کوشش</span>
              <span className="font-mono">({failedCount})</span>
            </button>
          )}
        </div>

        {/* Selected voice indicator */}
        <div className="flex items-center gap-2 text-xs text-slate-400 font-urdu sm:justify-end">
          <span>آواز:</span>
          <span className="font-bold text-amber-300 font-sans">{selectedVoice.name}</span>
        </div>
      </div>

      {/* Generation Status Progress */}
      {isGeneratingVoice && generationProgressText && (
        <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3.5 flex items-center gap-2.5 text-xs text-amber-300 font-urdu animate-pulse">
          <RotateCw className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
          <span>{generationProgressText}</span>
        </div>
      )}

      {/* 
        ========================================================================
        5. UNIFIED AUDIO PLAYER & 1-CLICK DOWNLOAD (پلے اور اس کے نیچے 1 کلک ڈاؤنلوڈ)
        ========================================================================
      */}
      {fullAudioUrl && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-950 border-2 border-emerald-500/60 shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-emerald-500/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="font-urdu font-bold text-white text-sm sm:text-base">
                مکمل آڈیو کامیابی سے تیار ہو گئی! (Voiceover Complete)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-300 font-mono bg-emerald-950 px-2.5 py-1 rounded-full border border-emerald-500/40">
                {selectedVoice.name}
              </span>
              <button
                type="button"
                onClick={handleDeleteGeneratedAudio}
                className="px-2.5 py-1 rounded-lg bg-red-950/70 hover:bg-red-900/80 text-red-300 hover:text-white border border-red-500/40 text-xs font-urdu flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                title="آڈیو ڈیلیٹ کریں (Delete Audio)"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>ڈیلیٹ (Delete)</span>
              </button>
            </div>
          </div>

          {/* Player controls row */}
          <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
            {/* Big prominent Play/Pause toggle */}
            <button
              type="button"
              onClick={handleTogglePlayFull}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 cursor-pointer shadow-lg transition-all ${
                isPlayingFull
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 ring-2 ring-amber-400/50'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 ring-2 ring-emerald-400/50 active:scale-95'
              }`}
            >
              {isPlayingFull ? (
                <>
                  <Pause className="w-5 h-5 fill-current" />
                  <span className="font-urdu text-sm sm:text-base">آواز روکیں (Pause)</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span className="font-urdu text-sm sm:text-base">مکمل آڈیو سنیں (Play Audio)</span>
                </>
              )}
            </button>

            {/* Native Audio controls (Mobile-friendly scrubber & volume) */}
            <div className="w-full sm:max-w-md">
              <audio
                ref={fullAudioRef}
                src={fullAudioUrl}
                controls
                onEnded={() => setIsPlayingFull(false)}
                className="w-full h-10 rounded-xl bg-slate-950"
              />
            </div>
          </div>

          {/* 1-CLICK DOWNLOAD DIRECTLY UNDER THE PLAYER */}
          <div className="space-y-2 pt-1">
            <a
              href={serverDownloadUrl || fullAudioUrl || '#'}
              download={`voiceover-${selectedVoice.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.mp3`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDownloadFullMp3}
              className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 cursor-pointer shadow-xl shadow-emerald-950/50 border border-emerald-400/40 transition-all active:scale-[0.99] text-center no-underline"
              title="مکمل آڈیو ایک کلک پر ڈاؤنلوڈ کریں"
            >
              <Download className="w-5 h-5 text-white shrink-0" />
              <span className="font-urdu">
                ایک کلک ڈاؤن لوڈ: مکمل آڈیو فائل ڈاؤن لوڈ کریں (Download Full Audio MP3)
              </span>
            </a>

            {/* Mobile Native Share Sheet (Save to Android Files / WhatsApp / Google Drive) */}
            {canNativeShare && (
              <button
                type="button"
                onClick={handleMobileShareAudio}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
                title="موبائل فائل مینیجر میں محفوظ کریں یا واٹس ایپ پر بھیجیں"
              >
                <Share2 className="w-4 h-4 text-emerald-400" />
                <span className="font-urdu">
                  موبائل پر محفوظ / واٹس ایپ پر شیئر کریں (Save / Share via Mobile)
                </span>
              </button>
            )}

            {/* Prominent Delete Option for the Generated Audio */}
            <button
              type="button"
              onClick={handleDeleteGeneratedAudio}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-950/80 hover:bg-red-950/60 text-slate-400 hover:text-red-300 border border-slate-800 hover:border-red-500/40 text-xs sm:text-sm font-urdu flex items-center justify-center gap-2 cursor-pointer transition-colors active:scale-95"
              title="تیار شدہ آڈیو ختم کریں"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>یہ آڈیو ڈیلیٹ کریں (Delete Audio)</span>
            </button>

            {downloadNotice && (
              <p className="text-xs text-center text-emerald-300 font-urdu animate-in fade-in duration-150">
                {downloadNotice}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 5. CHUNKS LIST (When audio chunks exist) */}
      {chunks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-white font-urdu">
                آڈیو کے حصے اور ٹریکس / Voice Chunks{' '}
                <span className="text-[11px] text-slate-400 font-normal font-sans">
                  ({doneCount}/{chunks.length} Ready)
                </span>
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400 font-urdu">
                ہر حصے کو الگ سے سنیں (Preview)
              </span>
              <button
                type="button"
                onClick={handleDeleteGeneratedAudio}
                className="text-[11px] text-red-400 hover:text-red-300 font-urdu flex items-center gap-1 cursor-pointer transition-colors"
                title="تمام ٹریکس ڈیلیٹ کریں"
              >
                <Trash2 className="w-3 h-3 text-red-400" />
                <span>سب ڈیلیٹ کریں (Delete All)</span>
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {chunks.map((chunk) => {
              const isPlayingThis = playingChunkId === chunk.id;
              const hasAudio = !!chunk.audioUrl;
              const isFailed = chunk.status === 'failed';
              const isGenerating = chunk.status === 'generating';

              return (
                <div
                  key={chunk.id}
                  className={`bg-slate-900/90 border rounded-xl p-3.5 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    isFailed
                      ? 'border-red-500/40 bg-red-950/10'
                      : hasAudio
                      ? 'border-slate-800 hover:border-slate-700'
                      : 'border-slate-800/60 opacity-80'
                  }`}
                >
                  {/* Left: Chunk details & text */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-amber-400 font-mono">
                        #{chunk.chunkIndex}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {chunk.wordCount} words &bull; ~{chunk.estimatedSeconds}s
                      </span>
                      {chunk.duration && (
                        <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                          Actual: {chunk.duration}s
                        </span>
                      )}
                      {chunk.status === 'done' && (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-urdu">
                          <CheckCircle2 className="w-3 h-3" /> تیار ہے
                        </span>
                      )}
                    </div>

                    <p
                      className="text-xs text-slate-200 font-urdu line-clamp-2 leading-relaxed"
                      dir={language === 'urdu' ? 'rtl' : 'ltr'}
                    >
                      {chunk.text}
                    </p>

                    {/* Compact status for failed or waiting chunk */}
                    {isFailed && (
                      <div className="pt-1.5 flex items-center gap-1.5 text-[11px] text-amber-300 font-urdu">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>
                          {isQuotaError(chunk.rawError || chunk.errorMessage)
                            ? (cooldownSecondsLeft > 0
                                ? `کوٹہ کول ڈاؤن کا انتظار ہے (${cooldownSecondsLeft}s باقی)`
                                : 'کوٹہ تاخیر، دائیں طرف تیر کے نشان سے دوبارہ کوشش کریں')
                            : 'آڈیو تیار نہیں ہو سکی، دوبارہ کوشش کریں'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions for this chunk */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {/* Play Chunk Button */}
                    <button
                      type="button"
                      disabled={!hasAudio || isGenerating}
                      onClick={() => handleTogglePlayChunk(chunk)}
                      className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                        isPlayingThis
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed'
                      }`}
                      title="Play this chunk"
                    >
                      {isPlayingThis ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                    </button>

                    {/* Regenerate Chunk */}
                    <button
                      type="button"
                      disabled={isGenerating || isGeneratingVoice}
                      onClick={() => handleRegenerateChunk(chunk.id)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Regenerate this chunk"
                    >
                      <RotateCw
                        className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin text-amber-400' : ''}`}
                      />
                    </button>

                    {/* Delete this chunk */}
                    <button
                      type="button"
                      onClick={() => handleDeleteSingleChunk(chunk.id)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-300 transition-colors"
                      title="یہ حصہ ڈیلیٹ کریں (Delete Chunk)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
