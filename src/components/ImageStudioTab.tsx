import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Image as ImageIcon,
  Sparkles,
  Upload,
  Trash2,
  Download,
  Calendar,
  Clock,
  RefreshCw,
  Play,
  Square,
  CheckCircle2,
  X,
  Crown,
  Shield,
  Tag,
  ChevronDown,
  ChevronUp,
  Layers,
  Check,
  Palette,
  SlidersHorizontal,
  Save,
  HardDrive,
  ExternalLink,
  Rocket,
} from 'lucide-react';

export interface LogoConfig {
  enabled: boolean;
  type: 'upload' | 'preset' | 'text';
  imageBase64: string;
  presetId: 'royal_crest' | 'falcon_emblem' | 'gnzee_badge' | 'luxury_diamond' | 'islamic_crescent' | 'inspiration_star';
  text: string;
  position: 'top_center' | 'top_right' | 'top_left' | 'bottom_center' | 'bottom_right';
}

export const VISUAL_CATEGORIES = [
  { id: 'auto', label: '✨ خودکار AI انٹیلیجنس (Auto AI Sense)', desc: 'پرامپٹ کو سمجھ کر بہترین بیک گراؤنڈ خود چنے' },
  { id: 'spirituality_islamic', label: '🕌 اسلامی اور روحانیت', desc: 'مسجد، مینار، محراب، دعا اور نورانی فضا' },
  { id: 'family_parents', label: '👨‍👩‍👧 والدین اور خاندان', desc: 'ماں باپ کا پیار، شفقت اور خاندانی گرمجوشی' },
  { id: 'majestic_wildlife', label: '🦅 عقاب، شاہین اور طاقت', desc: 'بلند پرواز شاہین، شیر اور خودداری' },
  { id: 'hard_work_craftsman', label: '🔨 محنت، کسان اور کاریگر', desc: 'لوہار، کسان کی محنت، پسینہ اور دستکاری' },
  { id: 'motivation_success', label: '🏔️ کامیابی، چوٹی اور ارادہ', desc: 'پہاڑ کی چوٹی، طلوع آفتاب اور فتح' },
  { id: 'wisdom_study', label: '📚 علم، کتاب اور مطالعہ', desc: 'کلاسیک لائبریری، کھلی کتاب اور قلم' },
  { id: 'rain_peace_contemplation', label: '🌧️ بارش، سکون اور سوچ', desc: 'بارش کی بوندیں، کھڑکی اور پرسکون شام' },
  { id: 'morning_dawn_tea', label: '☕ صبح کی چائے اور فجر', desc: 'گرما گرم چائے، طلوع صبح اور نئی امید' },
  { id: 'friendship_loyalty', label: '🤝 دوستی اور سچی وفا', desc: 'مخلص ساتھی، ہم سفر اور بھائی چارہ' },
  { id: 'business_commerce', label: '💼 بزنس اور مارکیٹ', desc: 'کاروباری عمارت، دکان اور ترقی' },
  { id: 'wealth_luxury_time', label: '💎 وقت، گھڑی اور شاہانہ انداز', desc: 'گولڈن گھڑی، فاؤنٹین پین اور دولت' },
  { id: 'automotive', label: '🚗 سپر کارز اور رفتار', desc: 'لگژری اسپورٹس کار اور ہائی وے' },
  { id: 'driver_portrait', label: '👤 پروقار پورٹریٹ اور چہرہ', desc: 'باوقار مسکراہٹ اور پراعتماد شخصیت' },
  { id: 'technology', label: '💻 ٹیکنالوجی اور کمپیوٹر', desc: 'آرٹیفیشل انٹیلیجنس اور ڈیجیٹل دنیا' },
  { id: 'fitness_sports', label: '🏋️‍♂️ فٹنس اور تندرستی', desc: 'جم، ورزش اور کھلاڑی کا عزم' },
  { id: 'nature', label: '🌲 قدرت اور سبزہ زار', desc: 'ہرے بھرے جنگلات، آبشار اور وادی' },
  { id: 'ocean_sea', label: '🌊 سمندر اور ساحل', desc: 'سمندر کی پرسکون لہریں اور گہرائی' },
  { id: 'space_galaxy', label: '🌌 کہکشاں اور ستارے', desc: 'ستاروں بھرا آسمان اور کائنات' },
  { id: 'historical_heritage', label: '🏰 تاریخی ورثہ اور محلات', desc: 'مغل طرز تعمیر اور شاہی قلعے' },
  { id: 'perseverance_growth', label: '🌱 صبر اور استقامت', desc: 'مضبوط قدیم درخت اور بڑھتا ہوا پودا' },
];

export interface GalleryItem {
  id: string;
  title: string;
  quote: string;
  dataUrl: string;
  rawVisualUrl?: string;
  engineUsed?: string;
  createdAtTime: string;
  createdDateStr: string;
  dayLabel?: string; // e.g. "Day 1"
  scheduledTime?: string; // e.g. "08:00 AM"
  isDaily?: boolean;
  enhancedPrompt?: string;
  aspectRatio?: '1:1' | '9:16' | '16:9';
  visualCategory?: string;
  originalPrompt?: string;
}

export interface ActiveSchedule {
  id: string;
  imagesPerDay: number;
  daysCount: number;
  scheduledTime: string; // e.g. "08:00"
  prompt: string;
  referenceImage: string;
  startedAtDate: string; // ISO date string in PKT
  lastGeneratedDay: number; // e.g. 1
  totalQuota: number;
  isActive: boolean;
}

const STORAGE_KEYS = {
  GALLERY: 'simple_image_studio_gallery_v2',
  ACTIVE_SCHEDULE: 'simple_image_studio_active_schedule_v2',
  SINGLE_PROMPT: 'simple_image_studio_single_prompt_v2',
  SINGLE_ASPECT_RATIO: 'simple_image_studio_aspect_ratio_v2',
  SINGLE_NUM_IMAGES: 'simple_image_studio_num_images_v2',
  DAILY_PROMPT: 'simple_image_studio_daily_prompt_v2',
  LOGO_CONFIG: 'simple_image_studio_logo_v3',
  SELECTED_CATEGORY: 'simple_image_studio_category_v3',
  DRIVE_FOLDER_ID: 'simple_image_studio_drive_folder_id',
};

// Helper: Get Current Date/Time in Pakistan Standard Time (PKT UTC+05:00)
function getPakistanTime(): {
  dateStr: string;
  timeStr: string;
  hours: number;
  minutes: number;
  formatted12h: string;
} {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const day = getPart('day');
  const month = getPart('month');
  const hour = getPart('hour');
  const minute = getPart('minute');
  const dayPeriod = getPart('dayPeriod').toUpperCase();

  const formatted12h = `${hour}:${minute} ${dayPeriod}`;
  const dateStr = `${day} ${month}`;

  // 24h conversion for schedule comparison
  const options24: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  };
  const time24Parts = new Intl.DateTimeFormat('en-US', options24).formatToParts(now);
  const h24 = parseInt(time24Parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const m24 = parseInt(time24Parts.find((p) => p.type === 'minute')?.value || '0', 10);

  return {
    dateStr,
    timeStr: formatted12h,
    hours: h24,
    minutes: m24,
    formatted12h,
  };
}

// Convert "08:00" 24h string to 12h format "08:00 AM"
function formatTo12Hour(time24: string): string {
  if (!time24) return '08:00 AM';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr || '8', 10);
  const m = mStr || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const hDisplay = h < 10 ? `0${h}` : `${h}`;
  return `${hDisplay}:${m} ${period}`;
}

// Color palettes for automatic theme styling based on content
const PALETTES: Record<
  string,
  {
    bgStart: string;
    bgEnd: string;
    accent: string;
    accentSoft: string;
    textPrimary: string;
    cardTint: string;
  }
> = {
  gold_black: {
    bgStart: '#080a0f',
    bgEnd: '#1c170d',
    accent: '#f59e0b',
    accentSoft: 'rgba(245, 158, 11, 0.28)',
    textPrimary: '#ffffff',
    cardTint: 'rgba(8, 10, 16, 0.82)',
  },
  emerald_royal: {
    bgStart: '#041712',
    bgEnd: '#092b22',
    accent: '#34d399',
    accentSoft: 'rgba(52, 211, 153, 0.28)',
    textPrimary: '#ffffff',
    cardTint: 'rgba(4, 20, 16, 0.82)',
  },
  midnight_blue: {
    bgStart: '#060d1f',
    bgEnd: '#0f2244',
    accent: '#38bdf8',
    accentSoft: 'rgba(56, 189, 248, 0.28)',
    textPrimary: '#ffffff',
    cardTint: 'rgba(6, 14, 32, 0.82)',
  },
  warm_sunset: {
    bgStart: '#1c0c07',
    bgEnd: '#3b160b',
    accent: '#fb923c',
    accentSoft: 'rgba(251, 146, 60, 0.28)',
    textPrimary: '#ffffff',
    cardTint: 'rgba(24, 10, 6, 0.82)',
  },
  clean_light: {
    bgStart: '#0f172a',
    bgEnd: '#1e293b',
    accent: '#f59e0b',
    accentSoft: 'rgba(245, 158, 11, 0.25)',
    textPrimary: '#ffffff',
    cardTint: 'rgba(15, 23, 42, 0.85)',
  },
  gnzee_navy_gold: {
    bgStart: '#060f1e',
    bgEnd: '#0a192f',
    accent: '#d4af37', // Official Gold
    accentSoft: 'rgba(212, 175, 55, 0.28)',
    textPrimary: '#fdfbf7', // Official Cream
    cardTint: 'rgba(10, 25, 47, 0.88)',
  },
};

