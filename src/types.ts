export type Gender = 'male' | 'female';

export type Accent =
  | 'pakistani_urdu'
  | 'indian_hindi_urdu'
  | 'english_us'
  | 'english_uk'
  | 'english_south_asian';

export type Tone = 'natural' | 'energetic' | 'calm' | 'authoritative' | 'storyteller';

export type SpeakingStyle =
  | 'Normal'
  | 'Cheerful'
  | 'Serious'
  | 'Calm'
  | 'Excited'
  | 'Whisper'
  | 'Storyteller'
  | 'News Anchor';

export type VoiceFilter =
  | 'All'
  | 'Male'
  | 'Female'
  | 'Child'
  | 'Young'
  | 'Mature'
  | 'Energetic'
  | 'Calm'
  | 'Storytelling';

export type VoiceCharacteristic =
  | 'child'
  | 'young'
  | 'mature'
  | 'energetic'
  | 'calm'
  | 'storytelling';

export interface VoiceOption {
  id: string;
  name: string;
  geminiVoice: string;
  gender: Gender;
  accent: Accent;
  accentLabel: string;
  language: string;
  description: string;
  avatarSeed: string;
  isSimulatedChild?: boolean;
  styleInstruction?: string;
  characteristics?: VoiceCharacteristic[];
  recommendedLanguages?: ('urdu' | 'hindi' | 'english')[];
}

export interface GeneratedVoiceover {
  id: string;
  text: string;
  audioUrl: string;
  audioBase64: string;
  mimeType: string;
  duration: number;
  voice: VoiceOption;
  tone: Tone;
  createdAt: string;
}

export interface ScriptPreset {
  id: string;
  title: string;
  category: string;
  prompt: string;
  language: string;
  preview: string;
}

export type SceneStatus = 'pending' | 'generating' | 'done' | 'failed';

export type AspectRatio = '9:16' | '16:9' | '1:1';

export type StylePreset = 'Cinematic' | 'Realistic' | 'Cartoon' | 'Minimal';

export type MarketingTone = 'Formal' | 'Friendly' | 'Energetic' | 'Emotional';

export interface BrandKit {
  brandName: string;
  logoUrl?: string; // base64 or URL
  primaryColor: string;
  secondaryColor: string;
  toneOfVoice: MarketingTone;
  defaultLanguage: 'urdu' | 'hindi' | 'english' | 'bilingual';
  defaultVoiceId: string;
}

export interface VideoTemplate {
  id: string;
  title: string;
  titleUrdu: string;
  description: string;
  category: string;
  defaultTone: MarketingTone;
  sceneCount: number;
  sampleProduct: string;
  scenes: {
    visualPrompt: string;
    voiceoverScript: string;
    cameraMovement: string;
    captionText: string;
  }[];
}

export interface VideoScene {
  id: string;
  sceneNumber: number;
  durationSeconds: number; // typically 8s
  voiceoverScript: string; // The exact words spoken
  visualPrompt: string;    // Camera, setting, mood, lighting
  cameraMovement: string;
  captionText: string;
  status?: SceneStatus;
  errorMessage?: string;
  audioBase64?: string;
  audioUrl?: string;
  audioStatus?: 'pending' | 'generating' | 'done' | 'failed';
  videoStatus?: 'pending' | 'generating' | 'done' | 'failed';
  errorCategory?: 'quota' | 'network' | 'prompt' | 'server';
  errorDetails?: string;
  showDetails?: boolean;
  isGeneratingAudio?: boolean;
  isGeneratingVisual?: boolean;
  visualUrl?: string;
  visualSource?: 'gemini' | 'cinematic' | 'reference';
  videoSource?: 'ai_video' | 'cinematic_fallback';
  videoBlobUrl?: string;
  isRenderingVideo?: boolean;
  renderProgress?: number;
}

export interface BatchSceneProject {
  id: string;
  title: string;
  topicPrompt: string;
  language: string;
  accent: Accent;
  voiceId: string;
  scenes: VideoScene[];
  createdAt: string;
  aspectRatio?: AspectRatio;
  stylePreset?: StylePreset;
  referenceImageUrl?: string;
  brandKit?: BrandKit;
  socialCaption?: string;
  socialHashtags?: string[];
  googleDriveSynced?: boolean;
}

export interface AudioChunk {
  id: string;
  chunkIndex: number;
  text: string;
  wordCount: number;
  estimatedSeconds: number;
  audioBase64?: string;
  audioUrl?: string;
  duration?: number;
  status: 'pending' | 'generating' | 'done' | 'failed';
  errorMessage?: string;
  errorDetails?: string;
  rawError?: any;
  showDetails?: boolean;
}
