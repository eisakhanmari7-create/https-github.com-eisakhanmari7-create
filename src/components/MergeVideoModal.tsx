import React, { useState } from 'react';
import { Film, Sliders, Volume2, Sparkles, Check, RefreshCw, X, Download } from 'lucide-react';
import { AspectRatio, VideoScene, BrandKit } from '../types';
import { mergeFullVideo } from '../utils/videoRenderer';

interface MergeVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: VideoScene[];
  aspectRatio: AspectRatio;
  brandKit?: BrandKit;
}

export const MergeVideoModal: React.FC<MergeVideoModalProps> = ({
  isOpen,
  onClose,
  scenes,
  aspectRatio,
  brandKit,
}) => {
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [bgMusicVolume, setBgMusicVolume] = useState<number>(0.2); // 20%
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalDuration = scenes.reduce((sum, s) => sum + (s.durationSeconds || 8), 0);

  const handleStartMerge = async () => {
    setIsRendering(true);
    setProgress(5);
    setStatusMessage('تمام مناظر تیار کیے جا رہے ہیں...');
    setMergedVideoUrl(null);

    try {
      const mergedBlob = await mergeFullVideo(
        scenes.map((s) => ({
          visualUrl: s.visualUrl,
          captionText: s.captionText,
          durationSeconds: s.durationSeconds || 8,
          audioBase64: s.audioBase64,
        })),
        {
          aspectRatio,
          brandName: brandKit?.brandName,
          primaryColor: brandKit?.primaryColor,
          burnSubtitles,
          bgMusicVolume,
          onProgress: (p, msg) => {
            setProgress(p);
            setStatusMessage(msg);
          },
        }
      );

      const url = URL.createObjectURL(mergedBlob);
      setMergedVideoUrl(url);
      setStatusMessage('مکمل ویڈیو کامیابی سے تیار ہو گئی ہے!');
    } catch (err) {
      console.error('Failed to merge full video:', err);
      setStatusMessage('ویڈیو جوڑنے میں خرابی پیش آگئی، براہ کرم دوبارہ کوشش کریں۔');
    } finally {
      setIsRendering(false);
    }
  };

  const handleDownload = () => {
    if (!mergedVideoUrl) return;
    const a = document.createElement('a');
    a.href = mergedVideoUrl;
    a.download = `Final_Complete_Marketing_Video_${aspectRatio.replace(':', '_')}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">مکمل ویڈیو جوڑیں (Merge Full Video)</h3>
              <p className="text-[11px] text-slate-400">
                تمام {scenes.length} مناظر اور وائس اوورز کو ایک مکمل فائنل ویڈیو میں یکجا کریں
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

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
            <div>
              <span className="text-[10px] text-slate-400 block">مناظر (Scenes)</span>
              <span className="text-xs font-bold text-white">{scenes.length} کلپس</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">کل دورانیہ (Total Time)</span>
              <span className="text-xs font-bold text-amber-400">{totalDuration} سیکنڈز</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">اسپیکٹ ریشو (Ratio)</span>
              <span className="text-xs font-bold text-indigo-400">{aspectRatio}</span>
            </div>
          </div>

          {/* Workflow Clarification Banner */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>مرج (Merge) اور زپ (ZIP) میں کیا فرق ہے؟</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              &bull; <strong>زپ (ZIP):</strong> اگر آپ کو الگ الگ ۸ سیکنڈ کے کلپس چاہیے ہوں تاکہ آپ خود ایڈیٹنگ سافٹ ویئر میں لگائیں، تو پچھلی اسکرین سے زپ فائل ڈاؤن لوڈ کریں۔<br />
              &bull; <strong>مرج (Merge):</strong> یہ تمام مناظر، اردو وائس اوورز، سب ٹائٹلز اور بیک گراؤنڈ میوزک کو ملا کر <strong>ایک ہی مکمل MP4 ویڈیو</strong> بنا دیتا ہے۔
            </p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            {/* Burn Subtitles Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-slate-200 block">
                  اردو سب ٹائٹلز شامل کریں (Burn-in Urdu Subtitles)
                </span>
                <span className="text-[10px] text-slate-400 block">
                  ویڈیو کے نیچے واضح پیلے رنگ کے کیپشنز دکھائے جائیں گے
                </span>
              </div>
              <input
                type="checkbox"
                checked={burnSubtitles}
                onChange={(e) => setBurnSubtitles(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Background Music Volume */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>پس منظر کی موسیقی (Background Music):</span>
                </span>
                <span className="text-xs font-mono text-amber-400">
                  {bgMusicVolume === 0 ? 'بند (Off)' : `${Math.round(bgMusicVolume * 100)}%`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.05"
                value={bgMusicVolume}
                onChange={(e) => setBgMusicVolume(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0% (خاموش)</span>
                <span>25% (تجویز کردہ)</span>
                <span>50% (بلند)</span>
              </div>
            </div>

            {/* Brand watermark indicator */}
            {brandKit?.brandName && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center justify-between">
                <span>برانڈ واٹر مارک: <strong>{brandKit.brandName}</strong></span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brandKit.primaryColor }} />
              </div>
            )}
          </div>

          {/* Render Progress or Preview Player */}
          {isRendering && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-center">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>{statusMessage}</span>
                <span className="font-mono text-amber-400 font-bold">{progress}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-amber-400 h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {mergedVideoUrl && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-emerald-400 block">
                ✓ مکمل ویڈیو تیار ہے (Final Merged Video):
              </span>
              <div className="rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video max-h-56">
                <video src={mergedVideoUrl} controls className="w-full h-full object-contain" />
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
          >
            بند کریں (Close)
          </button>

          <div className="flex items-center gap-2">
            {mergedVideoUrl ? (
              <button
                onClick={handleDownload}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4" />
                <span>فائنل ویڈیو ڈاؤن لوڈ کریں (Download MP4)</span>
              </button>
            ) : (
              <button
                onClick={handleStartMerge}
                disabled={isRendering || scenes.length === 0}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {isRendering ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>ویڈیو جڑ رہی ہے...</span>
                  </>
                ) : (
                  <>
                    <Film className="w-4 h-4" />
                    <span>ابھی ویڈیو جوڑیں (Start Merge)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
