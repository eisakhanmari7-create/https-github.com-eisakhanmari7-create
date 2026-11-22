import React, { useState } from 'react';
import {
  FileText,
  Volume2,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  AlignRight,
  AlignLeft,
  AlertCircle,
  Play,
  Type,
  Radio,
  Zap,
  Plus,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { VoiceOption, Tone } from '../types';
import { INITIAL_SAMPLE_SCRIPT } from '../data/presets';
import { HOOK_LIBRARY, HookItem } from '../data/hooks';

interface TTSStudioProps {
  script: string;
  setScript: (script: string) => void;
  selectedVoice: VoiceOption;
  selectedTone: Tone;
  onVoiceoverGenerated: (voiceover: any) => void;
  isAudioLoading: boolean;
  setIsAudioLoading: (loading: boolean) => void;
}

export const TTSStudio: React.FC<TTSStudioProps> = ({
  script,
  setScript,
  selectedVoice,
  selectedTone,
  onVoiceoverGenerated,
  isAudioLoading,
  setIsAudioLoading,
}) => {
  const [copied, setCopied] = useState(false);
  // User overrides when user manually clicks RTL/LTR or Font toggle
  const [userDirectionOverride, setUserDirectionOverride] = useState<'ltr' | 'rtl' | null>(null);
  const [userNastaliqOverride, setUserNastaliqOverride] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHookDrawer, setShowHookDrawer] = useState(false);
  const [selectedHookCategory, setSelectedHookCategory] = useState<'all' | 'urdu' | 'bilingual' | 'hindi_urdu' | 'english'>('all');

  // Automatically determine if script contains Urdu / Arabic characters synchronously without setState in useEffect
  const hasUrdu = /[\u0600-\u06FF]/.test(script);
  const direction: 'ltr' | 'rtl' = userDirectionOverride ?? (hasUrdu ? 'rtl' : 'ltr');
  const useNastaliq: boolean = userNastaliqOverride ?? hasUrdu;

  const handleInsertHook = (hookText: string, position: 'start' | 'end') => {
    if (position === 'start') {
      setScript(script.trim() ? `${hookText}\n\n${script.trim()}` : hookText);
    } else {
      setScript(script.trim() ? `${script.trim()}\n\n${hookText}` : hookText);
    }
  };

  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const charCount = script.length;
  // Average speaking pace ~130 words/minute
  const estimatedSeconds = Math.max(1, Math.round((wordCount / 130) * 60));

  const handleCopy = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleGenerateVoiceover = async () => {
    if (!script.trim()) {
      setError('Please provide or generate a script before generating voiceover.');
      return;
    }

    setError(null);
    setIsAudioLoading(true);

    try {
      const response = await fetch('/api/generate-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: script.trim(),
          voiceName: selectedVoice.geminiVoice,
          accent: selectedVoice.accent,
          gender: selectedVoice.gender,
          tone: selectedTone,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate voiceover audio');
      }

      // Construct a playable audio data URL
      const audioUrl = `data:${data.mimeType};base64,${data.audioBase64}`;

      onVoiceoverGenerated({
        id: `vo-${Date.now()}`,
        text: script.trim(),
        audioUrl,
        audioBase64: data.audioBase64,
        mimeType: data.mimeType || 'audio/wav',
        duration: data.duration || estimatedSeconds,
        voice: selectedVoice,
        tone: selectedTone,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (err: any) {
      console.error('Audio generation error:', err);
      setError(
        err.message ||
          'Failed to generate speech. Please verify your Gemini API key in Settings > Secrets.'
      );
    } finally {
      setIsAudioLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
      <div>
        {/* Header toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">2. TTS Studio</h2>
              <p className="text-xs text-slate-400">
                Review and edit your voiceover script
              </p>
            </div>
          </div>

          {/* Script manipulation controls */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* RTL / LTR Toggle */}
            <button
              type="button"
              onClick={() => setUserDirectionOverride(direction === 'rtl' ? 'ltr' : 'rtl')}
              title={direction === 'rtl' ? 'Right-to-Left (Urdu/Arabic)' : 'Left-to-Right'}
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                direction === 'rtl'
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {direction === 'rtl' ? (
                <>
                  <AlignRight className="w-3.5 h-3.5" />
                  <span className="text-[10px]">RTL</span>
                </>
              ) : (
                <>
                  <AlignLeft className="w-3.5 h-3.5" />
                  <span className="text-[10px]">LTR</span>
                </>
              )}
            </button>

            {/* Nastaliq Font Toggle */}
            <button
              type="button"
              onClick={() => setUserNastaliqOverride(!useNastaliq)}
              className={`px-2 py-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                useNastaliq
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle Urdu Nastaliq Typography"
            >
              <Type className="w-3.5 h-3.5" />
              <span className="text-[10px]">اردو Font</span>
            </button>

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors text-xs flex items-center gap-1"
              title="Copy script"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Copy</span>
                </>
              )}
            </button>

            {/* Add Hooks Library button */}
            <button
              id="btn-toggle-hooks"
              type="button"
              onClick={() => setShowHookDrawer((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition-all ${
                showHookDrawer
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold shadow-sm'
                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}
              title="Insert high-converting opening hooks"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Add Hooks</span>
              {showHookDrawer ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            {/* Load Sample button */}
            <button
              type="button"
              onClick={() => setScript(INITIAL_SAMPLE_SCRIPT)}
              className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white text-[10px] transition-colors"
              title="Load bilingual sample script"
            >
              Sample Script
            </button>

            {/* Clear button */}
            {script && (
              <button
                type="button"
                onClick={() => setScript('')}
                className="p-1.5 rounded-lg bg-slate-800/50 hover:bg-red-950/50 border border-slate-700 text-slate-400 hover:text-red-300 transition-colors"
                title="Clear text"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Hook Library Panel */}
        {showHookDrawer && (
          <div className="mb-3 p-3.5 rounded-xl bg-slate-950 border border-amber-500/40 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">
                  Catchy Hook Library
                </span>
                <span className="text-[10px] text-slate-400">
                  (Click a hook to insert directly into your script)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowHookDrawer(false)}
                className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-800"
              >
                Close
              </button>
            </div>

            {/* Category filter pills */}
            <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
              {[
                { id: 'all', label: 'All Hooks' },
                { id: 'bilingual', label: 'Bilingual (Urdu/Eng)' },
                { id: 'urdu', label: 'Urdu (اردو)' },
                { id: 'hindi_urdu', label: 'Hindi / Urdu' },
                { id: 'english', label: 'English' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedHookCategory(cat.id as any)}
                  className={`px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                    selectedHookCategory === cat.id
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Hooks grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
              {HOOK_LIBRARY.filter(
                (h) =>
                  selectedHookCategory === 'all' ||
                  h.category === selectedHookCategory
              ).map((hook) => (
                <div
                  key={hook.id}
                  className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 hover:border-amber-500/50 flex flex-col justify-between text-left transition-colors group"
                >
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-amber-400/90 font-medium mb-1">
                      <span>{hook.title}</span>
                      <span className="text-slate-500 uppercase">{hook.category}</span>
                    </div>
                    <p
                      className={`text-xs text-slate-200 leading-relaxed ${
                        hook.category === 'urdu' ? 'font-urdu text-sm' : ''
                      }`}
                    >
                      &ldquo;{hook.text}&rdquo;
                    </p>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleInsertHook(hook.text, 'start')}
                      className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 text-[10px] font-medium transition-colors"
                      title="Insert hook at the very beginning of the script"
                    >
                      + Add at Beginning
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertHook(hook.text, 'end')}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] transition-colors"
                      title="Append hook to the end of the script"
                    >
                      + Append
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Large Text Area */}
        <div className="relative">
          <textarea
            id="tts-script-editor"
            rows={7}
            dir={direction}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Generated script will appear here. You can also paste or manually type your own script in Urdu, Hindi, or English..."
            className={`w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all resize-y min-h-[160px] leading-relaxed text-sm ${
              useNastaliq ? 'font-urdu text-base' : 'font-sans'
            }`}
          />
        </div>

        {/* Metadata stats bar */}
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-400 mt-2 px-1">
          <div className="flex items-center gap-3">
            <span>{wordCount} words</span>
            <span>•</span>
            <span>{charCount} characters</span>
            <span>•</span>
            <span className="text-amber-400/90 font-medium">
              ~{estimatedSeconds}s audio length
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-indigo-300 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/60 text-[11px]">
            <Radio className="w-3 h-3 text-indigo-400" />
            <span>Voice: {selectedVoice.name} ({selectedVoice.accentLabel})</span>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mt-3 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-200">Audio Generation Failed</p>
              <p className="mt-0.5 text-red-300/90">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Primary Action Button: Generate Voiceover */}
      <div className="mt-4 pt-3 border-t border-slate-800">
        <button
          id="btn-generate-voiceover"
          type="button"
          onClick={handleGenerateVoiceover}
          disabled={isAudioLoading || !script.trim()}
          className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 hover:from-emerald-400 hover:via-teal-400 hover:to-indigo-500 active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAudioLoading ? (
            <>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-4 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-6 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-5 bg-white rounded-full animate-bounce" />
              </div>
              <span>Synthesizing High-Quality Voiceover with Gemini TTS...</span>
            </>
          ) : (
            <>
              <Volume2 className="w-5 h-5 text-white animate-pulse" />
              <span>Generate Voiceover</span>
              <span className="text-xs font-normal opacity-80">
                ({selectedVoice.name} • {selectedVoice.accentLabel})
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
