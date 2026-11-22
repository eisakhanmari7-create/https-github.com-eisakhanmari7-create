import React from 'react';
import { History, Play, Download, Trash2, Clock, Volume2 } from 'lucide-react';
import { GeneratedVoiceover } from '../types';

interface AudioHistoryProps {
  history: GeneratedVoiceover[];
  onSelect: (item: GeneratedVoiceover) => void;
  onRestoreScript: (text: string) => void;
  onClearHistory: () => void;
}

export const AudioHistory: React.FC<AudioHistoryProps> = ({
  history,
  onSelect,
  onRestoreScript,
  onClearHistory,
}) => {
  if (history.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <History className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Voiceover Session History</h3>
            <p className="text-xs text-slate-400">
              {history.length} generated track{history.length > 1 ? 's' : ''} in this session
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClearHistory}
          className="text-xs text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1 p-1"
          title="Clear session tracks"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
        {history.map((item) => (
          <div
            key={item.id}
            className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between gap-3 transition-colors text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="w-8 h-8 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                title="Play track"
              >
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-white truncate">
                    {item.voice.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-900">
                    {item.voice.accentLabel}
                  </span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {item.createdAt}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {item.text}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onRestoreScript(item.text)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-medium transition-colors"
                title="Restore this script to editor"
              >
                Use Script
              </button>

              <button
                type="button"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = item.audioUrl;
                  link.download = `voiceover_${item.voice.name}_${Date.now()}.mp3`;
                  link.click();
                }}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors"
                title="Download MP3"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
