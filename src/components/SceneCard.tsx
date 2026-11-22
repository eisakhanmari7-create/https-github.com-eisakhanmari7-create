import React, { useState } from 'react';
import {
  VideoScene,
  AspectRatio,
  StylePreset,
  BrandKit,
} from '../types';
import {
  Volume2,
  Video,
  Play,
  Pause,
  Download,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  CopyPlus,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wand2,
} from 'lucide-react';

interface SceneCardProps {
  scene: VideoScene;
  index: number;
  totalScenes: number;
  aspectRatio: AspectRatio;
  stylePreset: StylePreset;
  brandKit?: BrandKit;
  playingSceneId: string | null;
  onUpdateScene: (sceneId: string, updates: Partial<VideoScene>) => void;
  onDeleteScene: (sceneId: string) => void;
  onDuplicateScene: (sceneId: string) => void;
  onMoveScene: (index: number, direction: 'up' | 'down') => void;
  onGenerateSingleAudio: (sceneId: string) => void;
  onGenerateSingleVideo: (sceneId: string) => void;
  onPlayAudio: (scene: VideoScene) => void;
  onDownloadAudio: (scene: VideoScene) => void;
  onDownloadVideo: (scene: VideoScene) => void;
  onAutoShortenVoiceover: (sceneId: string) => void;
  isShorteningVoiceover?: boolean;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  index,
  totalScenes,
  aspectRatio,
  stylePreset,
  brandKit,
  playingSceneId,
  onUpdateScene,
  onDeleteScene,
  onDuplicateScene,
  onMoveScene,
  onGenerateSingleAudio,
  onGenerateSingleVideo,
  onPlayAudio,
  onDownloadAudio,
  onDownloadVideo,
  onAutoShortenVoiceover,
  isShorteningVoiceover,
}) => {
  const [copied, setCopied] = useState(false);

  // Word count & 8-second timing analysis
  const words = scene.voiceoverScript.trim() ? scene.voiceoverScript.trim().split(/\s+/) : [];
  const wordCount = words.length;

  // 8-second timing indicator:
  // Ideal: 15-22 words (Green)
  // Borderline: 23-26 words (Orange)
  // Too long: > 26 words (Red)
  let timingStatus: 'safe' | 'borderline' | 'overflow' = 'safe';
  let timingLabel = 'مکمل فٹ (Fits in 8s)';
  let timingColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

  if (wordCount > 26) {
    timingStatus = 'overflow';
    timingLabel = 'بہت لمبا ہے (Too Long for 8s)';
    timingColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  } else if (wordCount > 22) {
    timingStatus = 'borderline';
    timingLabel = 'بارڈر لائن (Fast Narration)';
    timingColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  }

  // Scene status badge
  const status = scene.status || (scene.videoBlobUrl && scene.audioUrl ? 'done' : scene.isGeneratingAudio || scene.isRenderingVideo ? 'generating' : 'pending');

  const handleCopyPrompt = () => {
    const text = `Scene ${scene.sceneNumber} (${scene.durationSeconds || 8}s)
[VISUAL PROMPT]: ${scene.visualPrompt}
[CAMERA]: ${scene.cameraMovement}
[VOICEOVER SCRIPT]: ${scene.voiceoverScript}
[CAPTION]: ${scene.captionText}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 transition-all space-y-4 shadow-lg">
      {/* Top Header of Card */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          {/* Scene Number Badge */}
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
            #{scene.sceneNumber}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">
                سین {scene.sceneNumber} (Scene {scene.sceneNumber})
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {scene.durationSeconds || 8}s
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block font-urdu">
              کیمرہ: {scene.cameraMovement || 'Cinematic tracking shot'}
            </span>
          </div>
        </div>

        {/* Status Badge + Reorder & Action Buttons */}
        <div className="flex items-center gap-1.5">
          {/* Status Badge */}
          {status === 'generating' ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>بن رہا ہے (Generating)</span>
            </span>
          ) : status === 'done' ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>مکمل (Ready)</span>
            </span>
          ) : status === 'failed' ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/20 border border-rose-500/30 text-rose-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <span>خرابی (Failed)</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 border border-slate-700 text-slate-300">
              منتظر (Pending)
            </span>
          )}

          {/* Move Up / Down */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => onMoveScene(index, 'up')}
              disabled={index === 0}
              title="Move Scene Up"
              className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 hover:bg-slate-800"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMoveScene(index, 'down')}
              disabled={index === totalScenes - 1}
              title="Move Scene Down"
              className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 hover:bg-slate-800"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Duplicate Button */}
          <button
            onClick={() => onDuplicateScene(scene.id)}
            title="Duplicate Scene (ڈپلیکیٹ کریں)"
            className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <CopyPlus className="w-3.5 h-3.5" />
          </button>

          {/* Copy Prompt */}
          <button
            onClick={handleCopyPrompt}
            title="Copy scene prompts"
            className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Delete Button */}
          <button
            onClick={() => onDeleteScene(scene.id)}
            title="Delete Scene (حذف کریں)"
            className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Grid: Left is Visual Prompt & Video, Right is Voiceover & Audio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* FIELD 1: VISUAL PROMPT & VIDEO GENERATION (6 COLS) */}
        <div className="lg:col-span-6 space-y-3 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              <span>1. ویژول پرامپٹ (Visual Prompt)</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Style: {stylePreset}
            </span>
          </div>

          {/* Editable Visual Prompt */}
          <textarea
            value={scene.visualPrompt}
            onChange={(e) => onUpdateScene(scene.id, { visualPrompt: e.target.value })}
            placeholder="کیمرہ، ماحول، لائٹنگ، اور منظر کی تفصیل درج کریں..."
            rows={3}
            className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none font-sans leading-relaxed resize-y"
          />

          {/* Camera movement input & caption */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">کیمرہ موومنٹ:</label>
              <input
                type="text"
                value={scene.cameraMovement}
                onChange={(e) => onUpdateScene(scene.id, { cameraMovement: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-[11px] focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">سب ٹائٹل کیپشن:</label>
              <input
                type="text"
                value={scene.captionText}
                onChange={(e) => onUpdateScene(scene.id, { captionText: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-amber-300 text-[11px] focus:outline-none focus:border-amber-500 font-urdu"
              />
            </div>
          </div>

          {/* Video Preview Player */}
          {scene.videoBlobUrl ? (
            <div className="space-y-1.5">
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video">
                <video
                  src={scene.videoBlobUrl}
                  controls
                  className="w-full h-full object-contain"
                  poster={scene.visualUrl}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onDownloadVideo(scene)}
                  className="flex-1 py-1.5 px-3 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ویڈیو ڈاؤن لوڈ (Download MP4)</span>
                </button>
                <button
                  onClick={() => onGenerateSingleVideo(scene.id)}
                  disabled={scene.isRenderingVideo || scene.isGeneratingVisual}
                  title="Regenerate this video clip only"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scene.isRenderingVideo ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          ) : scene.visualUrl ? (
            <div className="space-y-2">
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video max-h-36">
                <img
                  src={scene.visualUrl}
                  alt={`Scene ${scene.sceneNumber}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <span className="absolute bottom-1 right-1 text-[9px] bg-black/75 px-1.5 py-0.5 rounded text-slate-300">
                  فریم ریڈی
                </span>
              </div>
              <button
                onClick={() => onGenerateSingleVideo(scene.id)}
                disabled={scene.isRenderingVideo}
                className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
              >
                {scene.isRenderingVideo ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>ویڈیو رینڈر ہو رہی ہے ({scene.renderProgress || 20}%)...</span>
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5" />
                    <span>اس سین کی ویڈیو بنائیں (Render 8s Clip)</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={() => onGenerateSingleVideo(scene.id)}
              disabled={scene.isRenderingVideo || scene.isGeneratingVisual}
              className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {scene.isRenderingVideo || scene.isGeneratingVisual ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>ویڈیو بن رہی ہے ({scene.renderProgress || 15}%)...</span>
                </>
              ) : (
                <>
                  <Video className="w-3.5 h-3.5" />
                  <span>اس سین کی ویڈیو تیار کریں (Generate 8s Video)</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* FIELD 2: VOICEOVER TEXT & AUDIO GENERATION (6 COLS) */}
        <div className="lg:col-span-6 space-y-3 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" />
              <span>2. وائس اوور اسکرپٹ (Voiceover Text)</span>
            </span>

            {/* 8-Second Timing Badge */}
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${timingColor}`}>
                <Clock className="w-3 h-3" />
                <span>{wordCount} الفاظ &bull; {timingLabel}</span>
              </span>
            </div>
          </div>

          {/* Editable Voiceover Script */}
          <textarea
            value={scene.voiceoverScript}
            onChange={(e) => onUpdateScene(scene.id, { voiceoverScript: e.target.value })}
            placeholder="وہ الفاظ جو آواز میں بولے جائیں گے (Urdu / Hindi / English)..."
            rows={3}
            dir="rtl"
            className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-urdu leading-loose resize-y text-right"
          />

          {/* Auto-shorten trigger button if borderline or overflow */}
          {wordCount > 22 && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-[11px] text-amber-300 font-urdu">
                یہ جملہ ۸ سیکنڈ کے لیے لمبا ہو سکتا ہے (مطلوبہ: ۱۸ سے ۲۲ الفاظ)
              </span>
              <button
                type="button"
                onClick={() => onAutoShortenVoiceover(scene.id)}
                disabled={isShorteningVoiceover}
                className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-semibold flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer shrink-0"
              >
                {isShorteningVoiceover ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Wand2 className="w-3 h-3" />
                )}
                <span>آٹو مختصر کریں (Auto-shorten)</span>
              </button>
            </div>
          )}

          {/* Audio Controls */}
          {scene.audioUrl ? (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => onPlayAudio(scene)}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                {playingSceneId === scene.id ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>آڈیو روکیں (Pause)</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>آڈیو سنیں (Play 8s Audio)</span>
                  </>
                )}
              </button>

              <button
                onClick={() => onDownloadAudio(scene)}
                title="Download single scene MP3"
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>MP3</span>
              </button>

              <button
                onClick={() => onGenerateSingleAudio(scene.id)}
                disabled={scene.isGeneratingAudio}
                title="Regenerate this voiceover only"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scene.isGeneratingAudio ? 'animate-spin' : ''}`} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onGenerateSingleAudio(scene.id)}
              disabled={scene.isGeneratingAudio || !scene.voiceoverScript.trim()}
              className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {scene.isGeneratingAudio ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>آواز تیار ہو رہی ہے...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>صرف آواز بنائیں (Generate Voiceover)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
