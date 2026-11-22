import React, { useState, useEffect } from 'react';
import {
  Mic2,
  Film,
  Sparkles,
  RotateCcw,
  Save,
  ChevronDown,
  ChevronUp,
  Trash2,
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  Image as ImageIcon,
  Rocket,
  Settings,
  Clock,
  LayoutDashboard,
} from 'lucide-react';
import { VOICES } from '../data/voices';
import { VoiceStudioTab } from './VoiceStudioTab';
import { VideoStudioTab } from './VideoStudioTab';
import { ImageStudioTab } from './ImageStudioTab';
import { SocialAutomationHub } from './SocialAutomationHub';

export type MainStudioMode = 'voice' | 'image' | 'video' | 'social';

export interface SavedProjectItem {
  id: string;
  title: string;
  createdAt: string;
  promptText: string;
  mode: MainStudioMode;
  details?: string;
}

// Helper to categorize errors cleanly in Urdu + English
export function categorizeError(err: any): {
  category: 'quota' | 'network' | 'prompt' | 'server';
  labelUrdu: string;
  labelEn: string;
  descUrdu: string;
  descEn: string;
  raw: string;
} {
  const raw = String(err?.message || err?.error || err || '');
  const lower = raw.toLowerCase();

  if (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('limit: 0') ||
    lower.includes('rate limit')
  ) {
    return {
      category: 'quota',
      labelUrdu: 'کوٹہ ختم',
      labelEn: 'Quota exceeded',
      descUrdu: 'Gemini ماڈل کی درخواستوں کی حد مکمل ہو گئی ہے۔ تھوڑی دیر بعد کوشش کریں۔',
      descEn: 'API quota or rate limit exceeded. Please wait a short while and retry.',
      raw,
    };
  }

  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('failed to fetch') ||
    lower.includes('timeout') ||
    lower.includes('connection')
  ) {
    return {
      category: 'network',
      labelUrdu: 'نیٹ ورک کی خرابی',
      labelEn: 'Network error',
      descUrdu: 'انٹرنیٹ یا سرور کنکشن میں تعطل پیش آیا ہے۔',
      descEn: 'Network request timed out or connection dropped.',
      raw,
    };
  }

  if (
    lower.includes('safety') ||
    lower.includes('blocked') ||
    lower.includes('prohibited') ||
    lower.includes('invalid prompt') ||
    lower.includes('candidate')
  ) {
    return {
      category: 'prompt',
      labelUrdu: 'ناقص پرامپٹ',
      labelEn: 'Invalid prompt',
      descUrdu: 'پرامپٹ کے الفاظ کی تبدیلی کے بعد دوبارہ کوشش کریں۔',
      descEn: 'Prompt was flagged or not accepted by the visual model.',
      raw,
    };
  }

  return {
    category: 'server',
    labelUrdu: 'سرور کی خرابی',
    labelEn: 'Server error',
    descUrdu: 'سرور ماڈل سے جواب موصول نہیں ہو سکا۔',
    descEn: 'Internal server or model processing error.',
    raw,
  };
}

