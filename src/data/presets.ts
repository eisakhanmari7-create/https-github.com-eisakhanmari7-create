export const INITIAL_SAMPLE_SCRIPT = `✨ السلام علیکم! کیا آپ بھی اپنی شاپنگ کے لیے بہترین اور معیاری پراڈکٹس تلاش کر رہے ہیں؟
GNZEE Market لایا ہے آپ کے لیے سب سے شاندار ورائٹی اور رعایت!
ابھی اپنا آرڈر بک کریں اور بہترین سروس سے لطف اندوز ہوں۔`;

export interface PromptPreset {
  id: string;
  title: string;
  prompt: string;
  language: string;
  category?: string;
  icon?: string;
}

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'ecommerce_sale',
    title: '🛍️ پروڈکٹ سیل اشتہار',
    category: 'ecommerce',
    prompt: 'ایک پرجوش اور دلکش 30 سیکنڈ کا اردو پروڈکٹ سیل کمرشل اسکرپٹ لکھیں جس میں زبردست رعایت اور کال ٹو ایکشن ہو۔',
    language: 'urdu',
  },
  {
    id: 'brand_intro',
    title: '🏢 برانڈ تعارف',
    category: 'business',
    prompt: 'ایک بااعتماد اور پیشہ ورانہ برانڈ انٹروڈکشن اسکرپٹ تیار کریں جو گاہک کا اعتماد جیتے اور اہم خصوصیات اجاگر کرے۔',
    language: 'urdu',
  },
  {
    id: 'viral_hook',
    title: '⚡ وائرل سوشل میڈیا ہک',
    category: 'viral',
    prompt: 'ٹک ٹاک اور انسٹاگرام ریلز کے لیے پہلے 3 سیکنڈ کا انتہائی پرکشش ہک اور مختصر دلچسپ اسٹوری اسکرپٹ لکھیں۔',
    language: 'bilingual',
  },
  {
    id: 'customer_review',
    title: '⭐ کسٹمر ریویو / فیڈ بیک',
    category: 'social_proof',
    prompt: 'ایک مطمئن اور پرمسرت گاہک کا حقیقی ریویو اسکرپٹ لکھیں جو برانڈ کی ایمانداری اور بروقت ڈیلیوری کی تعریف کرے۔',
    language: 'urdu',
  },
  {
    id: 'english_commercial',
    title: '🎯 English Commercial',
    category: 'ecommerce',
    prompt: 'Write a high-converting, crisp 30-second commercial script for an innovative lifestyle brand with modern pacing.',
    language: 'english',
  },
];
