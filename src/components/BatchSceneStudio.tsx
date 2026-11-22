import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import {
  Film,
  Layers,
  Sparkles,
  Volume2,
  Copy,
  Check,
  Download,
  Play,
  Pause,
  RefreshCw,
  FolderDown,
  Clock,
  Video,
  Eye,
  Plus,
  Trash2,
  FileCode,
  AlertCircle,
  Clapperboard,
  SlidersHorizontal,
  Sliders,
  Mic,
  Info,
  HelpCircle,
  FileAudio,
  Radio,
  Palette,
  LayoutTemplate,
  MessageSquareShare,
  Image as ImageIcon,
  CheckCircle2,
  Upload,
  ArrowRight,
  ShieldAlert,
  Smartphone,
  Tv,
  Square,
  FileArchive,
} from 'lucide-react';
import {
  VideoScene,
  BatchSceneProject,
  VoiceOption,
  AspectRatio,
  StylePreset,
  MarketingTone,
  BrandKit,
} from '../types';
import { VOICE_OPTIONS } from '../data/voices';
import { VIDEO_TEMPLATES } from '../data/templates';
import { wavBase64ToMp3Blob } from '../utils/audioEncoder';
import { renderSceneToVideoBlob, mergeWavAudiosToMp3 } from '../utils/videoRenderer';
import { SceneCard } from './SceneCard';
import { BrandKitModal } from './BrandKitModal';
import { SocialCaptionModal } from './SocialCaptionModal';
import { MergeVideoModal } from './MergeVideoModal';

const DEFAULT_BRAND_KIT: BrandKit = {
  brandName: 'میری دکان (My Brand)',
  primaryColor: '#f59e0b',
  secondaryColor: '#6366f1',
  toneOfVoice: 'Energetic',
  defaultLanguage: 'urdu',
  defaultVoiceId: VOICE_OPTIONS[0].id,
};

