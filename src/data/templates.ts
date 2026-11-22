import { VideoTemplate } from '../types';

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: 'product-commercial',
    title: 'Product Commercial',
    titleUrdu: '🛍️ پروڈکٹ کمرشل (3 مناظر)',
    description: 'ہائی کوالٹی ای کامرس پروڈکٹ شوکیس اور سیلز کمرشل',
    category: 'ecommerce',
    sampleProduct: 'پریمیم لیدر والٹ اور کلاسک واچ کمبو',
    defaultTone: 'Energetic',
    sceneCount: 3,
    scenes: [
      {
        visualPrompt: 'High quality cinematic macro shot of a sleek luxury leather wallet on a wooden table with soft lighting.',
        cameraMovement: 'Slow zoom-in with smooth gimbal movement',
        voiceoverScript: 'اعلیٰ معیار اور کلاسک انداز کا بے مثال سنگم، جو آپ کی شخصیت کو چار چاند لگا دے۔',
        captionText: 'اعلیٰ کوالٹی اور پریمیم اسٹائل 🌟',
      },
      {
        visualPrompt: 'Close up view of the wallet being held, revealing stitching detail and texture in bright studio light.',
        cameraMovement: 'Subtle panning from left to right',
        voiceoverScript: 'خالص چمڑے سے تیار کردہ، پائیداری اور نفاست کی مکمل ضمانت۔',
        captionText: '100% خالص چمڑا اور پائیدار کاریگری ✨',
      },
      {
        visualPrompt: 'Hero layout displaying the wallet alongside packaging box and limited discount badge on marble surface.',
        cameraMovement: 'Smooth pull-back establishing shot with depth of field',
        voiceoverScript: 'آج ہی GNZEE Market پر اپنا آرڈر بک کریں اور خصوصی رعایت حاصل کریں۔',
        captionText: 'ابھی آرڈر کریں — محدود اسٹاک! 🛒',
      },
    ],
  },
  {
    id: 'viral-reel',
    title: 'Viral Social Reel',
    titleUrdu: '⚡ وائرل سوشل میڈیا ریل (2 مناظر)',
    description: 'ٹک ٹاک اور ریلز کے لیے تیز رفتار اور تجسس سے بھرپور ویڈیو',
    category: 'viral',
    sampleProduct: 'اسمارٹ الیکٹرانک گیجٹ',
    defaultTone: 'Friendly',
    sceneCount: 2,
    scenes: [
      {
        visualPrompt: 'Dynamic energetic close-up shot of a modern minimalist smart gadget turning on with futuristic LED glow.',
        cameraMovement: 'Fast push-in with dynamic angle',
        voiceoverScript: 'کیا آپ بھی روزانہ کی اس پریشانی سے تنگ ہیں؟ اب اس کا حل آ چکا ہے!',
        captionText: 'کیا آپ بھی اس سے پریشان ہیں؟ 🤔',
      },
      {
        visualPrompt: 'Hands demonstration showing seamless one-touch operation in a modern well lit kitchen setting.',
        cameraMovement: 'Top-down smooth rotational panning',
        voiceoverScript: 'صرف ایک کلک اور آپ کی زندگی آسان۔ آرڈر کے لیے بائیو میں دیے گئے لنک پر جائیں۔',
        captionText: 'زندگی ہوئی آسان — لنک بائیو میں ہے 📲',
      },
    ],
  },
];
