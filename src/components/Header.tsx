import React from 'react';
import { Mic2, Sparkles, Volume2, Globe } from 'lucide-react';

interface HeaderProps {
  hasApiKey?: boolean;
}

export const Header: React.FC<HeaderProps> = () => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-amber-500 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                Social Media <span className="text-amber-400">&amp;</span> Studio Hub
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                <Sparkles className="w-3 h-3 text-amber-400" /> Automation v3.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Google Drive Multi-Platform Publishing &bull; Facebook &bull; TikTok &bull; Instagram &bull; YouTube
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Hub Online &bull; Ready</span>
          </div>
        </div>
      </div>
    </header>
  );
};