export const BatchSceneStudio: React.FC = () => {
  // Mode: 'custom_prompts' (Prompt 1, 2, 3...) or 'ai_topic' (Idea-to-scenes auto story)
  const [inputMode, setInputMode] = useState<'ai_topic' | 'custom_prompts'>('custom_prompts');

  // Idea-to-Scenes Parameters
  const [topicPrompt, setTopicPrompt] = useState(
    'ایک انقلابی سمارٹ واچ جو فٹنس، کالز اور ہیلتھ مانیٹرنگ کی شاندار سہولیات دیتی ہے'
  );
  const [sceneCount, setSceneCount] = useState<number>(4);
  const [marketingTone, setMarketingTone] = useState<MarketingTone>('Energetic');
  const [language, setLanguage] = useState<string>('urdu');
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICE_OPTIONS[0]);

  // Platform Preset Aspect Ratio & Style
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [stylePreset, setStylePreset] = useState<StylePreset>('Cinematic');
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);

  // Brand Kit
  const [brandKit, setBrandKit] = useState<BrandKit>(() => {
    try {
      const saved = localStorage.getItem('tts_brand_kit');
      return saved ? JSON.parse(saved) : DEFAULT_BRAND_KIT;
    } catch {
      return DEFAULT_BRAND_KIT;
    }
  });
  const [isBrandKitModalOpen, setIsBrandKitModalOpen] = useState(false);

  // Social Captions & Hashtags
  const [socialCaption, setSocialCaption] = useState<string>('');
  const [socialHashtags, setSocialHashtags] = useState<string[]>([]);
  const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
  const [isLoadingSocial, setIsLoadingSocial] = useState(false);

  // Merge Video Modal
  const [isMergeVideoModalOpen, setIsMergeVideoModalOpen] = useState(false);

  // Custom multi-prompts box
  const [customPromptsText, setCustomPromptsText] = useState<string>(
    `Prompt 1: ایک کالی لگژری گاڑی تیز رفتاری سے ہائی وے پر چل رہی ہے، شام کا خوبصورت سن سیٹ کا وقت
Prompt 2: ڈرائیور مسکرا کر کیمرے کی طرف دیکھتا ہے اور اعتماد سے بولتا ہے
Prompt 3: گاڑی ایک شاندار ماڈرن ولا کے مین گیٹ پر آ کر رکتی ہے
Prompt 4: کیمرہ فضا سے پورا ولا دکھاتا ہے اور اسکرین پر خوش آمدید کا لوگو آتا ہے`
  );
  const [clipDuration, setClipDuration] = useState<number>(8);

  // Generation Target
  const [generationTarget, setGenerationTarget] = useState<'both' | 'audio_only' | 'video_only'>('both');

  // Pipeline States
  const [isGeneratingBreakdown, setIsGeneratingBreakdown] = useState<boolean>(false);
  const [isBatchGeneratingAudio, setIsBatchGeneratingAudio] = useState<boolean>(false);
  const [isBatchGeneratingVideos, setIsBatchGeneratingVideos] = useState<boolean>(false);
  const [isZippingAudio, setIsZippingAudio] = useState<boolean>(false);
  const [isZippingVideo, setIsZippingVideo] = useState<boolean>(false);
  const [isMergingAllAudios, setIsMergingAllAudios] = useState<boolean>(false);

  // Overall Progress
  const [overallProgress, setOverallProgress] = useState<{
    percent: number;
    currentStep: string;
    total: number;
    completed: number;
  } | null>(null);

  // Scenes state
  const [scenes, setScenes] = useState<VideoScene[]>([
    {
      id: 'scene-1',
      sceneNumber: 1,
      durationSeconds: 8,
      visualPrompt:
        'Cinematic close-up of a sleek futuristic smartwatch glowing with holographic neon notifications on a runner wrist, morning sun flare, photorealistic 8k.',
      cameraMovement: 'Smooth tracking push-in',
      captionText: 'جدید ترین انقلابی ٹیکنالوجی',
      voiceoverScript: 'کیا آپ بھی اپنی روزمرہ فٹنس اور مصروف زندگی کو مکمل تبدیل کرنا چاہتے ہیں؟',
      status: 'pending',
    },
    {
      id: 'scene-2',
      sceneNumber: 2,
      durationSeconds: 8,
      visualPrompt:
        'Dynamic studio unboxing showcase on a minimalist obsidian podium, floating metallic titanium casing, water splash effect, commercial product lighting.',
      cameraMovement: '360-degree rotation arc',
      captionText: 'پانی اور دھول سے 100% محفوظ',
      voiceoverScript: 'پیش ہے ہمارا جدید ترین واٹر پروف ڈیزائن، جو ہر سخت موسم کا مقابلہ کرے۔',
      status: 'pending',
    },
    {
      id: 'scene-3',
      sceneNumber: 3,
      durationSeconds: 8,
      visualPrompt:
        'Crisp AMOLED display displaying real-time heart rate and GPS navigation, bright vivid colors, premium luxury watch strap.',
      cameraMovement: 'Extreme macro zoom on watch screen',
      captionText: 'صحت کے درست ترین لائیو اعدادوشمار',
      voiceoverScript: 'صرف ایک کلک پر اپنی صحت کے تمام ریکارڈز اور دل کی دھڑکن مانیٹر کریں۔',
      status: 'pending',
    },
    {
      id: 'scene-4',
      sceneNumber: 4,
      durationSeconds: 8,
      visualPrompt:
        'Happy customer receiving elegant luxury packaging box with limited discount golden stamp, warm studio lighting.',
      cameraMovement: 'Centered cinematic pull-back',
      captionText: 'ابھی 40 فیصد خصوصی رعایت حاصل کریں',
      voiceoverScript: 'آج ہی آرڈر کریں اور پائیں 40 فیصد کی شاندار بچت، تیز ترین ہوم ڈیلیوری کے ساتھ!',
      status: 'pending',
    },
  ]);

  const [playingSceneId, setPlayingSceneId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [shorteningSceneId, setShorteningSceneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sequence Player State (Play all clips in order)
  const [isSequencePlayerOpen, setIsSequencePlayerOpen] = useState<boolean>(false);
  const [sequenceIndex, setSequenceIndex] = useState<number>(0);
  const [isPlayingSequence, setIsPlayingSequence] = useState<boolean>(false);
  const sequenceVideoRef = useRef<HTMLVideoElement | null>(null);

  // Smart prompt counter: detects "Prompt 1", "Scene 1", "1.", "[1]", etc.
  const detectPromptsCount = (text: string): number => {
    if (!text || !text.trim()) return 0;
    const matches = text.match(/(?:^|\n)(?:(?:Prompt|Scene|منظر|کلپ|ویڈیو|حصہ)\s*\d*\s*[:\-\.\)]|\[\d+\]|\d+[\.\-\)])/gi);
    if (matches && matches.length > 0) return matches.length;
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return lines.length > 0 ? lines.length : 1;
  };

  const detectedCount = detectPromptsCount(customPromptsText);

  // Handle custom prompt text edit with auto-scene-count sync
  const handleCustomPromptsChange = (newText: string) => {
    setCustomPromptsText(newText);
    const count = detectPromptsCount(newText);
    if (count > 0 && count <= 15) {
      setSceneCount(count);
    }
  };

  // Update scene count manually from box 2
  const handleUpdateSceneCount = (newCount: number) => {
    const safeCount = Math.max(1, Math.min(15, newCount));
    setSceneCount(safeCount);
  };

  // Quick preset loader for prompt box
  const loadSamplePrompts = (count: number) => {
    if (count === 1) {
      setCustomPromptsText(
        'Prompt 1: ایک پرتعیش سمارٹ واچ کا کلوز اپ شاٹ، اسکرین پر لائیو ہارٹ ریٹ اور نوٹیفکیشن چمک رہے ہیں'
      );
      setSceneCount(1);
    } else if (count === 3) {
      setCustomPromptsText(
        `Prompt 1: پہلی بار پاکستان میں پیش ہے جدید ترین انقلابی سمارٹ واچ ٹیکنالوجی
Prompt 2: واٹر پروف اور اسمارٹ فون کے ساتھ فوری وائرلیس کنکشن
Prompt 3: آج ہی خصوصی 40 فیصد رعایت پر آرڈر بک کروائیں اور شاندار تحفہ پائیں`
      );
      setSceneCount(3);
    } else if (count === 4) {
      setCustomPromptsText(
        `Prompt 1: ایک کالی لگژری گاڑی تیز رفتاری سے ہائی وے پر چل رہی ہے، شام کا خوبصورت سن سیٹ کا وقت
Prompt 2: ڈرائیور مسکرا کر کیمرے کی طرف دیکھتا ہے اور اعتماد سے بولتا ہے
Prompt 3: گاڑی ایک شاندار ماڈرن ولا کے مین گیٹ پر آ کر رکتی ہے
Prompt 4: کیمرہ فضا سے پورا ولا دکھاتا ہے اور اسکرین پر خوش آمدید کا لوگو آتا ہے`
      );
      setSceneCount(4);
    } else if (count === 8) {
      setCustomPromptsText(
        `Prompt 1: صبح کی پہلی سنہری کرنیں اور مصروف شہر کی سڑک
Prompt 2: نوجوان اسمارٹ واچ باندھ کر دوڑنا شروع کرتا ہے
Prompt 3: واچ کی اسکرین پر دل کی دھڑکن اور قدموں کا لائیو کاؤنٹر
Prompt 4: بارش شروع ہوتی ہے اور واٹر پروف ڈیزائن کی آزمائش
Prompt 5: واچ بغیر کسی خرابی کے پانی میں بھی بہترین کام کرتی ہے
Prompt 6: شام کی تقریب میں واچ کا لگژری میٹالک لک
Prompt 7: موبائل پر فوری کال اور میسج کا نوٹیفکیشن
Prompt 8: آج ہی آرڈر کریں اور پائیں 40 فیصد خصوصی بچت`
      );
      setSceneCount(8);
    }
  };

  // Saved Projects Gallery
  const [projectsGallery, setProjectsGallery] = useState<BatchSceneProject[]>(() => {
    try {
      const saved = localStorage.getItem('tts_batch_projects');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [editingProjectTitleId, setEditingProjectTitleId] = useState<string | null>(null);
  const [newProjectTitle, setNewProjectTitle] = useState<string>('');

  // Save BrandKit to localStorage
  const handleSaveBrandKit = (newKit: BrandKit) => {
    setBrandKit(newKit);
    try {
      localStorage.setItem('tts_brand_kit', JSON.stringify(newKit));
    } catch {}
  };

  // Save project to Gallery
  const saveProjectToGallery = (updatedScenes = scenes) => {
    const newProj: BatchSceneProject = {
      id: `proj-${Date.now()}`,
      title: topicPrompt.slice(0, 45) + (topicPrompt.length > 45 ? '...' : ''),
      topicPrompt,
      language,
      accent: selectedVoice.accent,
      voiceId: selectedVoice.id,
      scenes: updatedScenes,
      aspectRatio,
      stylePreset,
      referenceImageUrl: referenceImageUrl || undefined,
      brandKit,
      socialCaption,
      socialHashtags,
      createdAt: new Date().toISOString(),
    };

    const updated = [newProj, ...projectsGallery.slice(0, 11)];
    setProjectsGallery(updated);
    try {
      localStorage.setItem('tts_batch_projects', JSON.stringify(updated));
    } catch (e) {
      console.warn('LocalStorage limit reached for audio storage', e);
    }
  };

  // 1. Template selection
  const handleSelectTemplate = (template: typeof VIDEO_TEMPLATES[0]) => {
    setTopicPrompt(template.sampleProduct);
    setMarketingTone(template.defaultTone);
    setSceneCount(template.sceneCount);

    const formatted: VideoScene[] = template.scenes.map((s, idx) => ({
      id: `scene-${Date.now()}-${idx + 1}`,
      sceneNumber: idx + 1,
      durationSeconds: 8,
      visualPrompt: `${s.visualPrompt} Consistent style: ${stylePreset}.`,
      cameraMovement: s.cameraMovement,
      voiceoverScript: s.voiceoverScript,
      captionText: s.captionText,
      status: 'pending',
    }));

    setScenes(formatted);
  };

  // 2. Generate Scene Breakdown (Idea-to-scenes)
  const handleGenerateIdeaToScenes = async () => {
    setError(null);
    setIsGeneratingBreakdown(true);
    setOverallProgress({
      percent: 10,
      currentStep: 'مناظر کی کہانی تیار کی جا رہی ہے...',
      total: sceneCount,
      completed: 0,
    });

    try {
      let formattedScenes: VideoScene[] = [];

      const rawText = (customPromptsText || topicPrompt).trim();
      if (!rawText) {
        setError('براہ کرم پرامپٹ، کہانی یا پروڈکٹ کا آئیڈیا درج کریں۔ (Please enter your prompt or idea)');
        setIsGeneratingBreakdown(false);
        setOverallProgress(null);
        return;
      }

      // Check if text has multiple scene prompts or is a single idea
      const isMultiPrompt =
        inputMode === 'custom_prompts' ||
        /(?:prompt\s*\d+|سین\s*\d+|منظر\s*\d+|^\s*\d+[\.\)\]]|^\[\d+\])/im.test(rawText) ||
        rawText.split(/\n+/).filter((l) => l.trim().length > 5).length >= 3;

      if (isMultiPrompt) {
        const res = await fetch('/api/parse-custom-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawPromptsText: rawText,
            durationSeconds: clipDuration,
            language,
            tone: marketingTone.toLowerCase(),
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to process custom prompts');
        }

        formattedScenes = (data.scenes || []).map((s: any, idx: number) => ({
          id: `scene-${Date.now()}-${idx + 1}`,
          sceneNumber: s.sceneNumber || idx + 1,
          durationSeconds: s.durationSeconds || clipDuration,
          voiceoverScript: s.voiceoverScript || '',
          visualPrompt: `${s.visualPrompt || ''} Visual style: ${stylePreset}.`,
          cameraMovement: s.cameraMovement || 'Cinematic steady shot',
          captionText: s.captionText || s.voiceoverScript?.slice(0, 30) || '',
          status: 'pending',
          visualUrl: referenceImageUrl || undefined,
        }));
      } else {
        // Idea-to-Scenes AI Auto Story
        const res = await fetch('/api/generate-batch-scenes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicPrompt: `${rawText}. Brand: ${brandKit.brandName}. Style: ${stylePreset}. Tone: ${marketingTone}.`,
            sceneCount,
            language,
            tone: marketingTone.toLowerCase(),
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to generate scene breakdown');
        }

        formattedScenes = (data.scenes || []).map((s: any, idx: number) => ({
          id: `scene-${Date.now()}-${idx + 1}`,
          sceneNumber: s.sceneNumber || idx + 1,
          durationSeconds: s.durationSeconds || clipDuration,
          voiceoverScript: s.voiceoverScript || '',
          visualPrompt: `${s.visualPrompt || ''} Visual style: ${stylePreset}.`,
          cameraMovement: s.cameraMovement || 'Cinematic camera pan',
          captionText: s.captionText || '',
          status: 'pending',
          visualUrl: referenceImageUrl || undefined,
        }));
      }

      if (formattedScenes.length > 0) {
        setSceneCount(formattedScenes.length);
      }
      setScenes(formattedScenes);
      setIsGeneratingBreakdown(false);

      // Trigger automatic audio/video generation based on target
      if (generationTarget !== 'video_only') {
        await handleBatchGenerateAudio(formattedScenes);
      }
      if (generationTarget !== 'audio_only') {
        await handleBatchGenerateVideos(formattedScenes);
      }
    } catch (err: any) {
      console.error('Breakdown generation error:', err);
      setError(err?.message || 'خرابی پیش آگئی، براہ کرم دوبارہ کوشش کیجیے۔');
      setIsGeneratingBreakdown(false);
      setOverallProgress(null);
    }
  };

  // 3. Batch Generate Audio with Auto-Retry (Up to 2 retries per scene)
  const handleBatchGenerateAudio = async (scenesList = scenes) => {
    setIsBatchGeneratingAudio(true);
    const updated = [...scenesList];

    for (let i = 0; i < updated.length; i++) {
      const scene = updated[i];
      if (!scene.voiceoverScript.trim()) continue;

      setOverallProgress({
        percent: Math.round(((i + 1) / updated.length) * 50),
        currentStep: `وائس اوور ریکارڈنگ: سین ${i + 1} آف ${updated.length}...`,
        total: updated.length,
        completed: i,
      });

      setScenes((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, isGeneratingAudio: true, status: 'generating' } : s))
      );

      let success = false;
      let audioData: any = null;

      // Auto retry up to 2 times
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch('/api/generate-voiceover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: scene.voiceoverScript,
              voiceName: selectedVoice.geminiVoice,
              accent: selectedVoice.accent,
              gender: selectedVoice.gender,
              tone: marketingTone === 'Energetic' ? 'energetic' : marketingTone === 'Formal' ? 'authoritative' : 'storyteller',
            }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            success = true;
            audioData = data;
            break;
          }
        } catch (e) {
          console.warn(`Audio attempt ${attempt} failed on scene ${i + 1}`);
        }
      }

      if (success && audioData) {
        const audioUrl = `data:${audioData.mimeType};base64,${audioData.audioBase64}`;
        updated[i] = {
          ...updated[i],
          audioBase64: audioData.audioBase64,
          audioUrl,
          isGeneratingAudio: false,
          status: updated[i].videoBlobUrl ? 'done' : 'pending',
        };
      } else {
        updated[i] = {
          ...updated[i],
          isGeneratingAudio: false,
          status: 'failed',
          errorMessage: 'Audio generation failed after 2 attempts',
        };
      }
      setScenes([...updated]);
    }

    setIsBatchGeneratingAudio(false);
    saveProjectToGallery(updated);
  };

  // 4. Batch Generate Videos with Auto-Retry
  const handleBatchGenerateVideos = async (scenesList = scenes) => {
    setIsBatchGeneratingVideos(true);
    const updated = [...scenesList];

    for (let i = 0; i < updated.length; i++) {
      const scene = updated[i];
      setOverallProgress({
        percent: 50 + Math.round(((i + 1) / updated.length) * 50),
        currentStep: `ویڈیو موشن رینڈرنگ: سین ${i + 1} آف ${updated.length}...`,
        total: updated.length,
        completed: i,
      });

      setScenes((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, isRenderingVideo: true, status: 'generating' } : s))
      );

      let success = false;
      let finalBlobUrl = '';
      let finalVisualUrl = scene.visualUrl;

      // Auto retry up to 2 times
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const fallbackUrl = `https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1280&q=80&sig=${scene.sceneNumber}`;
          if (referenceImageUrl) {
            finalVisualUrl = referenceImageUrl;
          } else if (!finalVisualUrl) {
            const res = await fetch('/api/generate-scene-visual', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                visualPrompt: `${scene.visualPrompt} Preset: ${stylePreset}`,
                sceneNumber: scene.sceneNumber,
                referenceImage: referenceImageUrl || undefined,
              }),
            });
            const data = await res.json();
            finalVisualUrl = data?.visualUrl || fallbackUrl;
          }

          const safeVisualUrl = finalVisualUrl || fallbackUrl;

          const videoBlob = await renderSceneToVideoBlob(
            safeVisualUrl,
            scene.durationSeconds || 8,
            scene.captionText,
            {
              aspectRatio,
              brandName: brandKit.brandName,
              primaryColor: brandKit.primaryColor,
            }
          );
          finalBlobUrl = URL.createObjectURL(videoBlob);
          success = true;
          break;
        } catch (err) {
          console.warn(`Video attempt ${attempt} failed on scene ${i + 1}`);
        }
      }

      if (success) {
        updated[i] = {
          ...updated[i],
          visualUrl: finalVisualUrl,
          videoBlobUrl: finalBlobUrl,
          isRenderingVideo: false,
          status: 'done',
        };
      } else {
        updated[i] = {
          ...updated[i],
          isRenderingVideo: false,
          status: 'failed',
          errorMessage: 'Video rendering failed after 2 attempts',
        };
      }
      setScenes([...updated]);
    }

    setIsBatchGeneratingVideos(false);
    setOverallProgress(null);
    saveProjectToGallery(updated);
  };

  // 5. Generate Single Voiceover Audio
  const handleGenerateSingleAudio = async (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene || !scene.voiceoverScript.trim()) return;

    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, isGeneratingAudio: true, status: 'generating' } : s))
    );

    try {
      const res = await fetch('/api/generate-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: scene.voiceoverScript,
          voiceName: selectedVoice.geminiVoice,
          accent: selectedVoice.accent,
          gender: selectedVoice.gender,
          tone: marketingTone === 'Energetic' ? 'energetic' : 'storyteller',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const audioUrl = `data:${data.mimeType};base64,${data.audioBase64}`;
        setScenes((prev) =>
          prev.map((s) =>
            s.id === sceneId
              ? {
                  ...s,
                  audioBase64: data.audioBase64,
                  audioUrl,
                  isGeneratingAudio: false,
                  status: s.videoBlobUrl ? 'done' : 'pending',
                }
              : s
          )
        );
      } else {
        setScenes((prev) =>
          prev.map((s) => (s.id === sceneId ? { ...s, isGeneratingAudio: false, status: 'failed' } : s))
        );
      }
    } catch {
      setScenes((prev) =>
        prev.map((s) => (s.id === sceneId ? { ...s, isGeneratingAudio: false, status: 'failed' } : s))
      );
    }
  };

  // 6. Generate Single Video Clip
  const handleGenerateSingleVideo = async (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    setScenes((prev) =>
      prev.map((s) =>
        s.id === sceneId
          ? { ...s, isRenderingVideo: true, isGeneratingVisual: true, renderProgress: 10, status: 'generating' }
          : s
      )
    );

    try {
      let visualUrl = scene.visualUrl;
      const fallbackUrl = `https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1280&q=80&sig=${scene.sceneNumber}`;
      if (!visualUrl) {
        const res = await fetch('/api/generate-scene-visual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visualPrompt: `${scene.visualPrompt} Style: ${stylePreset}`,
            sceneNumber: scene.sceneNumber,
          }),
        });
        const data = await res.json();
        visualUrl = data?.visualUrl || fallbackUrl;
      }

      const safeVisualUrl = visualUrl || fallbackUrl;

      const videoBlob = await renderSceneToVideoBlob(
        safeVisualUrl,
        scene.durationSeconds || 8,
        scene.captionText,
        {
          aspectRatio,
          brandName: brandKit.brandName,
          primaryColor: brandKit.primaryColor,
          onProgress: (p) => {
            setScenes((prev) =>
              prev.map((s) => (s.id === sceneId ? { ...s, renderProgress: p } : s))
            );
          },
        }
      );

      const videoBlobUrl = URL.createObjectURL(videoBlob);
      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                visualUrl,
                videoBlobUrl,
                isRenderingVideo: false,
                isGeneratingVisual: false,
                status: 'done',
              }
            : s
        )
      );
    } catch {
      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneId
            ? { ...s, isRenderingVideo: false, isGeneratingVisual: false, status: 'failed' }
            : s
        )
      );
    }
  };

  // 7. Auto-shorten voiceover
  const handleAutoShortenVoiceover = async (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    setShorteningSceneId(sceneId);
    try {
      const res = await fetch('/api/auto-shorten-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: scene.voiceoverScript,
          language,
        }),
      });
      const data = await res.json();
      if (data?.shortenedText) {
        setScenes((prev) =>
          prev.map((s) => (s.id === sceneId ? { ...s, voiceoverScript: data.shortenedText } : s))
        );
      }
    } catch (e) {
      console.error('Failed to shorten voiceover:', e);
    } finally {
      setShorteningSceneId(null);
    }
  };

  // 8. Download All Audio as ZIP (named scene-01.mp3, scene-02.mp3, ...)
  const handleDownloadAllAudioZip = async () => {
    const validAudios = scenes.filter((s) => s.audioBase64);
    if (validAudios.length === 0) return;

    setIsZippingAudio(true);
    try {
      const zip = new JSZip();

      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        if (s.audioBase64) {
          const mp3Blob = await wavBase64ToMp3Blob(s.audioBase64);
          const numStr = String(s.sceneNumber).padStart(2, '0');
          zip.file(`scene-${numStr}.mp3`, mp3Blob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `Audio_Scenes_Batch_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error creating Audio ZIP:', err);
    } finally {
      setIsZippingAudio(false);
    }
  };

  // 9. Download All Videos as ZIP (named scene-01.mp4, scene-02.mp4, ...)
  const handleDownloadAllVideosZip = async () => {
    const validVideos = scenes.filter((s) => s.videoBlobUrl);
    if (validVideos.length === 0) return;

    setIsZippingVideo(true);
    try {
      const zip = new JSZip();

      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        if (s.videoBlobUrl) {
          const res = await fetch(s.videoBlobUrl);
          const blob = await res.blob();
          const numStr = String(s.sceneNumber).padStart(2, '0');
          zip.file(`scene-${numStr}.mp4`, blob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `Video_Clips_Batch_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error creating Video ZIP:', err);
    } finally {
      setIsZippingVideo(false);
    }
  };

  // 10. Join All Audio into one MP3
  const handleJoinAllAudio = () => {
    const audioBase64List = scenes.map((s) => s.audioBase64).filter(Boolean) as string[];
    if (audioBase64List.length === 0) return;

    setIsMergingAllAudios(true);
    try {
      const mergedBlob = mergeWavAudiosToMp3(audioBase64List);
      const url = URL.createObjectURL(mergedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Full_Project_Master_Audio_${scenes.length}_Scenes.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to merge audio', err);
    } finally {
      setIsMergingAllAudios(false);
    }
  };

  // 11. Generate Social Media Caption & Hashtags
  const handleGenerateSocialCaptions = async () => {
    setIsLoadingSocial(true);
    setIsSocialModalOpen(true);
    try {
      const res = await fetch('/api/generate-social-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicPrompt,
          scenes,
          language,
        }),
      });
      const data = await res.json();
      if (data?.caption) {
        setSocialCaption(data.caption);
        setSocialHashtags(data.hashtags || []);
      }
    } catch (e) {
      console.error('Failed to generate social captions:', e);
    } finally {
      setIsLoadingSocial(false);
    }
  };

  // Scene Operations: Delete, Duplicate, Move, Update
  const handleUpdateScene = (id: string, updates: Partial<VideoScene>) => {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleDeleteScene = (id: string) => {
    if (scenes.length <= 1) return;
    setScenes((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered.map((s, idx) => ({ ...s, sceneNumber: idx + 1 }));
    });
  };

  const handleDuplicateScene = (id: string) => {
    const sceneIndex = scenes.findIndex((s) => s.id === id);
    if (sceneIndex === -1) return;
    const original = scenes[sceneIndex];
    const duplicate: VideoScene = {
      ...original,
      id: `scene-${Date.now()}`,
      sceneNumber: original.sceneNumber + 1,
      status: 'pending',
      audioUrl: undefined,
      audioBase64: undefined,
      videoBlobUrl: undefined,
    };

    const newScenes = [...scenes];
    newScenes.splice(sceneIndex + 1, 0, duplicate);
    setScenes(newScenes.map((s, idx) => ({ ...s, sceneNumber: idx + 1 })));
  };

  const handleMoveScene = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === scenes.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newScenes = [...scenes];
    const temp = newScenes[index];
    newScenes[index] = newScenes[targetIndex];
    newScenes[targetIndex] = temp;

    setScenes(newScenes.map((s, idx) => ({ ...s, sceneNumber: idx + 1 })));
  };

  // Play audio
  const handlePlayAudio = (scene: VideoScene) => {
    if (!scene.audioUrl) return;
    if (playingSceneId === scene.id && audioPlayerRef.current) {
      if (!audioPlayerRef.current.paused) {
        audioPlayerRef.current.pause();
        setPlayingSceneId(null);
        return;
      }
    }
    if (audioPlayerRef.current) audioPlayerRef.current.pause();
    const audio = new Audio(scene.audioUrl);
    audioPlayerRef.current = audio;
    audio.onended = () => setPlayingSceneId(null);
    audio.onerror = () => setPlayingSceneId(null);
    audio.play();
    setPlayingSceneId(scene.id);
  };

  // Download single audio
  const handleDownloadSingleAudio = async (scene: VideoScene) => {
    if (!scene.audioBase64) return;
    const mp3 = await wavBase64ToMp3Blob(scene.audioBase64);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(mp3);
    a.download = `scene-${String(scene.sceneNumber).padStart(2, '0')}.mp3`;
    a.click();
  };

  // Download single video
  const handleDownloadSingleVideo = (scene: VideoScene) => {
    if (!scene.videoBlobUrl) return;
    const a = document.createElement('a');
    a.href = scene.videoBlobUrl;
    a.download = `scene-${String(scene.sceneNumber).padStart(2, '0')}.mp4`;
    a.click();
  };

  // Style reference image upload
  const handleReferenceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setReferenceImageUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar: Templates, Brand Kit, Aspect Ratio, Style */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
        {/* Top Row: Brand Kit Button + Aspect Ratio + Style Preset */}
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Brand Kit Trigger */}
            <button
              onClick={() => setIsBrandKitModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>برانڈ کٹ (Brand Kit): {brandKit.brandName}</span>
              <span
                className="w-2.5 h-2.5 rounded-full border border-slate-700"
                style={{ backgroundColor: brandKit.primaryColor }}
              />
            </button>

            {/* Social Caption Button */}
            <button
              onClick={handleGenerateSocialCaptions}
              className="px-3 py-1.5 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 text-pink-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <MessageSquareShare className="w-3.5 h-3.5" />
              <span>کیپشن اور ہیش ٹیگز (Caption &amp; 10 Hashtags)</span>
            </button>
          </div>

          {/* Platform Preset Aspect Ratio (TikTok 9:16, YouTube 16:9, FB/Insta 1:1) */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 px-2 font-medium">پلیٹ فارم ریشو:</span>
            <button
              onClick={() => setAspectRatio('9:16')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                aspectRatio === '9:16'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="TikTok, Instagram Reels, YouTube Shorts (9:16)"
            >
              <Smartphone className="w-3 h-3" />
              <span>9:16 (Reels/Shorts)</span>
            </button>

            <button
              onClick={() => setAspectRatio('16:9')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                aspectRatio === '16:9'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="YouTube, Web, TV Landscape (16:9)"
            >
              <Tv className="w-3 h-3" />
              <span>16:9 (YouTube)</span>
            </button>

            <button
              onClick={() => setAspectRatio('1:1')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                aspectRatio === '1:1'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Instagram Feed, Facebook Post (1:1)"
            >
              <Square className="w-3 h-3" />
              <span>1:1 (Square)</span>
            </button>
          </div>
        </div>

        {/* Quick Style & Reference Bar */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>اسٹائل فلٹر:</span>
            {(['Cinematic', 'Realistic', 'Cartoon'] as StylePreset[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStylePreset(st)}
                className={`px-2.5 py-0.5 rounded-lg text-xs transition-all ${
                  stylePreset === st
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {st === 'Cinematic' ? 'سنیماٹک' : st === 'Realistic' ? 'حقیقی' : 'کارٹون'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">پہلے سے بنے پرامپٹس:</span>
            <button
              type="button"
              onClick={() => loadSamplePrompts(1)}
              className="px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-[10px] text-amber-300 border border-slate-800"
            >
              1 ویڈیو
            </button>
            <button
              type="button"
              onClick={() => loadSamplePrompts(4)}
              className="px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 text-[10px] text-amber-300 border border-slate-800 font-bold"
            >
              4 ویڈیوز ⭐
            </button>
          </div>
        </div>
      </div>

      {/* 2. THE MAIN PROMPT BOX (ایک ہی مرکزی پرامپٹ باکس + ریفرنس تصویر) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        {/* Prompt Box Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm border border-amber-500/30">
              ✍️
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>پرامپٹ باکس (Prompt Studio)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Step 1: Write &amp; Create
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                اپنا پرامپٹ یا کہانی لکھیں، اگر چاہیں تو ریفرنس تصویر دیں اور نیچے سے ویڈیوز تیار کریں
              </p>
            </div>
          </div>

          {/* Quick Stats Pill */}
          <div className="text-xs text-amber-300 font-mono bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20">
            {sceneCount} ویڈیوز &bull; {sceneCount * clipDuration} سیکنڈز کل
          </div>
        </div>

        {/* Textarea - Clean, No Clutter */}
        <div className="space-y-3">
          <textarea
            value={customPromptsText}
            onChange={(e) => {
              setCustomPromptsText(e.target.value);
              handleCustomPromptsChange(e.target.value);
            }}
            rows={5}
            placeholder="اپنا پرامپٹ یا کہانی یہاں لکھیں... (مثال: گاڑی ہائی وے پر دوڑ رہی ہے، یا Prompt 1:, Prompt 2:...)"
            className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl p-3.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-urdu leading-loose resize-none shadow-inner"
            dir="rtl"
          />

          {/* Reference Image Attachment (اگر ریفرنس سے امیج دینا چاہے تو ریفرنس سے امیج دے دے) */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {referenceImageUrl ? (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-amber-500 shadow-md shrink-0">
                    <img src={referenceImageUrl} alt="Reference" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>ریفرنس تصویر منسلک ہے ✓</span>
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      ویڈیوز اس تصویر کے ریفرنس اور موشن سے تیار ہوں گی
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReferenceImageUrl(null)}
                    className="text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 mr-2 transition-colors cursor-pointer"
                  >
                    ✕ تصویر ہٹائیں
                  </button>
                </div>
              ) : (
                <label className="text-xs text-slate-300 hover:text-white cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700/80 transition-all">
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold">📷 ریفرنس تصویر منتخب کریں (اختیاری)</span>
                  <span className="text-[10px] text-slate-400">اگر مخصوص تصویر سے ویڈیو بنانی ہو</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReferenceImageUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div className="text-[11px] text-slate-400">
              {referenceImageUrl ? (
                <span className="text-emerald-400 font-mono">ریفرنس ایکٹو ہے</span>
              ) : (
                <span>ریفرنس کے بغیر بھی AI خود ویڈیو مناظر تیار کرے گا</span>
              )}
            </div>
          </div>

          {/* Quick Settings Bar under the Prompt Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            {/* 1. Video Count */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>ویڈیوز کی تعداد:</span>
                <span className="font-bold text-amber-400 font-mono">{sceneCount} کلپس</span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 8].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleUpdateSceneCount(num)}
                    className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      sceneCount === num
                        ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {num} {num === 4 ? '⭐' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Clip Duration */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>کلپ کا دورانیہ:</span>
                <span className="font-bold text-amber-400 font-mono">{clipDuration}s فی کلپ</span>
              </div>
              <div className="flex items-center gap-1">
                {[5, 8, 10].map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setClipDuration(dur)}
                    className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      clipDuration === dur
                        ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {dur} سیکنڈز
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Language */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>زبان:</span>
                <span className="font-bold text-amber-400">
                  {language === 'urdu' ? 'پاکستانی 🇵🇰' : language === 'hindi' ? 'ہندی 🇮🇳' : 'انگلش 🌐'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLanguage('urdu')}
                  className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    language === 'urdu'
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  اردو 🇵🇰
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('hindi')}
                  className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    language === 'hindi'
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  ہندی 🇮🇳
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('english')}
                  className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    language === 'english'
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            {/* 4. Voice */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>آواز (Voice):</span>
                <span className="font-bold text-amber-400 text-[10px]">{selectedVoice.name}</span>
              </div>
              <select
                value={selectedVoice.id}
                onChange={(e) => {
                  const v = VOICE_OPTIONS.find((opt) => opt.id === e.target.value);
                  if (v) setSelectedVoice(v);
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {VOICE_OPTIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.accentLabel} - {v.gender})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={handleGenerateIdeaToScenes}
              disabled={isGeneratingBreakdown || isBatchGeneratingAudio || isBatchGeneratingVideos}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/25 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isGeneratingBreakdown || isBatchGeneratingAudio || isBatchGeneratingVideos ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>
                    {isGeneratingBreakdown
                      ? 'مناظر اور اسکرپٹ تیار ہو رہے ہیں...'
                      : isBatchGeneratingAudio
                      ? 'وائس اوور آڈیو بن رہی ہے...'
                      : 'ویڈیوز رینڈر ہو رہی ہیں...'}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>
                    🚀 تمام {sceneCount} ویڈیوز اور وائس اوورز تیار کریں ({sceneCount} کلپس &bull; {sceneCount * clipDuration} سیکنڈز)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Overall Progress Bar */}
        {overallProgress && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span className="font-medium">{overallProgress.currentStep}</span>
              </span>
              <span className="font-mono text-amber-400 font-bold text-sm">{overallProgress.percent}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-amber-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${overallProgress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. FINAL EXPORT & WORKFLOW SEPARATION: 2 Distinct Options */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30">
              🎬
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>فائنل ایکسپورٹ اور ڈاؤن لوڈ اسٹوڈیو (Export &amp; Merge Studio)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  Step 2: Download or Merge
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                کل مناظر: {scenes.length} &bull; ہر کلپ کا دورانیہ: {clipDuration} سیکنڈز &bull; کل دورانیہ: {scenes.length * clipDuration} سیکنڈز
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-emerald-400 font-mono">
              ✓ {scenes.filter((s) => s.audioBase64).length} آڈیو تیار
            </span>
            &bull;
            <span className="inline-flex items-center gap-1 text-indigo-400 font-mono">
              ✓ {scenes.filter((s) => s.videoBlobUrl).length} ویڈیوز تیار
            </span>
          </div>
        </div>

        {/* 2 Clear Action Columns: Option A (Separate Clips) vs Option B (Single Merged Video) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* OPTION A: الگ الگ ۸ سیکنڈ کی ویڈیوز (Separate Individual Clips) */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <FileArchive className="w-4 h-4 text-emerald-400" />
                  <span>آپشن ۱: الگ الگ {clipDuration} سیکنڈ کے کلپس</span>
                </span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                  {scenes.length} Separate Clips
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                تمام کلپس الگ الگ فائلز کی صورت میں زپ میں ڈاؤن لوڈ کریں۔ آپ چاہیں تو کیپ کٹ، پریمیئر یا موبائل ایپس میں خود استعمال کریں۔
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                {/* Download All Videos ZIP */}
                <button
                  onClick={handleDownloadAllVideosZip}
                  disabled={isZippingVideo || !scenes.some((s) => s.videoBlobUrl)}
                  className="py-2 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
                  title="Download All Videos in a ZIP file (scene-01.mp4, scene-02.mp4...)"
                >
                  {isZippingVideo ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileArchive className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  <span>تمام ویڈیوز زپ (ZIP)</span>
                </button>

                {/* Download All Audio ZIP */}
                <button
                  onClick={handleDownloadAllAudioZip}
                  disabled={isZippingAudio || !scenes.some((s) => s.audioBase64)}
                  className="py-2 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
                  title="Download All Audio in a ZIP file (scene-01.mp3, scene-02.mp3...)"
                >
                  {isZippingAudio ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileArchive className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>تمام آڈیو زپ (ZIP)</span>
                </button>
              </div>

              {/* Play All Sequence */}
              <button
                onClick={() => {
                  setSequenceIndex(0);
                  setIsSequencePlayerOpen(true);
                }}
                disabled={!scenes.some((s) => s.videoBlobUrl || s.audioBase64)}
                className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-amber-400" />
                <span>تمام کلپس کی ترتیب وار پریویو چلائیں (Sequence Player)</span>
              </button>
            </div>
          </div>

          {/* OPTION B: مکمل ویڈیو جوڑیں اور ایک بنا دیں (Merge into 1 Master Video) */}
          <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-4 space-y-3 flex flex-col justify-between hover:border-amber-500/50 transition-colors bg-gradient-to-br from-slate-950 via-slate-950 to-amber-950/20">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Film className="w-4 h-4" />
                  <span>آپشن ۲: مکمل ایک ویڈیو مرج کریں (Merge Master)</span>
                </span>
                <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                  1 Master MP4
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                مرج کیا ہے؟ یہ آپ کے تمام الگ الگ {scenes.length} کلپس کو جوڑ کر ایک مسلسل {scenes.length * clipDuration} سیکنڈ کی سنگل ویڈیو بنا دیتا ہے، جس میں بیک گراؤنڈ میوزک اور سب ٹائٹلز بھی شامل ہوتے ہیں۔
              </p>
            </div>

            <div className="space-y-2 pt-1">
              {/* MERGE FULL VIDEO (MP4 + Music + Subtitles) */}
              <button
                onClick={() => setIsMergeVideoModalOpen(true)}
                disabled={!scenes.some((s) => s.videoBlobUrl)}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-40 cursor-pointer"
              >
                <Film className="w-4 h-4" />
                <span>مکمل ویڈیو جوڑیں اور ڈاؤن لوڈ کریں (Open Merge Studio)</span>
              </button>

              {/* Join All Audio into single MP3 */}
              <button
                onClick={handleJoinAllAudio}
                disabled={isMergingAllAudios || !scenes.some((s) => s.audioBase64)}
                className="w-full py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
                title="Join all audios into single master MP3"
              >
                {isMergingAllAudios ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileAudio className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>تمام آڈیوز ملا کر ۱ ماسٹر MP3 بنائیں</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. SCENE CARDS LIST */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">منظر بہ منظر کارڈز (Scene Cards)</h3>
            <span className="text-xs text-slate-400">({scenes.length} مناظر)</span>
          </div>

          <button
            onClick={() => {
              const newScene: VideoScene = {
                id: `scene-${Date.now()}`,
                sceneNumber: scenes.length + 1,
                durationSeconds: 8,
                visualPrompt: 'Cinematic scene description...',
                cameraMovement: 'Smooth push-in',
                voiceoverScript: 'نیا وائس اوور اسکرپٹ یہاں درج کریں...',
                captionText: 'نیا کیپشن...',
                status: 'pending',
              };
              setScenes([...scenes, newScene]);
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 font-medium flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>نیا سین شامل کریں (Add Scene)</span>
          </button>
        </div>

        {/* Scene Cards Render */}
        <div className="space-y-4">
          {scenes.map((scene, idx) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              index={idx}
              totalScenes={scenes.length}
              aspectRatio={aspectRatio}
              stylePreset={stylePreset}
              brandKit={brandKit}
              playingSceneId={playingSceneId}
              onUpdateScene={handleUpdateScene}
              onDeleteScene={handleDeleteScene}
              onDuplicateScene={handleDuplicateScene}
              onMoveScene={handleMoveScene}
              onGenerateSingleAudio={handleGenerateSingleAudio}
              onGenerateSingleVideo={handleGenerateSingleVideo}
              onPlayAudio={handlePlayAudio}
              onDownloadAudio={handleDownloadSingleAudio}
              onDownloadVideo={handleDownloadSingleVideo}
              onAutoShortenVoiceover={handleAutoShortenVoiceover}
              isShorteningVoiceover={shorteningSceneId === scene.id}
            />
          ))}
        </div>
      </div>

      {/* 5. SAVED PROJECTS GALLERY */}
      {projectsGallery.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <FolderDown className="w-4 h-4 text-indigo-400" />
              <span>محفوظ شدہ پروجیکٹس گیلری (Saved Scene Batches Gallery)</span>
            </h3>
            <span className="text-xs text-slate-400">
              {projectsGallery.length} محفوظ شدہ پروجیکٹس
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projectsGallery.map((proj) => (
              <div
                key={proj.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  {editingProjectTitleId === proj.id ? (
                    <div className="flex items-center gap-1 w-full">
                      <input
                        type="text"
                        value={newProjectTitle}
                        onChange={(e) => setNewProjectTitle(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-xs px-2 py-0.5 rounded text-white w-full"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          const updated = projectsGallery.map((p) =>
                            p.id === proj.id ? { ...p, title: newProjectTitle } : p
                          );
                          setProjectsGallery(updated);
                          localStorage.setItem('tts_batch_projects', JSON.stringify(updated));
                          setEditingProjectTitleId(null);
                        }}
                        className="text-emerald-400 hover:text-emerald-300 text-xs font-bold px-1"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span
                        onClick={() => {
                          setEditingProjectTitleId(proj.id);
                          setNewProjectTitle(proj.title);
                        }}
                        className="text-xs font-medium text-slate-200 line-clamp-1 cursor-pointer hover:text-amber-400"
                        title="Click to rename"
                      >
                        {proj.title}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {proj.scenes.length} Scenes
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2">{proj.topicPrompt}</p>

                <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-[11px]">
                  <span className="text-slate-500">
                    {new Date(proj.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const dup: BatchSceneProject = {
                          ...proj,
                          id: `proj-${Date.now()}`,
                          title: `${proj.title} (Copy)`,
                          createdAt: new Date().toISOString(),
                        };
                        const updated = [dup, ...projectsGallery];
                        setProjectsGallery(updated);
                        localStorage.setItem('tts_batch_projects', JSON.stringify(updated));
                      }}
                      className="text-slate-400 hover:text-white"
                      title="Duplicate project"
                    >
                      ڈپلیکیٹ
                    </button>
                    <button
                      onClick={() => {
                        const updated = projectsGallery.filter((p) => p.id !== proj.id);
                        setProjectsGallery(updated);
                        localStorage.setItem('tts_batch_projects', JSON.stringify(updated));
                      }}
                      className="text-rose-400 hover:text-rose-300"
                      title="Delete project"
                    >
                      حذف
                    </button>
                    <button
                      onClick={() => {
                        setScenes(proj.scenes);
                        setTopicPrompt(proj.topicPrompt);
                        if (proj.aspectRatio) setAspectRatio(proj.aspectRatio);
                        if (proj.stylePreset) setStylePreset(proj.stylePreset);
                        if (proj.brandKit) setBrandKit(proj.brandKit);
                      }}
                      className="text-amber-400 hover:text-amber-300 font-semibold"
                    >
                      لوڈ کریں (Load)
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Brand Kit Modal */}
      <BrandKitModal
        isOpen={isBrandKitModalOpen}
        onClose={() => setIsBrandKitModalOpen(false)}
        brandKit={brandKit}
        onSave={handleSaveBrandKit}
      />

      {/* Social Caption & Hashtags Modal */}
      <SocialCaptionModal
        isOpen={isSocialModalOpen}
        onClose={() => setIsSocialModalOpen(false)}
        caption={socialCaption}
        hashtags={socialHashtags}
        isLoading={isLoadingSocial}
        onRegenerate={handleGenerateSocialCaptions}
      />

      {/* Merge Video Modal */}
      <MergeVideoModal
        isOpen={isMergeVideoModalOpen}
        onClose={() => setIsMergeVideoModalOpen(false)}
        scenes={scenes}
        aspectRatio={aspectRatio}
        brandKit={brandKit}
      />

      {/* Sequence Preview Player Modal */}
      {isSequencePlayerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>ترتیب وار کلپس پریویو (Sequence Player)</span>
                    <span className="text-xs text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      منظر {sequenceIndex + 1} از {scenes.length}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    یہاں آپ تمام کلپس کو باری باری سن اور دیکھ سکتے ہیں قبل اس کے کہ وہ ایک ویڈیو بنیں
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsSequencePlayerOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Scene Selectors Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {scenes.map((sc, idx) => (
                <button
                  key={sc.id}
                  onClick={() => setSequenceIndex(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all ${
                    sequenceIndex === idx
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  سین {idx + 1}
                  {sc.videoBlobUrl ? ' 🎬' : ''}
                  {sc.audioBase64 ? ' 🎙️' : ''}
                </button>
              ))}
            </div>

            {/* Current Scene Display */}
            {scenes[sequenceIndex] && (
              <div className="space-y-4 bg-slate-950 border border-slate-800/80 rounded-xl p-4">
                {/* Visual Video Area */}
                <div className="aspect-video w-full bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center relative border border-slate-800">
                  {scenes[sequenceIndex].videoBlobUrl ? (
                    <video
                      key={scenes[sequenceIndex].videoBlobUrl}
                      src={scenes[sequenceIndex].videoBlobUrl}
                      controls
                      autoPlay
                      className="w-full h-full object-contain"
                      onEnded={() => {
                        if (sequenceIndex < scenes.length - 1) {
                          setSequenceIndex(sequenceIndex + 1);
                        }
                      }}
                    />
                  ) : scenes[sequenceIndex].visualUrl ? (
                    <img
                      src={scenes[sequenceIndex].visualUrl}
                      alt="Preview"
                      className="w-full h-full object-contain opacity-60"
                    />
                  ) : (
                    <div className="text-center p-6 space-y-2 text-slate-500">
                      <Film className="w-10 h-10 mx-auto text-slate-600" />
                      <p className="text-xs">اس سین کی ویڈیو ابھی تیار نہیں ہوئی</p>
                      <span className="text-[10px] text-slate-600">نیچے دیے گئے کارڈ سے ویڈیو جنریٹ کریں</span>
                    </div>
                  )}

                  {/* Top Badge */}
                  <div className="absolute top-2 right-2 px-2.5 py-1 rounded bg-black/70 text-[10px] font-mono text-amber-300 backdrop-blur-sm">
                    {scenes[sequenceIndex].durationSeconds || clipDuration}s &bull; Scene {sequenceIndex + 1}
                  </div>
                </div>

                {/* Audio Player if available */}
                {scenes[sequenceIndex].audioBase64 && (
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-3">
                    <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <audio
                      src={scenes[sequenceIndex].audioBase64}
                      controls
                      className="w-full h-8"
                    />
                  </div>
                )}

                {/* Voiceover Script & Visual Prompt Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                      وائس اوور اسکرپٹ (Voiceover Text):
                    </span>
                    <p className="text-xs text-slate-200 font-urdu leading-relaxed" dir="rtl">
                      {scenes[sequenceIndex].voiceoverScript || 'کوئی اسکرپٹ موجود نہیں۔'}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                      ویژول پرامپٹ (Visual Prompt):
                    </span>
                    <p className="text-xs text-slate-300 font-mono leading-relaxed">
                      {scenes[sequenceIndex].visualPrompt || 'No visual prompt description.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation & Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                onClick={() => setSequenceIndex(Math.max(0, sequenceIndex - 1))}
                disabled={sequenceIndex === 0}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                ← پچھلا سین (Prev)
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsSequencePlayerOpen(false);
                    setIsMergeVideoModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>مکمل ویڈیو جوڑیں (Go to Merge)</span>
                </button>

                <button
                  onClick={() => setIsSequencePlayerOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  بند کریں (Close)
                </button>
              </div>

              <button
                onClick={() => setSequenceIndex(Math.min(scenes.length - 1, sequenceIndex + 1))}
                disabled={sequenceIndex === scenes.length - 1}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                اگلا سین (Next) →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
