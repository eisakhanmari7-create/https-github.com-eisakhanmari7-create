import React, { useState, useEffect } from 'react';
import {
  Film,
  RotateCw,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FileArchive,
  Layers,
  Sparkles,
  Info,
  Sliders,
  ShieldAlert,
  ChevronDown,
  X,
  Play,
} from 'lucide-react';
import JSZip from 'jszip';
import { VideoScene, AspectRatio } from '../types';
import { renderSceneToVideoBlob, mergeFullVideo } from '../utils/videoRenderer';
import { categorizeError } from './CleanVideoStudio';

export type ClipDurationOption = 5 | 8 | 10 | 16 | 20 | 'custom';
export type VideoCountOption = 1 | 2 | 3 | 4 | 6 | 8 | 10 | 'custom';

interface VideoStudioTabProps {
  promptText: string;
  setPromptText: (text: string) => void;
  isTestMode?: boolean;
}

export const VideoStudioTab: React.FC<VideoStudioTabProps> = ({
  promptText,
  setPromptText,
  isTestMode = false,
}) => {
  // 1. DURATION & COUNT CONTROLS
  const [durationOption, setDurationOption] = useState<ClipDurationOption>(8);
  const [customDuration, setCustomDuration] = useState<number>(12);

  const [countOption, setCountOption] = useState<VideoCountOption>(4);
  const [customCount, setCustomCount] = useState<number>(5);

  // Visual Engine
  const [visualEngine, setVisualEngine] = useState<'auto' | 'cinematic' | 'gemini'>('auto');

  // Aspect Ratio
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');

  // 2. MY QUOTA SETTING
  const getTodayDateKey = () => {
    const d = new Date();
    return `video_quota_used_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  };

  const [quotaLimit, setQuotaLimit] = useState<number | null>(() => {
    const saved = localStorage.getItem('my_manual_daily_video_quota');
    return saved ? Number(saved) : null;
  });

  const [usedToday, setUsedToday] = useState<number>(() => {
    const saved = localStorage.getItem(getTodayDateKey());
    return saved ? Number(saved) : 0;
  });

  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState<boolean>(false);
  const [quotaInputVal, setQuotaInputVal] = useState<string>(quotaLimit ? String(quotaLimit) : '');

  const saveQuotaLimit = (val: string) => {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      setQuotaLimit(num);
      localStorage.setItem('my_manual_daily_video_quota', String(num));
    } else {
      setQuotaLimit(null);
      localStorage.removeItem('my_manual_daily_video_quota');
    }
    setIsQuotaModalOpen(false);
  };

  const incrementUsedQuota = (count = 1) => {
    const next = usedToday + count;
    setUsedToday(next);
    localStorage.setItem(getTodayDateKey(), String(next));
  };

  // Active Effective Values
  const effectiveDuration =
    durationOption === 'custom' ? Math.max(3, customDuration) : durationOption;
  const effectiveCount = isTestMode
    ? 1
    : countOption === 'custom'
    ? Math.max(1, customCount)
    : countOption;

  // Sub-clips calculation for durations above 8s
  const subClipsPerVideo =
    effectiveDuration > 8 ? Math.max(2, Math.ceil(effectiveDuration / 8)) : 1;
  const totalSeconds = effectiveCount * effectiveDuration;
  const estimatedApiCalls =
    visualEngine === 'cinematic' ? 0 : effectiveCount * subClipsPerVideo;

  // Quota Warning Check
  const willExceedQuota =
    quotaLimit !== null && usedToday + estimatedApiCalls > quotaLimit;

  // 3. SCENES STATE
  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStatusText, setGenerationStatusText] = useState<string>('');
  const [isMergingFullVideo, setIsMergingFullVideo] = useState<boolean>(false);

  // Helper to fetch visual with auto smart fallback
  const fetchSceneVisual = async (
    visualPrompt: string,
    sceneNum: number,
    forceEngine?: 'auto' | 'cinematic' | 'gemini'
  ): Promise<{ imageUrl: string; videoSource: 'ai_video' | 'cinematic_fallback' }> => {
    const engineToUse = forceEngine || visualEngine;

    // 1. If purely cinematic mode
    if (engineToUse === 'cinematic') {
      const res = await fetch('/api/get-thematic-visual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visualPrompt, prompt: visualPrompt, sceneNumber: sceneNum }),
      });
      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }
      return {
        imageUrl:
          data.imageUrl ||
          data.visualUrl ||
          'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1280&q=80',
        videoSource: 'cinematic_fallback',
      };
    }

    // 2. Gemini AI / Auto Smart with retry
    let attempt = 0;
    while (attempt < 2) {
      attempt++;
      try {
        const res = await fetch('/api/generate-scene-visual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visualPrompt,
            sceneNumber: sceneNum,
            visualEngine: engineToUse,
            fallbackToCurated: engineToUse === 'auto',
          }),
        });

        const rawText = await res.text();
        let data: any = {};
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error(`Server returned non-JSON response (${res.status}): ${rawText.slice(0, 100) || 'empty response'}`);
        }

        if (!res.ok || !data.success) {
          const errStr = String(data.error || 'Visual generation failed');
          if (
            (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) &&
            engineToUse === 'gemini' &&
            attempt === 1
          ) {
            setGenerationStatusText('کوٹہ کی حد، 20 سیکنڈ انتظار ہو رہا ہے...');
            await new Promise((r) => setTimeout(r, 20000));
            continue;
          }
          throw new Error(data.error || 'Visual generation failed');
        }

        // Increment quota counter if real AI was used
        if (data.source === 'gemini_generated') {
          incrementUsedQuota(1);
        }

        const isAi = data.source === 'gemini_generated';
        const finalUrl =
          data.imageUrl ||
          data.visualUrl ||
          'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1280&q=80';
        return {
          imageUrl: finalUrl,
          videoSource: isAi ? 'ai_video' : 'cinematic_fallback',
        };
      } catch (err: any) {
        if (attempt >= 2 || engineToUse === 'gemini') {
          throw err;
        }
      }
    }

    throw new Error('Visual generation failed');
  };

  // Generate All Videos
  const handleGenerateVideos = async () => {
    if (!promptText.trim()) return;

    setIsGenerating(true);
    setGenerationStatusText('مناظر تیار کیے جا رہے ہیں...');

    // Parse user input into individual prompts or generate structured scenes
    let visualPrompts: string[] = [];
    const rawLines = promptText
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 2);

    if (rawLines.length >= effectiveCount) {
      visualPrompts = rawLines.slice(0, effectiveCount);
    } else {
      // Repeat or expand to match effectiveCount
      for (let i = 0; i < effectiveCount; i++) {
        visualPrompts.push(
          rawLines[i % rawLines.length] || `Cinematic visual scene ${i + 1} for: ${promptText.slice(0, 80)}`
        );
      }
    }

    // Initialize scenes state
    const initialScenes: VideoScene[] = visualPrompts.map((p, idx) => ({
      id: `video-scene-${Date.now()}-${idx}`,
      sceneNumber: idx + 1,
      durationSeconds: effectiveDuration,
      visualPrompt: p,
      voiceoverScript: '', // Silent video
      cameraMovement: 'Cinematic Camera',
      captionText: '', // No on-screen text
      videoStatus: 'pending',
      status: 'pending',
    }));

    setScenes(initialScenes);

    // Process each scene sequentially
    const updated = [...initialScenes];
    for (let i = 0; i < updated.length; i++) {
      const scene = updated[i];
      setGenerationStatusText(`کلپ ${i + 1} آف ${updated.length} تیار ہو رہا ہے...`);

      setScenes((prev) =>
        prev.map((s, idx) =>
          idx === i ? { ...s, videoStatus: 'generating', status: 'generating' } : s
        )
      );

      try {
        const imageUrls: string[] = [];
        let determinedSource: 'ai_video' | 'cinematic_fallback' = 'cinematic_fallback';

        // For duration > 8s, generate connected 8s clips
        for (let sub = 0; sub < subClipsPerVideo; sub++) {
          const subPrompt =
            subClipsPerVideo > 1
              ? `${scene.visualPrompt} (Shot ${sub + 1} of ${subClipsPerVideo}: connected continuous cinematic angle)`
              : scene.visualPrompt;

          const res = await fetchSceneVisual(subPrompt, scene.sceneNumber);
          imageUrls.push(res.imageUrl);
          if (res.videoSource === 'ai_video') determinedSource = 'ai_video';
        }

        // Render SILENT video (empty captionText, no audio)
        const videoBlob = await renderSceneToVideoBlob(
          imageUrls,
          scene.durationSeconds,
          '', // No on-screen caption text
          { aspectRatio }
        );
        const videoBlobUrl = URL.createObjectURL(videoBlob);

        updated[i] = {
          ...scene,
          visualUrl: imageUrls[0],
          videoBlobUrl,
          videoSource: determinedSource,
          videoStatus: 'done',
          status: 'done',
          errorMessage: undefined,
          errorDetails: undefined,
        };
        setScenes([...updated]);
      } catch (err: any) {
        console.error(`Scene ${i + 1} video failed:`, err);
        const cat = categorizeError(err);
        const errorText =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
            ? err
            : 'Scene video rendering error';
        updated[i] = {
          ...scene,
          videoStatus: 'failed',
          status: 'failed',
          errorMessage: `${cat.labelUrdu} (${cat.labelEn})`,
          errorDetails: errorText,
        };
        setScenes([...updated]);
      }
    }

    setGenerationStatusText('');
    setIsGenerating(false);
  };

  // Regenerate a single scene (does NOT affect others)
  const handleRegenerateScene = async (sceneId: string) => {
    const sceneIdx = scenes.findIndex((s) => s.id === sceneId);
    if (sceneIdx === -1) return;

    const targetScene = scenes[sceneIdx];
    setScenes((prev) =>
      prev.map((s) =>
        s.id === sceneId
          ? { ...s, videoStatus: 'generating', status: 'generating', errorMessage: undefined }
          : s
      )
    );

    try {
      const imageUrls: string[] = [];
      let determinedSource: 'ai_video' | 'cinematic_fallback' = 'cinematic_fallback';

      for (let sub = 0; sub < subClipsPerVideo; sub++) {
        const subPrompt =
          subClipsPerVideo > 1
            ? `${targetScene.visualPrompt} (Shot ${sub + 1} of ${subClipsPerVideo})`
            : targetScene.visualPrompt;

        const res = await fetchSceneVisual(subPrompt, targetScene.sceneNumber);
        imageUrls.push(res.imageUrl);
        if (res.videoSource === 'ai_video') determinedSource = 'ai_video';
      }

      const videoBlob = await renderSceneToVideoBlob(
        imageUrls,
        targetScene.durationSeconds,
        '',
        { aspectRatio }
      );
      const videoBlobUrl = URL.createObjectURL(videoBlob);

      const nextScenes = [...scenes];
      nextScenes[sceneIdx] = {
        ...targetScene,
        visualUrl: imageUrls[0],
        videoBlobUrl,
        videoSource: determinedSource,
        videoStatus: 'done',
        status: 'done',
        errorMessage: undefined,
        errorDetails: undefined,
      };
      setScenes(nextScenes);
    } catch (err: any) {
      const cat = categorizeError(err);
      const errorText =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
          ? err
          : 'Scene video rendering error';
      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                videoStatus: 'failed',
                status: 'failed',
                errorMessage: `${cat.labelUrdu} (${cat.labelEn})`,
                errorDetails: errorText,
              }
            : s
        )
      );
    }
  };

  // Retry all failed scenes only
  const handleRetryAllFailed = async () => {
    const failedScenes = scenes.filter((s) => s.videoStatus === 'failed');
    if (failedScenes.length === 0) return;

    setIsGenerating(true);
    for (const s of failedScenes) {
      await handleRegenerateScene(s.id);
    }
    setIsGenerating(false);
  };

  // Delete a scene
  const handleDeleteScene = (sceneId: string) => {
    const target = scenes.find((s) => s.id === sceneId);
    if (target?.videoBlobUrl) URL.revokeObjectURL(target.videoBlobUrl);
    setScenes((prev) => prev.filter((s) => s.id !== sceneId));
  };

  // Download a single scene video
  const handleDownloadSceneVideo = (scene: VideoScene) => {
    if (!scene.videoBlobUrl) return;
    const a = document.createElement('a');
    a.href = scene.videoBlobUrl;
    a.download = `video-scene-${scene.sceneNumber}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download All Videos ZIP
  const handleDownloadAllZip = async () => {
    const validVideos = scenes.filter((s) => s.videoBlobUrl && s.videoStatus === 'done');
    if (validVideos.length === 0) return;

    const zip = new JSZip();
    const folder = zip.folder('silent_videos');

    for (let i = 0; i < validVideos.length; i++) {
      const s = validVideos[i];
      const blob = await fetch(s.videoBlobUrl!).then((r) => r.blob());
      folder?.file(`scene_${s.sceneNumber}_${s.durationSeconds}s.mp4`, blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `silent-videos-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Merge Full Video MP4
  const handleMergeFullVideo = async () => {
    const validScenes = scenes.filter((s) => s.videoBlobUrl && s.videoStatus === 'done');
    if (validScenes.length === 0) return;

    setIsMergingFullVideo(true);
    try {
      const mergedBlob = await mergeFullVideo(
        validScenes.map((s) => ({
          visualUrl: s.visualUrl,
          durationSeconds: s.durationSeconds,
          captionText: '', // Silent, no captions
          audioBase64: undefined,
        })),
        {
          aspectRatio,
          burnSubtitles: false,
          bgMusicVolume: 0, // completely silent video
        }
      );

      const url = URL.createObjectURL(mergedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `full-marketing-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error('Failed to merge full video:', err);
    } finally {
      setIsMergingFullVideo(false);
    }
  };

  const readyVideosCount = scenes.filter((s) => s.videoBlobUrl && s.videoStatus === 'done').length;
  const failedScenesCount = scenes.filter((s) => s.videoStatus === 'failed').length;

  return (
    <div className="space-y-5">
      {/* 1. TOP VIDEO CONTROLS ROW */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Duration Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-amber-400 font-urdu block">
              کلپ کا دورانیہ / Clip Duration:
            </label>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap">
              {([5, 8, 10, 16, 20, 'custom'] as ClipDurationOption[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationOption(d)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    durationOption === d
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {d === 'custom' ? 'Custom' : `${d}s`}
                </button>
              ))}
            </div>

            {durationOption === 'custom' && (
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Math.max(3, parseInt(e.target.value) || 3))}
                  className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-mono"
                />
                <span className="text-xs text-slate-400">seconds per clip</span>
              </div>
            )}
            {effectiveDuration > 8 && (
              <span className="text-[10px] text-amber-400/90 font-mono block">
                (&gt;8s: {subClipsPerVideo} connected 8s clips will be stitched automatically)
              </span>
            )}
          </div>

          {/* Number of Videos */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-amber-400 font-urdu block">
              ویڈیوز کی تعداد / Number of Videos:
            </label>
            {isTestMode ? (
              <div className="p-2 bg-amber-950/30 border border-amber-500/30 rounded-xl text-xs text-amber-300 font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Test Mode active: 1 Video only</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap">
                {([1, 2, 3, 4, 6, 8, 10, 'custom'] as VideoCountOption[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCountOption(c)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                      countOption === c
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {c === 'custom' ? 'Custom' : `${c}`}
                  </button>
                ))}
              </div>
            )}

            {!isTestMode && countOption === 'custom' && (
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={customCount}
                  onChange={(e) => setCustomCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-mono"
                />
                <span className="text-xs text-slate-400">videos</span>
              </div>
            )}
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-amber-400 font-urdu block">
              فارمیسی / Aspect Ratio:
            </label>
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {(['16:9', '9:16', '1:1'] as AspectRatio[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAspectRatio(r)}
                  className={`flex-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    aspectRatio === r
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Visual Engine Selector & My Quota Setting */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-amber-400 font-urdu">
              ویژول انجن / Visual Engine:
            </span>
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap">
              <button
                type="button"
                onClick={() => setVisualEngine('auto')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  visualEngine === 'auto'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <span className="font-urdu">آٹو سمارٹ (تجویز کردہ)</span>
                <span className="text-[10px] opacity-75 ml-1">Auto Smart</span>
              </button>

              <button
                type="button"
                onClick={() => setVisualEngine('cinematic')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  visualEngine === 'cinematic'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <span className="font-urdu">16:9 سینیمیٹک HD (فری اور فوری)</span>
                <span className="text-[10px] opacity-75 ml-1">Cinematic HD</span>
              </button>

              <button
                type="button"
                onClick={() => setVisualEngine('gemini')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  visualEngine === 'gemini'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <span className="font-urdu">صرف Gemini AI</span>
                <span className="text-[10px] opacity-75 ml-1">(Paid API)</span>
              </button>
            </div>
          </div>

          {/* My Quota Setting Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsQuotaModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-urdu">میرا کوٹہ (My Quota)</span>
              <span className="text-[11px] font-mono text-amber-300">
                Used: {usedToday} {quotaLimit ? `/ ${quotaLimit}` : ''}
              </span>
            </button>
          </div>
        </div>

        {/* Short Note explaining that Cinematic HD is a stylised image-motion clip */}
        <div className="pt-2 border-t border-slate-800/60 flex items-start gap-1.5 text-[11px] text-slate-400">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-slate-300">Note:</strong> Cinematic HD is a stylised image-motion clip, not a generated AI video.
            <span className="text-slate-500 font-urdu mr-1 hidden sm:inline">
              {' '}(سینیمیٹک HD ایک اسٹائلائزڈ امیج موشن کلپ ہے، AI جنریٹڈ ویڈیو نہیں)
            </span>
          </span>
        </div>
      </div>

      {/* 2. PRE-GENERATION ESTIMATION BANNER */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white">
              This will create {effectiveCount} clips totalling {totalSeconds} seconds, about{' '}
              {estimatedApiCalls} API calls.
            </span>
          </div>
          <span className="text-xs font-urdu text-amber-300">
            (یہ {effectiveCount} کلپس کل {totalSeconds} سیکنڈز بنائے گا، تقریباً {estimatedApiCalls} API کالز)
          </span>
        </div>

        {/* Quota warning banner if exceeding limit */}
        {willExceedQuota && (
          <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>انتباہ (Warning):</strong> یہ درخواست تقریباً {estimatedApiCalls} API کالز طلب کرے گی، جو آپ کے طے کردہ یومیہ کوٹہ ({quotaLimit}) سے تجاوز کر سکتی ہے (آج استعمال شدہ: {usedToday})۔ آپ 16:9 Cinematic HD منتخب کر کے بغیر کسی کوٹہ کے مفت ویڈیو بنا سکتے ہیں۔
            </span>
          </div>
        )}
      </div>

      {/* 3. GENERATION ACTION & EXPORT BUTTONS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Generate Videos Button */}
          <button
            type="button"
            disabled={isGenerating || !promptText.trim()}
            onClick={handleGenerateVideos}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 disabled:opacity-40 transition-all"
          >
            {isGenerating ? (
              <RotateCw className="w-4 h-4 animate-spin text-slate-950" />
            ) : (
              <Film className="w-4 h-4" />
            )}
            <span className="font-urdu">ویڈیوز تیار کریں</span>
            <span className="text-xs font-sans opacity-80">(Generate Videos)</span>
          </button>

          {/* Retry All Failed Button */}
          {failedScenesCount > 0 && !isGenerating && (
            <button
              type="button"
              onClick={handleRetryAllFailed}
              className="px-3.5 py-2.5 rounded-xl bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-500/40 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="font-urdu">ناکام کلپس دوبارہ کوشش</span>
              <span className="font-mono">({failedScenesCount})</span>
            </button>
          )}
        </div>

        {/* Video Export Buttons (Enabled ONLY when files exist) */}
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          {/* Download All Videos ZIP */}
          <button
            type="button"
            disabled={readyVideosCount === 0}
            onClick={handleDownloadAllZip}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={readyVideosCount > 0 ? 'Download all scene videos as ZIP' : 'Generate videos first'}
          >
            <FileArchive className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-urdu">تمام ویڈیوز ZIP ڈاؤنلوڈ</span>
          </button>

          {/* Merge Full Video MP4 */}
          <button
            type="button"
            disabled={readyVideosCount === 0 || isMergingFullVideo}
            onClick={handleMergeFullVideo}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={readyVideosCount > 0 ? 'Merge scenes into one continuous MP4' : 'Generate videos first'}
          >
            {isMergingFullVideo ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <Film className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="font-urdu">مکمل ویڈیو MP4 بنائیں</span>
          </button>
        </div>
      </div>

      {/* Generation Status Progress */}
      {isGenerating && generationStatusText && (
        <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 flex items-center gap-2.5 text-xs text-amber-300 font-urdu animate-pulse">
          <RotateCw className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
          <span>{generationStatusText}</span>
        </div>
      )}

      {/* 4. COMPACT SCENE CARDS */}
      {scenes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-white font-urdu">
                ویڈیو کے مناظر / Scene Clips{' '}
                <span className="text-[11px] text-slate-400 font-normal font-sans">
                  ({readyVideosCount}/{scenes.length} Ready)
                </span>
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-urdu">
              خاموش ویڈیوز (Silent Visuals Only)
            </span>
          </div>

          <div className="space-y-3">
            {scenes.map((scene) => {
              const hasVideo = !!scene.videoBlobUrl;
              const isFailed = scene.videoStatus === 'failed';
              const isGeneratingThis = scene.videoStatus === 'generating';
              const errInfo = scene.errorMessage
                ? categorizeError(scene.errorDetails || scene.errorMessage)
                : null;

              const isAiSource = scene.videoSource === 'ai_video';

              return (
                <div
                  key={scene.id}
                  className={`bg-slate-900/90 border rounded-2xl p-4 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                    isFailed
                      ? 'border-red-500/40 bg-red-950/10'
                      : hasVideo
                      ? 'border-slate-800 hover:border-slate-700'
                      : 'border-slate-800/60 opacity-85'
                  }`}
                >
                  {/* Left info & prompt */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-amber-400 font-mono">
                        #{scene.sceneNumber}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {scene.durationSeconds}s clip &bull; Silent (خاموش)
                      </span>

                      {/* True Source Badge */}
                      {hasVideo && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono tracking-wide ${
                            isAiSource
                              ? 'bg-purple-950/80 border border-purple-500/40 text-purple-300'
                              : 'bg-amber-950/80 border border-amber-500/40 text-amber-300'
                          }`}
                        >
                          {isAiSource
                            ? 'AI Video (Gemini/Veo)'
                            : 'Cinematic Fallback (pan/zoom)'}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 line-clamp-2">
                      <span className="text-slate-500">Visual Prompt: </span>
                      {scene.visualPrompt}
                    </p>

                    {/* Real Error Details */}
                    {isFailed && errInfo && (
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded">
                            <AlertCircle className="w-3 h-3" />
                            <span className="font-urdu">{errInfo.labelUrdu}</span>
                            <span className="font-mono text-[10px]">({errInfo.labelEn})</span>
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              setScenes((prev) =>
                                prev.map((s) =>
                                  s.id === scene.id ? { ...s, showDetails: !s.showDetails } : s
                                )
                              )
                            }
                            className="text-[10px] text-slate-400 hover:text-amber-300 underline cursor-pointer"
                          >
                            {scene.showDetails ? 'تفصیلات چھپائیں / Hide details' : 'تفصیلات / Details'}
                          </button>
                        </div>

                        {scene.showDetails && (
                          <div className="mt-1 p-2 rounded bg-slate-950/90 border border-slate-800 text-[11px] text-slate-300 font-mono space-y-1">
                            <p className="font-urdu text-amber-400">{errInfo.descUrdu}</p>
                            <p className="text-slate-400">{errInfo.descEn}</p>
                            {scene.errorDetails && (
                              <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800 break-all">
                                {scene.errorDetails}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Center: Video Preview */}
                  <div className="shrink-0 w-full sm:w-48 md:w-40 flex flex-col items-center justify-center">
                    {isGeneratingThis ? (
                      <div className="w-full h-24 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center gap-1.5 text-slate-500 text-[10px]">
                        <RotateCw className="w-4 h-4 animate-spin text-amber-400" />
                        <span className="font-urdu">ویڈیو تیار ہو رہی ہے...</span>
                      </div>
                    ) : hasVideo ? (
                      <video
                        src={scene.videoBlobUrl}
                        controls
                        playsInline
                        className="w-full h-24 object-cover rounded-xl bg-slate-950 border border-slate-800 shadow"
                      />
                    ) : isFailed ? (
                      <div className="w-full h-24 bg-red-950/20 border border-red-500/30 rounded-xl flex flex-col items-center justify-center p-2 text-center gap-1">
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        <span className="text-[10px] text-red-300 font-urdu">
                          {errInfo?.labelUrdu || 'ویڈیو ناکام'}
                        </span>
                      </div>
                    ) : (
                      <div className="w-full h-24 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-center text-slate-600 text-[10px]">
                        Pending
                      </div>
                    )}
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {/* Regenerate single scene */}
                    <button
                      type="button"
                      disabled={isGeneratingThis || isGenerating}
                      onClick={() => handleRegenerateScene(scene.id)}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Regenerate this video scene only"
                    >
                      <RotateCw
                        className={`w-4 h-4 ${isGeneratingThis ? 'animate-spin text-amber-400' : ''}`}
                      />
                    </button>

                    {/* Download scene video */}
                    <button
                      type="button"
                      disabled={!hasVideo || isGeneratingThis}
                      onClick={() => handleDownloadSceneVideo(scene)}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Download this video clip"
                    >
                      <Download className="w-4 h-4 text-amber-400" />
                    </button>

                    {/* Delete scene */}
                    <button
                      type="button"
                      disabled={isGeneratingThis}
                      onClick={() => handleDeleteScene(scene.id)}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-red-950/60 hover:text-red-400 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Delete this scene"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MY QUOTA MODAL */}
      {isQuotaModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white font-urdu">
                  میرا ویڈیو کوٹہ / Daily Quota Tracker
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuotaModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Enter your manual daily video API limit below. The app counts video generation calls performed today and warns you if a new batch would exceed your limit.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Daily Limit (Leave empty for unknown/no limit):
              </label>
              <input
                type="number"
                min={1}
                max={10000}
                placeholder="e.g. 50"
                value={quotaInputVal}
                onChange={(e) => setQuotaInputVal(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Used today (آج استعمال شدہ):</span>
                <span className="font-mono font-bold text-amber-400">{usedToday} calls</span>
              </div>
              <p className="text-[11px] text-slate-500 pt-1">
                Notice: We do not pretend to know your real API quota. This is a local tracker based on your manually entered plan limit.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsQuotaModalOpen(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveQuotaLimit(quotaInputVal)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
              >
                Save Limit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
