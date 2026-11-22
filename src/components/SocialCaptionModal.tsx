import React, { useState } from 'react';
import { Sparkles, Copy, Check, MessageSquareShare, Hash, X } from 'lucide-react';

interface SocialCaptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  caption: string;
  hashtags: string[];
  isLoading: boolean;
  onRegenerate: () => void;
}

export const SocialCaptionModal: React.FC<SocialCaptionModalProps> = ({
  isOpen,
  onClose,
  caption,
  hashtags,
  isLoading,
  onRegenerate,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const fullShareText = `${caption}\n\n${hashtags.join(' ')}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullShareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400">
              <MessageSquareShare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">سوشل میڈیا کیپشن اور ہیش ٹیگز</h3>
              <p className="text-[11px] text-slate-400">
                TikTok, Reels, Shorts اور Facebook کے لیے فوری وائرل کیپشن
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              <span className="text-xs">وائرل کیپشن اور ٹرینڈنگ ہیش ٹیگز بن رہے ہیں...</span>
            </div>
          ) : (
            <>
              {/* Caption Box */}
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>کیپشن (Caption):</span>
                </label>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-line select-all">
                  {caption || 'کوئی کیپشن دستیاب نہیں ہے، براہ کرم ری جنریٹ کریں۔'}
                </div>
              </div>

              {/* Hashtags */}
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-pink-400" />
                  <span>۱۰ وائرل ہیش ٹیگز (10 Trending Hashtags):</span>
                </label>
                <div className="flex flex-wrap gap-1.5 p-3 bg-slate-950 border border-slate-800 rounded-xl max-h-36 overflow-y-auto">
                  {hashtags && hashtags.length > 0 ? (
                    hashtags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-pink-500/10 border border-pink-500/20 text-pink-300"
                      >
                        {tag.startsWith('#') ? tag : `#${tag}`}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">کوئی ہیش ٹیگز نہیں</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={onRegenerate}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            دوبارہ بنائیں (Regenerate)
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
            >
              بند کریں (Close)
            </button>
            <button
              onClick={handleCopy}
              disabled={isLoading || !caption}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-950" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'کاپی ہو گیا!' : 'سب کاپی کریں (Copy All)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
