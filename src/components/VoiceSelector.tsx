import React, { useState } from 'react';
import { User, Volume2, Sparkles, Filter, Check, ChevronDown } from 'lucide-react';
import { VOICES } from '../data/voices';
import { VoiceOption, Gender, Accent, Tone } from '../types';

interface VoiceSelectorProps {
  selectedVoice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
  selectedTone: Tone;
  onSelectTone: (tone: Tone) => void;
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  selectedVoice,
  onSelectVoice,
  selectedTone,
  onSelectTone,
}) => {
  const [genderFilter, setGenderFilter] = useState<'all' | Gender>('all');
  const [accentFilter, setAccentFilter] = useState<'all' | Accent>('all');
  const [isOpenDropdown, setIsOpenDropdown] = useState(false);

  const filteredVoices = VOICES.filter((v) => {
    if (genderFilter !== 'all' && v.gender !== genderFilter) return false;
    if (accentFilter !== 'all' && v.accent !== accentFilter) return false;
    return true;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Volume2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">3. Voice & Accent Options</h2>
            <p className="text-xs text-slate-400">
              Select AI voice persona, gender, and regional accent
            </p>
          </div>
        </div>
      </div>

      {/* Main Voice Dropdown Menu */}
      <div className="space-y-4">
        <div>
          <label htmlFor="voice-select-dropdown" className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
            <span>Choose Voice Actor:</span>
            <span className="text-[11px] text-amber-400 font-mono">
              Selected: {selectedVoice.name} ({selectedVoice.accentLabel})
            </span>
          </label>

          {/* Standard HTML Dropdown for quick access and full accessibility */}
          <div className="relative">
            <select
              id="voice-select-dropdown"
              value={selectedVoice.id}
              onChange={(e) => {
                const found = VOICES.find((v) => v.id === e.target.value);
                if (found) onSelectVoice(found);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-10 cursor-pointer"
            >
              <optgroup label="🇵🇰 Pakistani Urdu Voices">
                {VOICES.filter((v) => v.accent === 'pakistani_urdu').map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender === 'male' ? 'Male' : 'Female'}) — {v.accentLabel}
                  </option>
                ))}
              </optgroup>
              <optgroup label="🇮🇳 Indian Hindi / Urdu Voices">
                {VOICES.filter((v) => v.accent === 'indian_hindi_urdu').map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender === 'male' ? 'Male' : 'Female'}) — {v.accentLabel}
                  </option>
                ))}
              </optgroup>
              <optgroup label="🌐 English Voices (South Asian & Global)">
                {VOICES.filter(
                  (v) =>
                    v.accent === 'english_south_asian' ||
                    v.accent === 'english_us' ||
                    v.accent === 'english_uk'
                ).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender === 'male' ? 'Male' : 'Female'}) — {v.accentLabel}
                  </option>
                ))}
              </optgroup>
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Filters for Interactive Voice Cards */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-800/80">
          {/* Gender Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setGenderFilter('all')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                genderFilter === 'all'
                  ? 'bg-slate-800 text-white font-medium shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Genders
            </button>
            <button
              type="button"
              onClick={() => setGenderFilter('male')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                genderFilter === 'male'
                  ? 'bg-indigo-600 text-white font-medium shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Male
            </button>
            <button
              type="button"
              onClick={() => setGenderFilter('female')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                genderFilter === 'female'
                  ? 'bg-indigo-600 text-white font-medium shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Female
            </button>
          </div>

          {/* Accent Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 flex-wrap">
            <button
              type="button"
              onClick={() => setAccentFilter('all')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                accentFilter === 'all'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Accents
            </button>
            <button
              type="button"
              onClick={() => setAccentFilter('pakistani_urdu')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                accentFilter === 'pakistani_urdu'
                  ? 'bg-amber-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pakistani Urdu
            </button>
            <button
              type="button"
              onClick={() => setAccentFilter('indian_hindi_urdu')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                accentFilter === 'indian_hindi_urdu'
                  ? 'bg-amber-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hindi/Urdu
            </button>
            <button
              type="button"
              onClick={() => setAccentFilter('english_south_asian')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                accentFilter === 'english_south_asian'
                  ? 'bg-amber-600 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              English (South Asian)
            </button>
          </div>
        </div>

        {/* Voice Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
          {filteredVoices.map((voice) => {
            const isSelected = selectedVoice.id === voice.id;
            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => onSelectVoice(voice)}
                className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-950/50 border-indigo-500 shadow-md shadow-indigo-500/10'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                        voice.gender === 'female'
                          ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}
                    >
                      {voice.name[0]}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        {voice.name}
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded ${
                            voice.gender === 'female'
                              ? 'bg-pink-950/70 text-pink-400'
                              : 'bg-blue-950/70 text-blue-400'
                          }`}
                        >
                          {voice.gender === 'female' ? 'Female' : 'Male'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </div>

                <div className="text-[11px] font-medium text-amber-400/90 mb-1">
                  {voice.accentLabel}
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                  {voice.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Delivery Tone Selector */}
        <div className="pt-2 border-t border-slate-800">
          <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Voice Delivery Tone:</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {[
              { id: 'natural', label: 'Natural & Warm' },
              { id: 'energetic', label: 'Lively & Promo' },
              { id: 'calm', label: 'Calm & Soothing' },
              { id: 'authoritative', label: 'Confident & News' },
              { id: 'storyteller', label: 'Storyteller' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTone(t.id as Tone)}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all ${
                  selectedTone === t.id
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