export const CleanVideoStudio: React.FC = () => {
  // TWO PRIMARY TOP-LEVEL FOLDERS: 'social' (سوشل میڈیا اٹومیشن) and 'tools' (اسٹوڈیو ٹولز و جنریشن)
  const [mainFolder, setMainFolder] = useState<'social' | 'tools'>('social');
  const [toolsSubMode, setToolsSubMode] = useState<'image' | 'video' | 'voice'>('image');

  // Shared single prompt box
  const [promptText, setPromptText] = useState<string>('');

  // Test mode toggle (Test with 1 scene / clip)
  const [isTestMode, setIsTestMode] = useState<boolean>(false);

  // Voice tab settings
  const [language, setLanguage] = useState<'urdu' | 'hindi' | 'english'>('urdu');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(VOICES[0].id);

  // Saved projects collapsed at bottom
  const [savedProjects, setSavedProjects] = useState<SavedProjectItem[]>(() => {
    try {
      const saved = localStorage.getItem('tts_video_saved_projects');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isSavedProjectsOpen, setIsSavedProjectsOpen] = useState<boolean>(false);

  // Save current state as project
  const handleSaveProject = () => {
    if (!promptText.trim()) return;
    const newProj: SavedProjectItem = {
      id: `project-${Date.now()}`,
      title: promptText.trim().slice(0, 45) + (promptText.length > 45 ? '...' : ''),
      createdAt: new Date().toLocaleDateString('ur-PK', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      promptText,
      mode: toolsSubMode,
      details: `${toolsSubMode === 'voice' ? 'Voice Studio' : toolsSubMode === 'video' ? 'Video Studio' : 'Image Studio'} &bull; ${language}`,
    };

    const updated = [newProj, ...savedProjects.slice(0, 19)];
    setSavedProjects(updated);
    localStorage.setItem('tts_video_saved_projects', JSON.stringify(updated));
  };

  const handleLoadProject = (proj: SavedProjectItem) => {
    setPromptText(proj.promptText);
    setMainFolder('tools');
    if (proj.mode === 'voice' || proj.mode === 'video' || proj.mode === 'image') {
      setToolsSubMode(proj.mode);
    }
  };

  const handleDeleteSavedProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedProjects.filter((p) => p.id !== id);
    setSavedProjects(updated);
    localStorage.setItem('tts_video_saved_projects', JSON.stringify(updated));
  };

  // New Project Button
  const handleNewProject = () => {
    if (promptText.trim()) {
      const confirmReset = window.confirm(
        'نیا پروجیکٹ شروع کریں؟ موجودہ پرامپٹ صاف ہو جائے گا۔ (Start new project and clear current prompt?)'
      );
      if (!confirmReset) return;
    }
    setPromptText('');
  };

  const wordsCount = promptText.trim() ? promptText.trim().split(/\s+/).filter(Boolean).length : 0;
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [isPastedSuccess, setIsPastedSuccess] = useState<boolean>(false);

  // 1-Click Paste handler
  const handlePasteScript = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setPromptText(text.trim());
          setIsPastedSuccess(true);
          setPasteNotice('اسکرپٹ کامیابی سے پیسٹ ہو گیا! (Script pasted)');
          setTimeout(() => {
            setIsPastedSuccess(false);
            setPasteNotice(null);
          }, 3000);
          return;
        }
      }
    } catch (err) {
      console.warn('Clipboard read failed or permission required:', err);
    }

    // Fallback: focus textarea for mobile native paste
    const textarea = document.getElementById('shared-studio-prompt') as HTMLTextAreaElement | null;
    if (textarea) {
      textarea.focus();
      setPasteNotice('موبائل پر باکس میں تھوڑی دیر دبا کر رکھیں اور Paste منتخب کریں۔ (Long press & tap Paste)');
      setTimeout(() => setPasteNotice(null), 4500);
    }
  };

  // Settings modal trigger for child SocialAutomationHub
  const [openSettingsCount, setOpenSettingsCount] = useState<number>(0);

  // Compute activeMode for child tabs
  const activeMode: MainStudioMode = mainFolder === 'social' ? 'social' : toolsSubMode;

  const navigateToSection = (section: 'dashboard' | 'image' | 'voice' | 'video' | 'social' | 'history' | 'settings') => {
    if (section === 'dashboard' || section === 'social') {
      setMainFolder('social');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (section === 'image') {
      setMainFolder('tools');
      setToolsSubMode('image');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (section === 'voice') {
      setMainFolder('tools');
      setToolsSubMode('voice');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (section === 'video') {
      setMainFolder('tools');
      setToolsSubMode('video');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (section === 'history') {
      setMainFolder('social');
      setTimeout(() => {
        const el = document.getElementById('posting-history-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (section === 'settings') {
      setMainFolder('social');
      setOpenSettingsCount((c) => c + 1);
    }
  };

  return (
    <div className="space-y-5 pb-16">
      {/* 1. SEVEN-SECTION GNZEE MARKET MAIN NAVIGATION (Mobile-friendly Android responsive bar) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xl">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
          <button
            type="button"
            onClick={() => navigateToSection('dashboard')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
              mainFolder === 'social'
                ? 'bg-sky-500 text-slate-950 shadow-md ring-1 ring-sky-300'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToSection('image')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
              mainFolder === 'tools' && toolsSubMode === 'image'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-300'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Image Studio</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToSection('voice')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
              mainFolder === 'tools' && toolsSubMode === 'voice'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-300'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Mic2 className="w-3.5 h-3.5" />
            <span>Voice Studio</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToSection('video')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
              mainFolder === 'tools' && toolsSubMode === 'video'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-300'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Video Studio</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToSection('social')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
              mainFolder === 'social'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Rocket className="w-3.5 h-3.5" />
            <span>Social Automation</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToSection('history')}
            className="px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all bg-slate-950 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700"
          >
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Posting History</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToSection('settings')}
            className="px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all bg-slate-950 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700"
          >
            <Settings className="w-3.5 h-3.5 text-amber-400" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* 2. SHARED PROMPT BOX (Shown for Voice and Video modes; Image Studio & Social Hub have their own dedicated panels) */}
      {activeMode !== 'image' && activeMode !== 'social' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <label htmlFor="shared-studio-prompt" className="text-xs font-bold text-white">
                {activeMode === 'voice'
                  ? 'Voiceover Script or Topic:'
                  : 'Video Scene Prompts:'}
              </label>
            </div>

            {/* Action buttons: 1-Click Paste & Clear */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* 1-Click Paste Button */}
              <button
                type="button"
                onClick={handlePasteScript}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all border shadow-sm ${
                  isPastedSuccess
                    ? 'bg-emerald-600 text-white border-emerald-400'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 active:scale-95'
                }`}
                title="Paste text from clipboard"
              >
                {isPastedSuccess ? (
                  <ClipboardCheck className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Clipboard className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>{isPastedSuccess ? 'Pasted!' : 'Paste Script'}</span>
              </button>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                <span>{wordsCount} w</span>
                <span>&bull;</span>
                <span>{promptText.length} ch</span>
                {promptText && (
                  <>
                    <span>&bull;</span>
                    <button
                      type="button"
                      onClick={() => setPromptText('')}
                      className="text-amber-400 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Friendly Paste Notice / Instruction banner */}
          {pasteNotice && (
            <div className="p-2.5 rounded-xl bg-slate-950 border border-amber-500/40 text-xs text-amber-300 font-urdu flex items-center gap-2 animate-in fade-in duration-150">
              <ClipboardCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{pasteNotice}</span>
            </div>
          )}

          <textarea
            id="shared-studio-prompt"
            rows={5}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            dir={language === 'urdu' ? 'rtl' : 'ltr'}
            placeholder={
              activeMode === 'voice'
                ? language === 'urdu'
                  ? 'یہاں اپنا وائس اوور اسکرپٹ، تقریر یا مضمون چسپاں کریں...\nاوپر "اسکرپٹ پیسٹ کریں" کا بٹن دبا کر بھی فوراً پیسٹ کر سکتے ہیں۔'
                  : language === 'hindi'
                  ? 'यहाँ अपना वॉइसओवर स्क्रिप्ट या विचार लिखें या ऊपर दिए गए बटन से पेस्ट करें...'
                  : 'Paste or write your voiceover script or promotional copy here (or tap Paste above)...'
                : 'یہاں ویڈیو مناظر کا پرامپٹ یا ایک سے زائد پرامپٹس درج کریں...'
            }
            className={`w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 leading-relaxed resize-y ${
              language === 'urdu' ? 'font-urdu' : 'font-sans'
            }`}
          />
        </div>
      )}

      {/* 3. ACTIVE FOLDER CONTENT */}
      {mainFolder === 'social' ? (
        <SocialAutomationHub openSettingsTrigger={openSettingsCount} />
      ) : toolsSubMode === 'voice' ? (
        <VoiceStudioTab
          promptText={promptText}
          setPromptText={setPromptText}
          language={language}
          setLanguage={setLanguage}
          selectedVoiceId={selectedVoiceId}
          setSelectedVoiceId={setSelectedVoiceId}
          isTestMode={isTestMode}
        />
      ) : toolsSubMode === 'image' ? (
        <ImageStudioTab onNavigateToSocial={() => setMainFolder('social')} />
      ) : (
        <VideoStudioTab
          promptText={promptText}
          setPromptText={setPromptText}
          isTestMode={isTestMode}
        />
      )}

      {/* 4. SAVED PROJECTS ACCORDION (Only shown in Tools folder) */}
      {mainFolder === 'tools' && (
        <div className="pt-6 border-t border-slate-800/80">
        <button
          type="button"
          onClick={() => setIsSavedProjectsOpen(!isSavedProjectsOpen)}
          className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 text-xs text-slate-400 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 text-amber-400" />
            <span className="font-urdu font-medium text-slate-300">
              محفوظ شدہ پراجیکٹس / Saved Projects ({savedProjects.length})
            </span>
          </div>
          {isSavedProjectsOpen ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {isSavedProjectsOpen && (
          <div className="mt-2.5 p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            {savedProjects.length === 0 ? (
              <p className="text-xs text-slate-500 font-urdu py-3 text-center">
                ابھی تک کوئی محفوظ شدہ پراجیکٹ موجود نہیں ہے۔ / No saved projects yet.
              </p>
            ) : (
              savedProjects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleLoadProject(p)}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 cursor-pointer transition-colors"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-200 truncate max-w-md font-urdu">
                      {p.title}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {p.createdAt} &bull; Mode: {p.mode === 'voice' ? 'Voice (آواز)' : 'Video (ویڈیو)'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSavedProject(p.id, e)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
                    title="Delete Saved Project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
};
