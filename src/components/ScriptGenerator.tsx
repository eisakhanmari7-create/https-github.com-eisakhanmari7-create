import React, { useState } from 'react';
import { Sparkles, Wand2, RefreshCw, Layers, Clock, AlertCircle } from 'lucide-react';
import { PROMPT_PRESETS } from '../data/presets';

interface ScriptGeneratorProps {
  onScriptGenerated: (script: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const ScriptGenerator: React.FC<ScriptGeneratorProps> = ({
  onScriptGenerated,
  isLoading,
  setIsLoading,
}) => {
  const [prompt, setPrompt] = useState(
    'Write a company profile or promotional script with catchy hooks in Urdu/English'
  );
  const [language, setLanguage] = useState('bilingual');
  const [tone, setTone] = useState('catchy');
  const [duration, setDuration] = useState('30s');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) {
      setError('Please enter a prompt for your script.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          language,
          tone,
          targetDuration: duration,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate script with Gemini API');
      }

      onScriptGenerated(data.script);
    } catch (err: any) {
      console.error('Script generation error:', err);
      setError(
        err.message ||
          'Failed to connect to the Gemini API. Please make sure your API key is configured.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPreset = (presetPrompt: string, presetLang: string) => {
    setPrompt(presetPrompt);
    if (presetLang.includes('Urdu') && presetLang.includes('English')) {
      setLanguage('bilingual');
    } else if (presetLang.includes('Urdu')) {
      setLanguage('urdu');
    } else if (presetLang.includes('Hindi')) {
      setLanguage('hindi_urdu');
    } else {
      setLanguage('english');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">1. Script Generator</h2>
            <p className="text-xs text-slate-400">
              Generate catchy, narration-ready scripts with Gemini AI
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleGenerate} className="space-y-4">
        {/* Prompt Input */}
        <div>
          <label htmlFor="prompt-input" className="block text-xs font-medium text-slate-300 mb-1.5">
            What kind of script would you like to create?
          </label>
          <div className="relative">
            <textarea
              id="prompt-input"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Write a company profile or promotional script with catchy hooks in Urdu/English..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/80 transition-all resize-none"
            />
          </div>
        </div>

        {/* Configuration Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Language Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" /> Language / Mix
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="bilingual">Urdu / English (Bilingual)</option>
              <option value="urdu">Urdu (اردو)</option>
              <option value="hindi_urdu">Hindi / Urdu (हिन्दी / اردو)</option>
              <option value="english">English (Global)</option>
            </select>
          </div>

          {/* Tone */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-slate-400" /> Tone & Style
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="catchy">Catchy & High Hook</option>
              <option value="corporate">Corporate & Professional</option>
              <option value="storytelling">Storytelling & Emotional</option>
              <option value="energetic">Energetic Commercial</option>
              <option value="educational">Educational & Explainer</option>
            </select>
          </div>

          {/* Target Duration */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" /> Target Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="15s">15 Seconds (Quick Hook)</option>
              <option value="30s">30 Seconds (Commercial)</option>
              <option value="45s">45 Seconds (Explainer)</option>
              <option value="60s">60 Seconds (Full Profile)</option>
            </select>
          </div>
        </div>

        {/* Presets Chips */}
        <div>
          <div className="text-[11px] font-medium text-slate-400 mb-1.5">
            Quick Prompt Templates:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROMPT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.prompt, preset.language)}
                className="px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-[11px] text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-left"
              >
                <span>{preset.title}</span>
                <span className="text-[10px] text-amber-400/80 font-mono">({preset.category})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-200">Generation Error</p>
              <p className="mt-0.5 text-red-300/90">{error}</p>
            </div>
          </div>
        )}

        {/* Generate Button */}
        <button
          id="btn-generate-script"
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:from-amber-600 active:to-amber-700 text-slate-950 font-semibold text-sm shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
              <span>Crafting Script with Gemini AI...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>Generate Script with Gemini</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