// High-resolution Canvas Poster Renderer (100% Free, Zero Broken Images, CORS-Safe)
// STRICT COMPLIANCE:
// 1. User's Urdu text is 100% LOCKED, MANDATORY & PRESERVED. Every word MUST appear.
// 2. Text has priority over design: font size dynamically scales so 0 words are truncated.
// 3. No unauthorized slogans, watermarks, or handles.
// 4. GNZEE MARKET official branding (Navy Blue, Gold, Cream, Corporate frame).
async function renderSimplePoster(params: {
  headline?: string;
  quote: string;
  brandName?: string;
  referenceImageBase64?: string;
  backgroundUrl?: string;
  colorPalette?: string;
  daySlotTag?: string;
  logoConfig?: LogoConfig;
  aspectRatio?: '1:1' | '9:16' | '16:9';
}): Promise<string> {
  const {
    headline = '',
    quote,
    brandName = '',
    referenceImageBase64,
    backgroundUrl,
    colorPalette = 'gold_black',
    daySlotTag,
    logoConfig,
    aspectRatio = '1:1',
  } = params;

  const hasBranding = Boolean((logoConfig && logoConfig.enabled) || (brandName && brandName.trim()));
  const isGnzee = hasBranding && ((brandName && brandName.toLowerCase().includes('gnzee')) || colorPalette === 'gnzee_navy_gold' || (logoConfig?.enabled && logoConfig?.presetId === 'gnzee_badge'));
  const theme = isGnzee ? PALETTES.gnzee_navy_gold : PALETTES[colorPalette] || PALETTES.gold_black;

  let width = 1080;
  let height = 1080;
  if (aspectRatio === '9:16') {
    width = 1080;
    height = 1920;
  } else if (aspectRatio === '16:9') {
    width = 1920;
    height = 1080;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Rich Gradient Base (Navy Blue & Obsidian or selected theme)
  const baseGrad = ctx.createLinearGradient(0, 0, width, height);
  baseGrad.addColorStop(0, theme.bgStart);
  baseGrad.addColorStop(1, theme.bgEnd);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Draw Reference Image (if provided) or Native AI Generated Background Image
  const imgSource =
    referenceImageBase64 && referenceImageBase64.startsWith('data:image')
      ? referenceImageBase64
      : backgroundUrl;

  let hasLoadedImage = false;
  if (imgSource) {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timeout = setTimeout(() => resolve(), 3500);
      img.onload = () => {
        clearTimeout(timeout);
        try {
          const scale = Math.max(width / img.width, height / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = (width - drawW) / 2;
          const drawY = (height - drawH) / 2;
          ctx.save();
          // Full 100% opacity to showcase the native AI scene in full brilliance
          ctx.globalAlpha = 1.0;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          ctx.restore();
          hasLoadedImage = true;
        } catch {
          // ignore canvas taint
        }
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timeout);
        resolve();
      };
      img.src = imgSource;
    });
  }

  // Define Layout Coordinates based on whether an AI scene is present
  const centerX = width / 2;
  let padX: number;
  let padY: number;
  let cardW: number;
  let cardH: number;
  let cursorY: number;

  // Helper to draw user's logo or branding
  const renderBranding = async (targetY: number) => {
    if (logoConfig && logoConfig.enabled) {
      const pos = logoConfig.position || 'top_center';

      // 1. Uploaded Custom Logo Image
      if (logoConfig.type === 'upload' && logoConfig.imageBase64) {
        await new Promise<void>((resolve) => {
          const lImg = new Image();
          lImg.crossOrigin = 'anonymous';
          const t = setTimeout(() => resolve(), 3000);
          lImg.onload = () => {
            clearTimeout(t);
            try {
              const maxW = 140;
              const maxH = 80;
              const scale = Math.min(maxW / lImg.width, maxH / lImg.height, 1);
              const drawW = lImg.width * scale;
              const drawH = lImg.height * scale;

              let lx = centerX - drawW / 2;
              let ly = targetY - drawH / 2;

              if (pos === 'top_right') {
                lx = width - padX - drawW;
                ly = targetY - drawH / 2;
              } else if (pos === 'top_left') {
                lx = padX;
                ly = targetY - drawH / 2;
              } else if (pos === 'bottom_center') {
                lx = centerX - drawW / 2;
                ly = height - drawH - 24;
              } else if (pos === 'bottom_right') {
                lx = width - padX - drawW;
                ly = height - drawH - 24;
              }

              ctx.save();
              ctx.shadowColor = 'rgba(0,0,0,0.95)';
              ctx.shadowBlur = 14;
              ctx.drawImage(lImg, lx, ly, drawW, drawH);
              ctx.restore();
            } catch {
              // ignore
            }
            resolve();
          };
          lImg.onerror = () => {
            clearTimeout(t);
            resolve();
          };
          lImg.src = logoConfig.imageBase64;
        });
        return;
      }

      // 2. Preset Logo Badges
      if (logoConfig.type === 'preset') {
        const pId = logoConfig.presetId || 'gnzee_badge';
        let icon = '✦';
        let badgeLabel = 'GNZEE MARKET';

        if (pId === 'royal_crest') {
          icon = '👑';
          badgeLabel = logoConfig.text?.trim() || 'ROYAL CREST';
        } else if (pId === 'falcon_emblem') {
          icon = '🦅';
          badgeLabel = logoConfig.text?.trim() || 'شاہین • FALCON';
        } else if (pId === 'gnzee_badge') {
          icon = '✦';
          badgeLabel = 'GNZEE MARKET';
        } else if (pId === 'luxury_diamond') {
          icon = '💎';
          badgeLabel = logoConfig.text?.trim() || 'LUXURY CREST';
        } else if (pId === 'islamic_crescent') {
          icon = '☪';
          badgeLabel = logoConfig.text?.trim() || 'نورِ حکمت';
        } else if (pId === 'inspiration_star') {
          icon = '🌟';
          badgeLabel = logoConfig.text?.trim() || 'DAILY INSPIRATION';
        }

        let bx = centerX;
        let by = targetY;

        if (pos === 'top_right') {
          bx = width - padX - 120;
          by = targetY;
        } else if (pos === 'top_left') {
          bx = padX + 120;
          by = targetY;
        } else if (pos === 'bottom_center') {
          bx = centerX;
          by = height - 42;
        } else if (pos === 'bottom_right') {
          bx = width - padX - 120;
          by = height - 42;
        }

        ctx.save();
        ctx.fillStyle = theme.accent;
        ctx.font = 'bold 22px "Plus Jakarta Sans", "Noto Nastaliq Urdu", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 12;
        ctx.fillText(`${icon}  ${badgeLabel}  ${icon}`, bx, by);
        ctx.restore();
        return;
      }

      // 3. Custom Text Brand
      if (logoConfig.type === 'text') {
        const textLabel = logoConfig.text?.trim() || brandName.trim() || 'DAILY MOTIVATION';
        let tx = centerX;
        let ty = targetY;

        if (pos === 'top_right') {
          tx = width - padX - 120;
          ty = targetY;
        } else if (pos === 'top_left') {
          tx = padX + 120;
          ty = targetY;
        } else if (pos === 'bottom_center') {
          tx = centerX;
          ty = height - 42;
        } else if (pos === 'bottom_right') {
          tx = width - padX - 120;
          ty = height - 42;
        }

        ctx.save();
        ctx.fillStyle = theme.accent;
        ctx.font = 'bold 22px "Plus Jakarta Sans", "Noto Nastaliq Urdu", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 12;
        ctx.fillText(`✦  ${textLabel}  ✦`, tx, ty);
        ctx.restore();
        return;
      }
    }

    // If branding was not explicitly requested or enabled, do not render any logo/watermark
    if (!hasBranding) {
      return;
    }

    // Default Fallback
    if (isGnzee) {
      ctx.save();
      ctx.fillStyle = theme.accent;
      ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 10;
      ctx.fillText('✦  GNZEE MARKET  ✦', centerX, targetY);
      ctx.restore();
    } else if (brandName && brandName.trim()) {
      ctx.save();
      ctx.fillStyle = theme.accent;
      ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 10;
      ctx.fillText(`✦  ${brandName.trim()}  ✦`, centerX, targetY);
      ctx.restore();
    }
  };

  if (hasLoadedImage) {
    // 3A. Cinematic Overlays for Hybrid Composition:
    // Top subtle vignette for crisp header readability
    const topVignette = ctx.createLinearGradient(0, 0, 0, 160);
    topVignette.addColorStop(0, 'rgba(3, 7, 18, 0.75)');
    topVignette.addColorStop(1, 'transparent');
    ctx.fillStyle = topVignette;
    ctx.fillRect(0, 0, width, 160);

    // Deep smooth bottom scrim: leaves the upper 50% visual scene completely open & vivid
    const bottomScrim = ctx.createLinearGradient(0, height * 0.38, 0, height);
    bottomScrim.addColorStop(0, 'rgba(4, 9, 20, 0.0)');
    bottomScrim.addColorStop(0.35, 'rgba(4, 9, 20, 0.52)');
    bottomScrim.addColorStop(0.70, 'rgba(4, 9, 20, 0.88)');
    bottomScrim.addColorStop(1, 'rgba(4, 9, 20, 0.97)');
    ctx.fillStyle = bottomScrim;
    ctx.fillRect(0, height * 0.38, width, height * 0.62);

    // Lower frosted glass pedestal for typography
    padX = 60;
    padY = height * 0.46;
    cardW = width - padX * 2;
    cardH = height - padY - 45;

    ctx.save();
    ctx.fillStyle = isGnzee ? 'rgba(10, 25, 47, 0.68)' : 'rgba(8, 12, 22, 0.65)';
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(padX, padY, cardW, cardH, 22);
    ctx.fill();
    ctx.stroke();

    // Subtle inner hairline
    ctx.strokeStyle = theme.accentSoft;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.roundRect(padX + 10, padY + 10, cardW - 20, cardH - 20, 14);
    ctx.stroke();
    ctx.restore();

    cursorY = padY + 50;

    // Render Branding / Logo at top
    await renderBranding(65);
  } else {
    // 3B. Classic Luxury Frame (When no photographic background is available)
    ctx.save();
    const radialGlow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.35,
      width * 0.05,
      width * 0.5,
      height * 0.5,
      width * 0.7
    );
    radialGlow.addColorStop(0, theme.accentSoft);
    radialGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = radialGlow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    padX = 75;
    padY = 85;
    cardW = width - padX * 2;
    cardH = height - padY * 2;

    ctx.save();
    ctx.fillStyle = theme.cardTint;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(padX, padY, cardW, cardH, 24);
    ctx.fill();
    ctx.stroke();

    // Inner subtle hairline frame
    ctx.strokeStyle = theme.accentSoft;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(padX + 14, padY + 14, cardW - 28, cardH - 28, 16);
    ctx.stroke();
    ctx.restore();

    cursorY = padY + 65;

    // Header inside the card
    await renderBranding(cursorY);
    cursorY += 45;
  }

  // 6. Optional Headline / Title (only if user provided one)
  const hasHeadline = Boolean(headline && headline.trim() && headline.trim() !== quote.trim());
  if (hasHeadline) {
    ctx.save();
    ctx.fillStyle = theme.accent;
    ctx.font = '700 42px "Noto Nastaliq Urdu", "Amiri", serif';
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.fillText(headline.trim(), centerX, cursorY, cardW - 100);
    ctx.restore();

    cursorY += 35;
    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(centerX - 60, cursorY);
    ctx.lineTo(centerX + 60, cursorY);
    ctx.stroke();
    ctx.restore();
    cursorY += 40;
  } else {
    cursorY += 20;
  }

  // 7. LOCKED URDU TEXT (Dynamic Sizing: 100% of Words Must Appear, Never Truncated)
  const cleanQuote = quote.trim();
  const isRtl = /[\u0600-\u06FF]/.test(cleanQuote);
  const words = cleanQuote.split(/\s+/).filter(Boolean);

  // Available vertical space for the text
  const bottomMargin = brandName || isGnzee ? 100 : 60;
  const maxAvailableHeight = padY + cardH - cursorY - bottomMargin;
  const maxLineWidth = cardW - 120;

  // Dynamically compute font size so ALL lines fit inside the card frame
  let computedFontSize = 46;
  let lines: string[] = [];
  let lineHeight = Math.round(computedFontSize * (isRtl ? 1.85 : 1.45));

  // Loop down until all words fit completely
  while (computedFontSize >= 18) {
    ctx.font = `600 ${computedFontSize}px ${
      isRtl ? '"Noto Nastaliq Urdu", "Amiri", serif' : '"Plus Jakarta Sans", sans-serif'
    }`;

    lines = [];
    let curLine = '';
    for (const word of words) {
      const testLine = curLine ? `${curLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxLineWidth && curLine) {
        lines.push(curLine);
        curLine = word;
      } else {
        curLine = testLine;
      }
    }
    if (curLine) lines.push(curLine);

    lineHeight = Math.round(computedFontSize * (isRtl ? 1.85 : 1.45));
    const totalHeight = lines.length * lineHeight;

    if (totalHeight <= maxAvailableHeight || computedFontSize <= 20) {
      break;
    }
    computedFontSize -= 2;
  }

  // Vertical Centering within remaining area
  const actualTextHeight = lines.length * lineHeight;
  const verticalOffset = Math.max(0, (maxAvailableHeight - actualTextHeight) / 3);
  cursorY += verticalOffset;

  ctx.save();
  ctx.fillStyle = theme.textPrimary;
  ctx.font = `600 ${computedFontSize}px ${
    isRtl ? '"Noto Nastaliq Urdu", "Amiri", serif' : '"Plus Jakarta Sans", sans-serif'
  }`;
  ctx.textAlign = 'center';
  ctx.direction = isRtl ? 'rtl' : 'ltr';

  // Render EVERY line — NEVER slice or truncate
  for (const line of lines) {
    ctx.fillText(line, centerX, cursorY);
    cursorY += lineHeight;
  }
  ctx.restore();

  // 8. Brand Watermark / Footer (ONLY if user explicitly requested branding)
  if (hasBranding && isGnzee) {
    const footerY = padY + cardH - 42;
    ctx.save();
    ctx.fillStyle = theme.accent;
    ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦  GNZEE MARKET  ✦', centerX, footerY);
    ctx.restore();
  } else if (hasBranding && brandName && brandName.trim()) {
    const footerY = padY + cardH - 42;
    ctx.save();
    ctx.fillStyle = theme.accent;
    ctx.font = '600 22px "Noto Nastaliq Urdu", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`✦  ${brandName.trim()}  ✦`, centerX, footerY);
    ctx.restore();
  }
  // If NO brand is specified, we DO NOT add unauthorized watermarks!

  // Final internal verification check:
  // Ensure all words are present
  const renderedText = lines.join(' ');
  const missingWords = words.filter((w) => !renderedText.includes(w));
  if (missingWords.length > 0) {
    console.warn('Word verification warning: some words may not be rendered:', missingWords);
  }

  try {
    return canvas.toDataURL('image/png', 0.95);
  } catch {
    return '';
  }
}

export interface ImageStudioTabProps {
  onNavigateToSocial?: () => void;
}

export const ImageStudioTab: React.FC<ImageStudioTabProps> = ({ onNavigateToSocial }) => {
  // Mode selection: Single Image vs Multiple / Daily
  const [activeSubMode, setActiveSubMode] = useState<'single' | 'daily'>('single');

  // Single Image State
  const [singlePrompt, setSinglePrompt] = useState<string>(() => {
    return (
      localStorage.getItem(STORAGE_KEYS.SINGLE_PROMPT) ||
      'صبر اور کامیابی پر ایک پروقار اور خوبصورت موٹیویشنل پوسٹ'
    );
  });
  const [singleAspectRatio, setSingleAspectRatio] = useState<'1:1' | '9:16' | '16:9'>(() => {
    return (localStorage.getItem(STORAGE_KEYS.SINGLE_ASPECT_RATIO) as any) || '1:1';
  });
  const [singleNumImages, setSingleNumImages] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SINGLE_NUM_IMAGES);
    return saved ? parseInt(saved, 10) : 2;
  });
  const [showSingleSettings, setShowSingleSettings] = useState<boolean>(false);
  const [isGeneratingSingle, setIsGeneratingSingle] = useState<boolean>(false);
  const [generatingStep, setGeneratingStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const singleTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Gallery item enhanced prompt expansion & Google Drive modal
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);
  const [driveModalItem, setDriveModalItem] = useState<GalleryItem | null>(null);
  const [driveFolderId, setDriveFolderId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.DRIVE_FOLDER_ID) || '';
  });

  // Background Theme Sense (Used by Daily mode)
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.SELECTED_CATEGORY) || 'auto';
  });

  // Logo & Branding Settings (Used by Daily mode)
  const [logoConfig, setLogoConfig] = useState<LogoConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LOGO_CONFIG);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      enabled: true,
      type: 'preset',
      imageBase64: '',
      presetId: 'gnzee_badge',
      text: 'GNZEE MARKET',
      position: 'top_center',
    };
  });
  const [isLogoPanelOpen, setIsLogoPanelOpen] = useState<boolean>(true);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);

  // Multiple / Daily State
  const [imagesPerDay, setImagesPerDay] = useState<number>(2); // 1, 2, 3, 5 (default 2)
  const [daysCount, setDaysCount] = useState<number>(10); // 1, 5, 10, 15, 30 (default 10)
  const [dailyTime, setDailyTime] = useState<string>('08:00'); // 08:00 AM default
  const [dailyPrompt, setDailyPrompt] = useState<string>(() => {
    return (
      localStorage.getItem(STORAGE_KEYS.DAILY_PROMPT) ||
      'روزانہ مارکیٹنگ اور موٹیویشنل اقوال، کامیابی، اور مثبت سوچ'
    );
  });
  const [dailyRefImage, setDailyRefImage] = useState<string>('');
  const [isStartingSchedule, setIsStartingSchedule] = useState<boolean>(false);

  // Active Schedule Status
  const [activeSchedule, setActiveSchedule] = useState<ActiveSchedule | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_SCHEDULE);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Gallery (Saved images with Download & Delete, limited to last 10)
  const [gallery, setGallery] = useState<GalleryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.GALLERY);
      return saved ? JSON.parse(saved).slice(0, 10) : [];
    } catch {
      return [];
    }
  });

  const [notification, setNotification] = useState<string | null>(null);
  const dailyFileInputRef = useRef<HTMLInputElement | null>(null);

  // Save prompts & settings to localStorage & Sync with Server
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SINGLE_PROMPT, singlePrompt);
  }, [singlePrompt]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SINGLE_ASPECT_RATIO, singleAspectRatio);
  }, [singleAspectRatio]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SINGLE_NUM_IMAGES, String(singleNumImages));
  }, [singleNumImages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DAILY_PROMPT, dailyPrompt);
  }, [dailyPrompt]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SELECTED_CATEGORY, selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LOGO_CONFIG, JSON.stringify(logoConfig));
  }, [logoConfig]);

  useEffect(() => {
    try {
      // Keep strictly the last 10 generated images in history
      localStorage.setItem(STORAGE_KEYS.GALLERY, JSON.stringify(gallery.slice(0, 10)));
    } catch {
      // storage limit safety
    }
  }, [gallery]);

  useEffect(() => {
    if (activeSchedule) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SCHEDULE, JSON.stringify(activeSchedule));
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SCHEDULE);
    }
  }, [activeSchedule]);

  // Sync with Server Gallery & Server Scheduler on mount
  useEffect(() => {
    fetch('/api/gallery')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.gallery) && data.gallery.length > 0) {
          setGallery((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newServerItems = data.gallery.filter((g: any) => !existingIds.has(g.id));
            return [...newServerItems, ...prev].slice(0, 10);
          });
        }
      })
      .catch(() => {});

    fetch('/api/schedule/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.schedule) {
          setActiveSchedule(data.schedule);
        }
      })
      .catch(() => {});
  }, []);

  // Helper to show notification banner
  const showNotice = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4500);
  };

  // Helper to get effective brand name for backend (Daily mode)
  const getEffectiveBrandName = () => {
    if (!logoConfig.enabled) return '';
    if (logoConfig.type === 'preset' && logoConfig.presetId === 'gnzee_badge') return 'GNZEE MARKET';
    if (logoConfig.type === 'text' && logoConfig.text) return logoConfig.text;
    return '';
  };

  // Auto-grow textarea handler
  const handleSinglePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSinglePrompt(e.target.value);
    if (singleTextareaRef.current) {
      singleTextareaRef.current.style.height = 'auto';
      singleTextareaRef.current.style.height = `${Math.max(120, singleTextareaRef.current.scrollHeight)}px`;
    }
  };

  // Enter to generate (Shift+Enter for newline)
  const handleSingleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGeneratingSingle && singlePrompt.trim()) {
        handleGenerateSingle();
      }
    }
  };

  // Google Drive formatted file name helper (YYYY-MM-DD_topic_1.png)
  const getDriveFormattedFileName = (item: GalleryItem, index = 1) => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const cleanTopic = (item.title || item.originalPrompt || 'daily_image')
      .replace(/[\s\W]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 25);
    return `${dateStr}_${cleanTopic || 'topic'}_${index}.png`;
  };

  const handleSaveToDrive = (item: GalleryItem) => {
    const fileName = getDriveFormattedFileName(item);
    handleDownload(item.dataUrl, fileName.replace(/\.png$/, ''));
    const folder = driveFolderId.trim();
    const driveUrl = folder
      ? `https://drive.google.com/drive/folders/${folder}`
      : 'https://drive.google.com/drive/u/0/my-drive';
    window.open(driveUrl, '_blank', 'noopener,noreferrer');
    showNotice(`فائل "${fileName}" محفوظ ہو گئی اور گوگل ڈرائیو کھل گئی!`);
    setDriveModalItem(null);
  };

  // --------------------------------------------------------------------------
  // 1. SINGLE IMAGE GENERATION (Zero Friction, Pure Prompt Driven, Default 2 images)
  // --------------------------------------------------------------------------
  const handleGenerateSingle = async (customPrompt?: string) => {
    const promptText = (typeof customPrompt === 'string' ? customPrompt : singlePrompt).trim();
    if (!promptText) return;

    setIsGeneratingSingle(true);
    setErrorMessage(null);

    try {
      const count = Math.max(1, Math.min(singleNumImages || 2, 4));
      const prevQuotes = gallery.slice(0, 10).map((g) => g.quote);
      const generatedList: GalleryItem[] = [];

      for (let i = 1; i <= count; i++) {
        setGeneratingStep(count > 1 ? `تصویر ${i} از ${count} تیار ہو رہی ہے...` : 'تصویر تیار ہو رہی ہے...');

        const res = await fetch('/api/generate-simple-image-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
            previousMessages: [...prevQuotes, ...generatedList.map((g) => g.quote)],
            dayNumber: 1,
            imageNumber: i,
            isDaily: false,
            requestedAspectRatio: singleAspectRatio,
            requestedNumImages: count,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `سرور سے جواب موصول نہیں ہوا (${res.status})`);
        }

        const data = await res.json();
        const pkt = getPakistanTime();

        // Apply logo ONLY if user explicitly asked for logo/brand in prompt
        let posterLogoConfig: LogoConfig | undefined = undefined;
        if (data.hasLogo) {
          posterLogoConfig = {
            enabled: true,
            type: data.brandName && data.brandName.toLowerCase().includes('gnzee') ? 'preset' : 'text',
            presetId: 'gnzee_badge',
            imageBase64: '',
            text: data.brandName || 'GNZEE MARKET',
            position: data.logoPosition || 'top_center',
          };
        }

        const effectiveAspect = (data.aspectRatio as '1:1' | '9:16' | '16:9') || singleAspectRatio;

        const dataUrl = await renderSimplePoster({
          headline: data.headline || '',
          quote: data.quote,
          brandName: data.hasLogo ? data.brandName : '',
          backgroundUrl: data.visualUrl,
          colorPalette: data.colorPalette,
          daySlotTag: `${pkt.dateStr} • ${pkt.timeStr}`,
          logoConfig: posterLogoConfig,
          aspectRatio: effectiveAspect,
        });

        if (dataUrl) {
          const newItem: GalleryItem = {
            id: `single-${Date.now()}-${i}`,
            title: data.headline || data.quote.slice(0, 35) + (data.quote.length > 35 ? '...' : ''),
            quote: data.quote,
            dataUrl,
            rawVisualUrl: data.visualUrl,
            engineUsed: data.engineUsed,
            createdAtTime: pkt.timeStr,
            createdDateStr: pkt.dateStr,
            isDaily: false,
            enhancedPrompt: data.visualBrief || data.visualPrompt || '',
            aspectRatio: effectiveAspect,
            visualCategory: data.visualCategory,
            originalPrompt: promptText,
          };

          generatedList.push(newItem);

          // Sync with server gallery
          fetch('/api/gallery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newItem),
          }).catch(() => {});
        }
      }

      if (generatedList.length > 0) {
        // Keep strictly last 10 generated images in history
        setGallery((prev) => [...generatedList, ...prev].slice(0, 10));

        // Auto-push newly generated items into Social Media Automation Hub Queue!
        const socialItems = generatedList.map((item, idx) => {
          const cleanTitle = (item.title || item.quote || 'Daily Motivational Post').slice(0, 40);
          return {
            id: `studio-${item.id}`,
            fileId: `drive-sync-${item.id}`,
            fileName: `${new Date().toISOString().slice(0, 10)}_${cleanTitle.replace(/\s+/g, '_')}.png`,
            driveUrl: item.dataUrl || item.rawVisualUrl || '',
            contentType: 'image',
            caption: item.quote ? `✨ ${item.quote}` : `✨ ${cleanTitle}`,
            hashtags: ['#GNZEEMarket', '#DailyWisdom', '#Pakistan', '#Trending', '#Motivation'],
            targetPlatform: idx % 2 === 0 ? 'facebook' : 'tiktok',
            scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            scheduledTime: idx % 2 === 0 ? '08:00 AM' : '10:00 AM',
            status: 'READY',
            approvedByUser: false,
          };
        });

        fetch('/api/social/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: socialItems }),
        }).catch((e) => console.warn('Could not auto-push to social queue:', e));

        showNotice(
          `✨ ${generatedList.length} ${generatedList.length > 1 ? 'تصاویر' : 'تصویر'} تیار ہو کر گیلری اور Social Media Automation Hub دونوں میں شامل ہو گئی!`
        );
      }
    } catch (err: any) {
      console.error('Error generating single image:', err);
      const errMsg = err?.message || 'تصویر بنانے میں رکاوٹ پیش آئی۔ براہِ کرم دوبارہ کوشش کریں۔';
      setErrorMessage(errMsg);
      showNotice(errMsg);
    } finally {
      setIsGeneratingSingle(false);
      setGeneratingStep('');
    }
  };

  const handleRegenerate = (item: GalleryItem) => {
    const promptText = item.originalPrompt || item.title || item.quote;
    handleGenerateSingle(promptText);
  };

  const handlePushToSocialQueue = async (item: GalleryItem) => {
    try {
      const cleanTitle = (item.title || item.quote || 'Daily Image').slice(0, 40);
      const res = await fetch('/api/social/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              id: `studio-${item.id}`,
              fileId: `drive-sync-${item.id}`,
              fileName: `${new Date().toISOString().slice(0, 10)}_${cleanTitle.replace(/\s+/g, '_')}.png`,
              driveUrl: item.dataUrl || item.rawVisualUrl || '',
              contentType: 'image',
              caption: item.quote ? `✨ ${item.quote}` : `✨ ${cleanTitle}`,
              hashtags: ['#GNZEEMarket', '#DailyWisdom', '#Pakistan', '#Trending'],
              targetPlatform: 'facebook',
              scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
              scheduledTime: '08:00 AM',
              status: 'READY',
              approvedByUser: false,
            },
          ],
        }),
      });
      if (res.ok) {
        showNotice('🚀 تصویر کامیابی سے سوشل میڈیا Automation Hub کیو میں شامل ہو گئی!');
      } else {
        showNotice('کیو میں شامل کرنے میں مسئلہ پیش آیا۔');
      }
    } catch {
      showNotice('کنکشن خرابی کی وجہ سے کیو میں شامل نہ ہو سکی۔');
    }
  };

  // --------------------------------------------------------------------------
  // 2. DAILY SCHEDULE GENERATION (Two-Stage Architecture with Semantic Category & Logo)
  // --------------------------------------------------------------------------
  const generateBatchForDay = async (
    dayNum: number,
    count: number,
    promptText: string,
    refImg: string,
    timeLabel: string
  ): Promise<GalleryItem[]> => {
    const prevQuotes = gallery.slice(0, 15).map((g) => g.quote);
    const newItems: GalleryItem[] = [];
    const pkt = getPakistanTime();

    for (let imgIdx = 1; imgIdx <= count; imgIdx++) {
      try {
        const res = await fetch('/api/generate-simple-image-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
            referenceImage: refImg,
            previousMessages: [...prevQuotes, ...newItems.map((n) => n.quote)],
            dayNumber: dayNum,
            imageNumber: imgIdx,
            isDaily: true,
            visualCategory: selectedCategory,
            brandName: getEffectiveBrandName(),
          }),
        });

        const data = await res.json();

        const dataUrl = await renderSimplePoster({
          headline: data.headline,
          quote: data.quote,
          brandName: data.brandName,
          referenceImageBase64: refImg,
          backgroundUrl: data.visualUrl,
          colorPalette: data.colorPalette,
          daySlotTag: `DAY ${dayNum} • ${timeLabel}`,
          logoConfig: logoConfig,
        });

        if (dataUrl) {
          const item: GalleryItem = {
            id: `daily-d${dayNum}-i${imgIdx}-${Date.now()}`,
            title: data.headline || data.quote.slice(0, 35),
            quote: data.quote,
            dataUrl,
            rawVisualUrl: data.visualUrl,
            engineUsed: data.engineUsed,
            createdAtTime: timeLabel,
            createdDateStr: pkt.dateStr,
            dayLabel: `Day ${dayNum}`,
            scheduledTime: timeLabel,
            isDaily: true,
          };
          newItems.push(item);

          // Sync to server gallery
          fetch('/api/gallery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          }).catch(() => {});

          // Auto-sync daily item to Social Media Automation Hub Queue
          fetch('/api/social/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: [
                {
                  id: `studio-daily-${item.id}`,
                  fileId: `drive-daily-${item.id}`,
                  fileName: `${new Date().toISOString().slice(0, 10)}_Day${dayNum}_Post${imgIdx}.png`,
                  driveUrl: item.dataUrl || item.rawVisualUrl || '',
                  contentType: 'image',
                  caption: item.quote ? `✨ ${item.quote}` : `✨ Day ${dayNum} خاص پیغام`,
                  hashtags: ['#GNZEEMarket', '#DailyWisdom', '#Pakistan', '#Motivation'],
                  targetPlatform: imgIdx % 2 === 0 ? 'tiktok' : 'facebook',
                  scheduledDate: new Date(Date.now() + dayNum * 86400000).toISOString().slice(0, 10),
                  scheduledTime: timeLabel || '08:00 AM',
                  status: 'READY',
                  approvedByUser: false,
                },
              ],
            }),
          }).catch(() => {});
        }
      } catch (e) {
        console.warn(`Error generating day ${dayNum} img ${imgIdx}:`, e);
      }
    }

    return newItems;
  };

  const handleStartSchedule = async () => {
    setIsStartingSchedule(true);
    const pkt = getPakistanTime();
    const formattedTime = formatTo12Hour(dailyTime);
    const total = daysCount * imagesPerDay;

    try {
      // 1. Start Server-Side Schedule (runs 24/7 on backend even when app is closed)
      await fetch('/api/schedule/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagesPerDay,
          daysCount,
          scheduledTime: dailyTime,
          prompt: dailyPrompt,
          referenceImage: dailyRefImage,
        }),
      });

      // 2. Generate Day 1 immediately so user has fresh images in the gallery right away
      const day1Items = await generateBatchForDay(
        1,
        imagesPerDay,
        dailyPrompt,
        dailyRefImage,
        formattedTime
      );

      if (day1Items.length > 0) {
        setGallery((prev) => [...day1Items, ...prev]);
      }

      const newSchedule: ActiveSchedule = {
        id: `schedule-${Date.now()}`,
        imagesPerDay,
        daysCount,
        scheduledTime: dailyTime,
        prompt: dailyPrompt,
        referenceImage: dailyRefImage,
        startedAtDate: new Date().toISOString(),
        lastGeneratedDay: 1,
        totalQuota: total,
        isActive: true,
      };

      setActiveSchedule(newSchedule);
      showNotice(
        `📅 Daily Schedule فعال ہو گیا! Day 1 کی ${day1Items.length} تصاویر گیلری میں شامل کر دی گئی ہیں۔`
      );
    } catch (err) {
      console.error('Error starting schedule:', err);
      showNotice('شیڈول شروع کرنے میں مسئلہ پیش آئی۔ دوبارہ کوشش کریں۔');
    } finally {
      setIsStartingSchedule(false);
    }
  };

  const handleStopSchedule = async () => {
    setActiveSchedule(null);
    try {
      await fetch('/api/schedule/stop', { method: 'POST' });
    } catch (e) {
      // ignore
    }
    showNotice('⏹ Daily Schedule بند کر دیا گیا ہے۔');
  };

  // --------------------------------------------------------------------------
  // 3. BACKGROUND SCHEDULE AUTOMATION (PKT Check)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!activeSchedule || !activeSchedule.isActive) return;

    const checkInterval = setInterval(async () => {
      const pkt = getPakistanTime();
      const [targetH, targetM] = activeSchedule.scheduledTime.split(':').map((s) => parseInt(s, 10));

      // Calculate days elapsed since schedule started
      const started = new Date(activeSchedule.startedAtDate);
      const now = new Date();
      const diffMs = now.getTime() - started.getTime();
      const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
      const currentExpectedDay = Math.min(activeSchedule.daysCount, Math.max(1, daysElapsed));

      // Check if time has passed for the next day
      const isPastTargetTime =
        pkt.hours > targetH || (pkt.hours === targetH && pkt.minutes >= targetM);

      if (currentExpectedDay > activeSchedule.lastGeneratedDay && isPastTargetTime) {
        const nextDay = activeSchedule.lastGeneratedDay + 1;
        const formattedTime = formatTo12Hour(activeSchedule.scheduledTime);

        const newItems = await generateBatchForDay(
          nextDay,
          activeSchedule.imagesPerDay,
          activeSchedule.prompt,
          activeSchedule.referenceImage,
          formattedTime
        );

        if (newItems.length > 0) {
          setGallery((prev) => [...newItems, ...prev]);
          setActiveSchedule((prev) => (prev ? { ...prev, lastGeneratedDay: nextDay } : null));
          showNotice(`📅 Day ${nextDay} کی نئی تصاویر خودکار طور پر گیلری میں شامل ہو گئی ہیں!`);
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(checkInterval);
  }, [activeSchedule, gallery]);

  // --------------------------------------------------------------------------
  // 4. GALLERY ACTIONS (محفوظ کریں & حذف کریں)
  // --------------------------------------------------------------------------
  const handleDownload = (dataUrl: string, title: string) => {
    const cleanName = title.trim().replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g, '_').slice(0, 30);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${cleanName || 'daily-image'}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = (id: string) => {
    setGallery((prev) => prev.filter((item) => item.id !== id));
  };

  const calculatedTotal = daysCount * imagesPerDay;
  const formattedDisplayTime = formatTo12Hour(dailyTime);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Notification Toast */}
      {notification && (
        <div className="p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm font-urdu flex items-center justify-between gap-3 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs text-emerald-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 100% Free Badge Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-urdu font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            100% مفت اور لامحدود (Free & Unlimited)
          </span>
        </div>
        <span className="text-xs text-slate-400 font-urdu">
          کسی پیڈ کی یا کریڈٹ کارڈ کی ضرورت نہیں
        </span>
      </div>

      {/* Social Media Automation Bridge Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-sky-500/10 border border-amber-500/30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-bold text-white font-urdu flex items-center gap-2">
              <span>🚀 سوشل میڈیا آٹومیشن خودکار ترسیل آن ہے</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                Auto-Sync ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-urdu mt-0.5">
              یہاں تیار ہونے والی تمام تصاویر خود بخود سوشل میڈیا Hub کے Ready Queue میں پہنچ جاتی ہیں تاکہ 2+2 شیڈول اور بفر سے خودکار شائع ہو سکیں۔
            </p>
          </div>
        </div>

        {onNavigateToSocial && (
          <button
            type="button"
            onClick={onNavigateToSocial}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-urdu font-bold flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 cursor-pointer transition-all shrink-0"
          >
            <span>🚀 Social Media Hub ڈیش بورڈ کھولیں</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* =====================================================================
          1. TWO BASIC MODES SWITCHER (Single Image vs Multiple / Daily)
      ===================================================================== */}
      <div className="flex items-center justify-center p-1.5 bg-slate-950 border border-slate-800 rounded-2xl max-w-md mx-auto shadow-lg">
        <button
          type="button"
          onClick={() => setActiveSubMode('single')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
            activeSubMode === 'single'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Single Image</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubMode('daily')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
            activeSubMode === 'daily'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Multiple / Daily</span>
        </button>
      </div>

      {/* =====================================================================
          2. ACTIVE SCHEDULE STATUS BANNER (Shown if schedule is running)
      ===================================================================== */}
      {activeSchedule && activeSchedule.isActive && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="space-y-1 font-urdu">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Daily Schedule فعال ہے</span>
            </div>
            <div className="text-xs text-slate-300 flex items-center gap-2 flex-wrap font-mono tabular-nums">
              <span>روزانہ: {activeSchedule.imagesPerDay} تصاویر</span>
              <span>&bull;</span>
              <span>مدت: {activeSchedule.daysCount} دن</span>
              <span>&bull;</span>
              <span>وقت: {formatTo12Hour(activeSchedule.scheduledTime)} (PKT)</span>
              <span>&bull;</span>
              <span>کل تصاویر: {activeSchedule.totalQuota}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStopSchedule}
            className="px-4 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/70 text-red-300 border border-red-800/40 text-xs font-urdu font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
            <span>⏹ Schedule بند کریں</span>
          </button>
        </div>
      )}

      {/* =====================================================================
          3. SINGLE IMAGE MODE (Pure Minimalist Prompt-Driven)
      ===================================================================== */}
      {activeSubMode === 'single' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl">
          {/* Error Message Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-800/60 text-red-200 text-xs sm:text-sm font-urdu flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2">
                <X className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-red-400 hover:text-white text-xs cursor-pointer"
              >
                بند کریں
              </button>
            </div>
          )}

          {/* Prompt Header & Collapsed Settings Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <label className="text-xs sm:text-sm font-bold text-white font-urdu">
                تصویر کے بارے میں پرامپٹ لکھیں (Enter دبائیں یا بٹن دبائیں):
              </label>
            </div>

            {/* Tiny Collapsed Settings Icon (Hidden by default) */}
            <button
              type="button"
              onClick={() => setShowSingleSettings((prev) => !prev)}
              className={`p-2 rounded-xl border text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                showSingleSettings
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
              title="Settings (Aspect Ratio & Number of Images)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="text-[11px] font-mono hidden sm:inline">{singleAspectRatio} • {singleNumImages} imgs</span>
            </button>
          </div>

          {/* Optional Collapsed Settings Panel (Aspect Ratio & Count) */}
          {showSingleSettings && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Aspect Ratio */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-300 font-urdu block">
                    سائز (Aspect Ratio):
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(['1:1', '9:16', '16:9'] as const).map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setSingleAspectRatio(ratio)}
                        className={`py-1.5 px-3 rounded-lg text-xs font-mono font-bold cursor-pointer transition-all border ${
                          singleAspectRatio === ratio
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Number of Images (Default 2) */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-300 font-urdu block">
                    تصاویر کی تعداد (Images Count):
                  </span>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSingleNumImages(num)}
                        className={`py-1.5 px-3 rounded-lg text-xs font-mono font-bold cursor-pointer transition-all border ${
                          singleNumImages === num
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {num} {num === 2 ? '(Default)' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Large Multi-line Auto-Growing Prompt Box */}
          <div className="relative">
            <textarea
              ref={singleTextareaRef}
              rows={4}
              dir="auto"
              value={singlePrompt}
              onChange={handleSinglePromptChange}
              onKeyDown={handleSingleKeyDown}
              placeholder="یہاں لکھیں کیسی تصویر چاہیے... (مثلاً: والدین کی محبت اور دعا، یا عقاب کی بلند پروازی، یا 9:16 میں موٹیویشنل پوسٹ جس پر GNZEE MARKET لوگو اوپر درمیان میں ہو)...&#10;Enter دبائیں تو فوری تصویر بنے گی • Shift+Enter نئی سطر کے لیے"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm sm:text-base text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 leading-relaxed transition-colors min-h-[120px] resize-y"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 px-1">
              <span>Enter دبانے سے خودبخود تصویر بننا شروع ہو جائے گی</span>
              <span className="font-mono">{singlePrompt.trim().length} حروف</span>
            </div>
          </div>

          {/* Action Button: ✨ تصویر تیار کریں */}
          <button
            type="button"
            onClick={() => handleGenerateSingle()}
            disabled={isGeneratingSingle || !singlePrompt.trim()}
            className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm sm:text-base font-urdu flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg active:scale-[0.99] ${
              isGeneratingSingle || !singlePrompt.trim()
                ? 'bg-amber-500/50 text-slate-900/60 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
            }`}
          >
            {isGeneratingSingle ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{generatingStep || 'تصویر تیار ہو رہی ہے...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>✨ تصویر تیار کریں (Generate)</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* =====================================================================
          4. MULTIPLE / DAILY MODE (Includes Logo & Branding, 30-day plan, Schedule)
      ===================================================================== */}
      {activeSubMode === 'daily' && (
        <div className="space-y-5">
          {/* Logo & Branding Studio Card (Daily Mode Exclusive) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl transition-all">
            {/* Card Header with Toggle */}
            <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Crown className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-urdu flex items-center gap-2">
                    <span>خوبصورت لوگو اور برانڈنگ (Logo & Branding)</span>
                    {logoConfig.enabled && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        فعال (Active)
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 font-urdu">
                    ڈیلی پوسٹرز پر اپنا کسٹم لوگو، شاہی مونوگرام، یا برانڈ نام لگائیں
                  </p>
                </div>
              </div>

              {/* Toggle Switch & Collapse */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLogoConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-urdu font-bold transition-all cursor-pointer ${
                    logoConfig.enabled
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {logoConfig.enabled ? '✓ لوگو فعال ہے' : 'لوگو بند ہے'}
                </button>

                <button
                  type="button"
                  onClick={() => setIsLogoPanelOpen((prev) => !prev)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  {isLogoPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Body (when open and enabled) */}
            {isLogoPanelOpen && logoConfig.enabled && (
              <div className="p-4 sm:p-5 space-y-5">
                {/* 3 Type Switcher: Upload Logo vs Ready-Made Badge vs Brand Text */}
                <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-urdu">
                  <button
                    type="button"
                    onClick={() => setLogoConfig((prev) => ({ ...prev, type: 'upload' }))}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      logoConfig.type === 'upload'
                        ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>کسٹم لوگو تصویر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLogoConfig((prev) => ({ ...prev, type: 'preset' }))}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      logoConfig.type === 'preset'
                        ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>شاہی لوگو بیجز</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLogoConfig((prev) => ({ ...prev, type: 'text' }))}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      logoConfig.type === 'text'
                        ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>برانڈ نام / ٹیکسٹ</span>
                  </button>
                </div>

                {/* Mode 1: Upload Custom Logo File */}
                {logoConfig.type === 'upload' && (
                  <div className="space-y-3 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <input
                      ref={logoFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            setLogoConfig((prev) => ({
                              ...prev,
                              imageBase64: String(reader.result || ''),
                            }));
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                    />

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {logoConfig.imageBase64 ? (
                          <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-amber-500/40 bg-slate-900 flex items-center justify-center p-2 shadow-inner">
                            <img
                              src={logoConfig.imageBase64}
                              alt="Custom Logo"
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-xl border border-dashed border-slate-700 bg-slate-900/60 flex flex-col items-center justify-center text-slate-500">
                            <Upload className="w-6 h-6 text-slate-400 mb-1" />
                            <span className="text-[10px] font-urdu">لوگو منتخب کریں</span>
                          </div>
                        )}

                        <div className="space-y-1 font-urdu">
                          <p className="text-xs text-slate-200 font-bold">
                            {logoConfig.imageBase64 ? 'لوگو تصویر کامیابی سے لوڈ ہو چکی ہے' : 'اپنی لوگو تصویر اپلوڈ فرمائیں'}
                          </p>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            شفاف پی این جی (Transparent PNG) لوگو بہترین نظر آتا ہے
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => logoFileInputRef.current?.click()}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs font-urdu flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{logoConfig.imageBase64 ? 'تبدیل کریں' : 'تصویر اپلوڈ کریں'}</span>
                        </button>

                        {logoConfig.imageBase64 && (
                          <button
                            type="button"
                            onClick={() => setLogoConfig((prev) => ({ ...prev, imageBase64: '' }))}
                            className="px-3 py-2 rounded-xl bg-red-950/60 hover:bg-red-900 text-red-300 text-xs font-urdu cursor-pointer transition-colors"
                          >
                            ہٹائیں
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Mode 2: Preset Ready-Made Badges */}
                {logoConfig.type === 'preset' && (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-300 font-urdu font-semibold">
                      پسندیدہ شاہی لوگو بیج منتخب کریں:
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {[
                        { id: 'royal_crest', icon: '👑', title: 'Royal Crest', subtitle: 'شاہی مونوگرام' },
                        { id: 'falcon_emblem', icon: '🦅', title: 'Falcon Emblem', subtitle: 'شاہین / عقاب لوگو' },
                        { id: 'gnzee_badge', icon: '✦', title: 'GNZEE MARKET', subtitle: 'آفیشل گولڈ بیج' },
                        { id: 'luxury_diamond', icon: '💎', title: 'Luxury Diamond', subtitle: 'لگژری ڈائمنڈ' },
                        { id: 'islamic_crescent', icon: '☪', title: 'نورِ حکمت', subtitle: 'ہلال و ستارہ لوگو' },
                        { id: 'inspiration_star', icon: '🌟', title: 'Daily Inspiration', subtitle: 'موٹیویشنل سٹار' },
                      ].map((b) => {
                        const isSelected = logoConfig.presetId === b.id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setLogoConfig((prev) => ({ ...prev, presetId: b.id as any }))}
                            className={`p-3 rounded-xl border text-right font-urdu transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                              isSelected
                                ? 'bg-amber-500/15 border-amber-500 text-amber-200 shadow-md shadow-amber-500/10'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xl">{b.icon}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white font-sans">{b.title}</div>
                              <div className="text-[11px] text-slate-400">{b.subtitle}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mode 3: Custom Text / Channel Name */}
                {logoConfig.type === 'text' && (
                  <div className="space-y-2 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <label className="text-xs font-bold text-slate-300 font-urdu block text-right">
                      اپنا نام یا برانڈ نام لکھیں:
                    </label>
                    <input
                      type="text"
                      dir="rtl"
                      value={logoConfig.text}
                      onChange={(e) => setLogoConfig((prev) => ({ ...prev, text: e.target.value }))}
                      placeholder="مثلاً: روزانہ موٹیویشن، علی خان پروڈکشنز، وغیرہ..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-urdu focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {/* Logo Position Selector */}
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <label className="text-xs font-bold text-slate-300 font-urdu block text-right">
                    لوگو کی پوزیشن (Logo Position):
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs font-urdu">
                    {[
                      { id: 'top_center', label: 'اوپر درمیان', sub: '(شاہانہ)' },
                      { id: 'top_right', label: 'اوپر دائیں', sub: '' },
                      { id: 'top_left', label: 'اوپر بائیں', sub: '' },
                      { id: 'bottom_center', label: 'نیچے درمیان', sub: '' },
                      { id: 'bottom_right', label: 'نیچے دائیں', sub: '' },
                    ].map((pos) => {
                      const isPosSelected = logoConfig.position === pos.id;
                      return (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => setLogoConfig((prev) => ({ ...prev, position: pos.id as any }))}
                          className={`py-2 px-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                            isPosSelected
                              ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold shadow-md shadow-amber-500/20'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                          }`}
                        >
                          <div>{pos.label}</div>
                          {pos.sub && <div className="text-[10px] opacity-80">{pos.sub}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Daily Schedule Plan Form */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xl">
          {/* Options Grid: Images per day & Days count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. "روزانہ کتنی تصاویر؟" (1, 2, 3, 5) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-white font-urdu block text-right">
                روزانہ کتنی تصاویر؟
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setImagesPerDay(num)}
                    className={`py-2 rounded-xl text-xs font-bold font-mono cursor-pointer transition-all border ${
                      imagesPerDay === num
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. "کتنے دن؟" (1, 5, 10, 15, 30) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-white font-urdu block text-right">
                کتنے دن؟
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 5, 10, 15, 30].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setDaysCount(num)}
                    className={`py-2 rounded-xl text-xs font-bold font-mono cursor-pointer transition-all border ${
                      daysCount === num
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. "روزانہ کا وقت" (Pakistan Standard Time PKT) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-urdu">
              <span className="text-slate-400 font-mono">
                پاکستان کا وقت: {formatTo12Hour(dailyTime)} (PKT UTC+05:00)
              </span>
              <label className="font-bold text-white">روزانہ کا وقت:</label>
            </div>
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <input
                type="time"
                value={dailyTime}
                onChange={(e) => setDailyTime(e.target.value)}
                className="bg-transparent text-sm text-slate-100 font-mono focus:outline-none w-full"
              />
            </div>
          </div>

          {/* 4. "بنیادی ہدایات" Prompt Box */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-white font-urdu block text-right">
              بنیادی ہدایات / موضوع:
            </label>
            <textarea
              rows={4}
              dir="rtl"
              value={dailyPrompt}
              onChange={(e) => setDailyPrompt(e.target.value)}
              placeholder="روزانہ تصاویر کے لیے عمومی موضوع یا ہدایات لکھیں (مثلاً: روزانہ صبح کے لیے مختلف موٹیویشنل اقوال، کامیابی، اور مثبت سوچ)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 font-urdu placeholder:text-slate-600 focus:outline-none focus:border-amber-500 leading-relaxed resize-y"
            />
          </div>

          {/* 4.5. Background Visual Theme Selector for Daily */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-urdu">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-amber-400" />
                بیک گراؤنڈ تصویر کا انتخاب (Background Theme Sense):
              </span>
              <span className="text-[11px] text-amber-400/90 font-mono">
                {selectedCategory === 'auto' ? 'AI خود سمجھے گا' : 'منتخب کردہ تھیم'}
              </span>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 font-urdu focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              {VISUAL_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id} className="bg-slate-950 text-white font-urdu">
                  {cat.label} — {cat.desc}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Optional Reference Image */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-urdu">
              <span className="text-slate-400">حوالہ جاتی تصویر شامل کریں (اختیاری):</span>
              {dailyRefImage && (
                <button
                  type="button"
                  onClick={() => setDailyRefImage('')}
                  className="text-red-400 hover:underline cursor-pointer"
                >
                  تصویر ہٹائیں
                </button>
              )}
            </div>

            <input
              ref={dailyFileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => setDailyRefImage(String(reader.result || ''));
                  reader.readAsDataURL(file);
                }
              }}
              className="hidden"
            />

            {dailyRefImage ? (
              <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
                <img
                  src={dailyRefImage}
                  alt="Reference"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => dailyFileInputRef.current?.click()}
                className="py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-dashed border-slate-700 hover:border-amber-500/50 text-xs font-urdu flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4 text-amber-400" />
                <span>حوالہ جاتی تصویر منتخب کریں</span>
              </button>
            )}
          </div>

          {/* 6. System Calculation Display */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1 font-urdu text-right">
            <div className="text-xs text-slate-400">
              روزانہ تصاویر: <span className="text-amber-400 font-mono font-bold">{imagesPerDay}</span> |{' '}
              مدت: <span className="text-amber-400 font-mono font-bold">{daysCount} دن</span> |{' '}
              روزانہ وقت: <span className="text-amber-400 font-mono font-bold">{formattedDisplayTime}</span> (پاکستان کا وقت)
            </div>
            <div className="text-sm font-bold text-white">
              کل تصاویر: <span className="text-amber-400 font-mono text-base">{calculatedTotal}</span>
            </div>
          </div>

          {/* 7. Action Button: 📅 Daily Schedule شروع کریں */}
          <button
            type="button"
            onClick={handleStartSchedule}
            disabled={isStartingSchedule}
            className="w-full py-3.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm sm:text-base font-urdu flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg active:scale-[0.99]"
          >
            {isStartingSchedule ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Daily Schedule شروع ہو رہا ہے...</span>
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                <span>📅 Daily Schedule شروع کریں</span>
              </>
            )}
          </button>
        </div>
      </div>
    )}

      {/* =====================================================================
          5. GALLERY (گیلری) — With Download, Regenerate, Save to Google Drive & Enhanced Prompt
      ===================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white font-urdu">Gallery (گیلری)</h3>
            <span className="text-xs text-slate-400 font-mono">({gallery.length} تصاویر • تاریخچہ)</span>
          </div>

          {gallery.length > 0 && (
            <button
              type="button"
              onClick={() => setGallery([])}
              className="text-xs text-slate-400 hover:text-red-400 font-urdu cursor-pointer transition-colors"
            >
              گیلری صاف کریں
            </button>
          )}
        </div>

        {gallery.length === 0 ? (
          <div className="text-center py-10 px-4 text-slate-400 space-y-4 bg-slate-950/60 rounded-xl border border-dashed border-slate-800">
            <ImageIcon className="w-10 h-10 mx-auto text-amber-500/60" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-white font-urdu">
                ابھی تک اس سیشن میں نئی تصویر نہیں بنائی گئی۔
              </p>
              <p className="text-xs text-slate-400 font-urdu max-w-md mx-auto">
                نیچے دیے گئے کسی بھی موضوع پر کلک کریں یا اوپر Prompt لکھ کر <strong>"تصویر تیار کریں"</strong> دبائیں۔ تصویر بنتے ہی خود بخود سوشل میڈیا Hub کے Ready Queue میں چلی جائے گی!
              </p>
            </div>

            {/* Quick Prompt Ideas */}
            <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
              {[
                'صبر، مستقل مزاجی اور محنت ہی کامیابی کی اصل چابی ہے',
                'شاہین کی طرح بلند پرواز رکھو، منزلیں خود قدم چومیں گی',
                'نیا دن نئی امید لے کر آتا ہے، اللہ پر بھروسہ رکھیں',
                'کامیاب انسان وہ ہے جو گر کر دوبارہ اٹھنا جانتا ہے',
              ].map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => {
                    setSinglePrompt(topic);
                    handleGenerateSingle(topic);
                  }}
                  disabled={isGeneratingSingle}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-800 hover:border-amber-500/40 text-xs font-urdu cursor-pointer transition-all active:scale-95 disabled:opacity-40"
                >
                  ⚡ {topic.slice(0, 30)}...
                </button>
              ))}
            </div>

            {onNavigateToSocial && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onNavigateToSocial}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/30 text-xs font-urdu font-bold cursor-pointer transition-colors"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  <span>یا پہلے سے تیار شدہ پوسٹس دیکھنے کے لیے "Social Media Automation Hub" کھولیں</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {gallery.map((img) => (
              <div
                key={img.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-3"
              >
                {/* Meta details: Day, Date, Time & Aspect Ratio */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-amber-400 font-bold">
                      {img.dayLabel ? `${img.dayLabel} • ` : ''}
                      {img.createdDateStr}
                    </span>
                    {img.aspectRatio && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-bold font-mono">
                        {img.aspectRatio}
                      </span>
                    )}
                  </div>
                  <span>{img.scheduledTime || img.createdAtTime}</span>
                </div>

                {/* Image Poster Preview */}
                <div
                  className={`relative w-full rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center ${
                    img.aspectRatio === '9:16'
                      ? 'aspect-[9/16] max-h-[440px]'
                      : img.aspectRatio === '16:9'
                      ? 'aspect-[16/9]'
                      : 'aspect-square'
                  }`}
                >
                  <img
                    src={img.dataUrl}
                    alt={img.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Show Enhanced Prompt Accordion (بہتر پرامپٹ دیکھیں) */}
                {img.enhancedPrompt && (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPromptId(expandedPromptId === img.id ? null : img.id)
                      }
                      className="text-xs text-amber-400 hover:text-amber-300 font-urdu flex items-center justify-between w-full py-1.5 px-2.5 rounded-lg bg-slate-900/90 border border-slate-800 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          {expandedPromptId === img.id
                            ? 'پرامپٹ چھپائیں'
                            : 'بہتر پرامپٹ دیکھیں (Show enhanced prompt)'}
                        </span>
                      </span>
                      {expandedPromptId === img.id ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {expandedPromptId === img.id && (
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1.5 animate-in fade-in">
                        <div className="font-bold text-amber-300 font-urdu text-[11px]">
                          ✨ AI کا تیار کردہ تفصیلی انگلش پرامپٹ:
                        </div>
                        <p className="text-[11px] leading-relaxed font-sans text-slate-300 select-all max-h-32 overflow-y-auto">
                          {img.enhancedPrompt}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions: Download, Regenerate, Save to Google Drive, Delete */}
                <div className="space-y-1.5 pt-1 border-t border-slate-900">
                  {/* Row 1: Download & Regenerate */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(img.dataUrl, img.title)}
                      className="py-2 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-urdu font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                      title="ڈاؤن لوڈ کریں"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>ڈاؤن لوڈ کریں</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRegenerate(img)}
                      disabled={isGeneratingSingle}
                      className="py-2 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-urdu font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                      title="اس پرامپٹ سے نئی تصویر بنائیں"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>دوبارہ بنائیں</span>
                    </button>
                  </div>

                  {/* Row 2: Save to Google Drive & Delete */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDriveModalItem(img)}
                      className="py-2 px-2 rounded-lg bg-sky-950/80 hover:bg-sky-900 text-sky-200 border border-sky-800/60 text-xs font-urdu font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      title="گوگل ڈرائیو میں محفوظ کریں"
                    >
                      <Save className="w-3.5 h-3.5 text-sky-400" />
                      <span>Google Drive</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(img.id)}
                      className="py-2 px-2 rounded-lg bg-slate-900 hover:bg-red-950 text-slate-400 hover:text-red-400 border border-slate-800 text-xs font-urdu flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف کریں</span>
                    </button>
                  </div>

                  {/* Row 3: Push to Social Media Automation Hub Queue */}
                  <button
                    type="button"
                    onClick={() => handlePushToSocialQueue(img)}
                    className="w-full py-1.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-urdu font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    title="سوشل میڈیا آٹومیشن کیو میں شامل کریں"
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    <span>🚀 Social Media Hub Queue میں بھیجیں</span>
                  </button>

                  {/* Optional Pure AI scene image */}
                  {img.rawVisualUrl && (
                    <button
                      type="button"
                      onClick={() => handleDownload(img.rawVisualUrl!, `${img.title}-ai-scene`)}
                      className="w-full py-1.5 px-3 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white text-[11px] font-urdu flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <ImageIcon className="w-3 h-3 text-amber-400" />
                      <span>خالص AI بیک گراؤنڈ ڈاؤن لوڈ کریں</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =====================================================================
          6. GOOGLE DRIVE SAVE MODAL
      ===================================================================== */}
      {driveModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                  <Save className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white font-urdu">Save to Google Drive</h3>
              </div>
              <button
                type="button"
                onClick={() => setDriveModalItem(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 font-urdu text-right">
              <p className="text-xs text-slate-300">
                تصویر خود بخود گوگل ڈرائیو نام کے مطابق تیار ہے (YYYY-MM-DD_topic_1.png):
              </p>

              {/* Standardized File Name */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-left font-mono text-xs text-amber-300 break-all">
                {getDriveFormattedFileName(driveModalItem)}
              </div>

              {/* Folder ID input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  Google Drive Folder ID (اختیاری):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={driveFolderId}
                  onChange={(e) => {
                    setDriveFolderId(e.target.value);
                    localStorage.setItem(STORAGE_KEYS.DRIVE_FOLDER_ID, e.target.value);
                  }}
                  placeholder="مثلاً: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptnyt"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
                <p className="text-[11px] text-slate-500">
                  اگر آپ کے پاس گوگل ڈرائیو کا مخصوص فولڈر آئی ڈی ہے تو یہاں پیسٹ کریں
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => handleSaveToDrive(driveModalItem)}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs font-urdu flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-md"
              >
                <Download className="w-4 h-4" />
                <span>محفوظ کریں اور Google Drive کھولیں</span>
              </button>
              <button
                type="button"
                onClick={() => setDriveModalItem(null)}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-urdu cursor-pointer transition-colors"
              >
                بند کریں
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
