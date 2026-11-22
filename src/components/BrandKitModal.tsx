import React, { useState } from 'react';
import { BrandKit, MarketingTone } from '../types';
import { VOICE_OPTIONS } from '../data/voices';
import { Sparkles, Palette, ShieldCheck, X } from 'lucide-react';

interface BrandKitModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandKit: BrandKit;
  onSave: (kit: BrandKit) => void;
}

export const BrandKitModal: React.FC<BrandKitModalProps> = ({
  isOpen,
  onClose,
  brandKit,
  onSave,
}) => {
  const [form, setForm] = useState<BrandKit>({ ...brandKit });

  if (!isOpen) return null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setForm((prev) => ({ ...prev, logoUrl: event.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">برانڈ کٹ سیٹ اپ (Brand Kit)</h3>
              <p className="text-[11px] text-slate-400">
                برانڈ کا نام، رنگ، لہجہ اور لوگو سیٹ کریں جو تمام مناظر پر لاگو ہوں گے
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
          {/* Brand Name */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              برانڈ یا کمپنی کا نام (Brand Name)
            </label>
            <input
              type="text"
              value={form.brandName}
              onChange={(e) => setForm({ ...form, brandName: e.target.value })}
              placeholder="e.g. Al-Madina Luxury, TechNova, وغیرہ"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Logo upload */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              برانڈ لوگو واٹر مارک (Logo / Watermark)
            </label>
            <div className="flex items-center gap-3">
              {form.logoUrl && (
                <div className="w-12 h-12 rounded-lg border border-slate-700 bg-slate-950 p-1 flex items-center justify-center shrink-0">
                  <img src={form.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
              />
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                بنیادی رنگ (Primary Color)
              </label>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="text-xs font-mono text-slate-300">{form.primaryColor}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                ثانوی رنگ (Secondary Color)
              </label>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                <input
                  type="color"
                  value={form.secondaryColor}
                  onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="text-xs font-mono text-slate-300">{form.secondaryColor}</span>
              </div>
            </div>
          </div>

          {/* Tone */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              مارکیٹنگ لہجہ (Tone of Voice)
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['Formal', 'Friendly', 'Energetic', 'Emotional'] as MarketingTone[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, toneOfVoice: t })}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                    form.toneOfVoice === t
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-semibold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t === 'Formal' && 'سنجیدہ (Formal)'}
                  {t === 'Friendly' && 'دوستانہ (Friendly)'}
                  {t === 'Energetic' && 'پرجوش (Energetic)'}
                  {t === 'Emotional' && 'جذباتی (Emotional)'}
                </button>
              ))}
            </div>
          </div>

          {/* Default Voice */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              پہلے سے طے شدہ آواز (Default AI Voice)
            </label>
            <select
              value={form.defaultVoiceId}
              onChange={(e) => setForm({ ...form, defaultVoiceId: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.accentLabel} - {v.gender})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
          >
            منسوخ کریں (Cancel)
          </button>
          <button
            onClick={() => {
              onSave(form);
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>برانڈ محفوظ کریں (Save Brand Kit)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
