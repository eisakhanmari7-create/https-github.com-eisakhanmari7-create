import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI, Modality } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "50mb" }));

// Helper to initialize Gemini SDK
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please ensure your Gemini API key is set in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Helper to call Gemini with multi-model fallback cascade for resilient text generation
const RESILIENT_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
];

async function generateWithFallback(ai: GoogleGenAI, requestConfig: any): Promise<any> {
  let lastError: any = null;
  for (const model of RESILIENT_MODELS) {
    try {
      const response = await ai.models.generateContent({
        ...requestConfig,
        model,
      });
      if (response && response.text) {
        return response;
      }
    } catch (err: any) {
      console.warn(`Model ${model} unavailable (${err?.status || err?.message}), checking next...`);
      lastError = err;
      const msg = String(err?.message || '').toLowerCase();
      // If project has hit daily free tier request limit, break immediately to let fallback return fast
      if (
        msg.includes('daily limit') ||
        msg.includes('limit: 0') ||
        msg.includes('per day limit exceeded') ||
        msg.includes('retry in')
      ) {
        break;
      }
    }
  }
  throw lastError || new Error("All Gemini models are temporarily busy. Please retry in a moment.");
}

// Fallback rule-based parser if AI models are temporarily down during heavy demand
function localCustomPromptsParser(rawPromptsText: string, durationSeconds = 8, language = "urdu") {
  if (!rawPromptsText || !rawPromptsText.trim()) return [];

  // Check if text has sections like "Prompt 1:", "Scene 1:", "[1]", "1.", "پہلا منظر"
  const markerRegex = /(?:^|\n)(?:(?:Prompt|Scene|منظر|کلپ|ویڈیو|حصہ)\s*\d*\s*[:\-\.\)]|\[\d+\]|\d+[\.\-\)])\s*/i;

  let chunks: string[] = [];
  if (markerRegex.test(rawPromptsText)) {
    chunks = rawPromptsText
      .split(/(?:^|\n)(?:(?:Prompt|Scene|منظر|کلپ|ویڈیو|حصہ)\s*\d*\s*[:\-\.\)]|\[\d+\]|\d+[\.\-\)])\s*/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  } else {
    // Split by lines
    chunks = rawPromptsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  if (chunks.length === 0 && rawPromptsText.trim()) {
    chunks = [rawPromptsText.trim()];
  }

  const scenes: any[] = [];
  let sceneNum = 1;

  for (const chunk of chunks) {
    const cleanContent = chunk.replace(/^(prompt|scene|\d+|منظر|کلپ)\s*[:\-\.\)]\s*/i, "").trim();
    if (!cleanContent) continue;

    scenes.push({
      sceneNumber: sceneNum,
      durationSeconds,
      visualPrompt: `Cinematic commercial scene of: ${cleanContent}. Photorealistic, 8k resolution, dramatic cinematic lighting, smooth camera movement.`,
      cameraMovement: sceneNum % 2 === 0 ? "Slow cinematic push-in" : "Smooth drone tracking shot",
      voiceoverScript: cleanContent,
      captionText: cleanContent.slice(0, 35),
    });
    sceneNum++;
  }

  return scenes;
}

// Convert raw 16-bit PCM buffer to standard RIFF WAV format
function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  if (pcmBuffer.length >= 4 && pcmBuffer.toString("ascii", 0, 4) === "RIFF") {
    return pcmBuffer;
  }

  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  // RIFF chunk descriptor
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);

  // fmt sub-chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Helpers for quota and rate limit handling across Gemini endpoints
function extractRetryDelay(err: any): number {
  try {
    const raw = typeof err === "string" ? err : JSON.stringify(err?.message || err);
    // Match "retryDelay": "26s" or "26.3s" or retry after 26s
    const match = raw.match(/retry(?:Delay|_delay|(?:\s+after|\s+in))[:\s"]+(\d+(?:\.\d+)?)\s*s?/i);
    if (match && match[1]) {
      const parsed = parseFloat(match[1]);
      if (parsed > 0) return Math.ceil(parsed);
    }
  } catch {
    // fallback
  }
  return 30; // sensible default 30s
}

function isRateLimitOrQuotaError(err: any): boolean {
  const str = String(err?.message || err || "").toLowerCase();
  return (
    str.includes("429") ||
    str.includes("resource_exhausted") ||
    str.includes("quota") ||
    str.includes("rate limit") ||
    err?.status === 429
  );
}



// 1. Script Generator API using gemini-3.8-flash
app.post("/api/generate-script", async (req: Request, res: Response) => {
  try {
    const { prompt, language = "bilingual", tone = "engaging", targetDuration = "30s" } = req.body;

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "A prompt is required to generate a script." });
      return;
    }

    const ai = getGeminiClient();

    const systemInstruction = `You are a professional multilingual copywriter and voiceover scriptwriter specializing in Pakistani Urdu, Indian Hindi/Urdu, and English scripts.
Your task is to write high-impact, natural-sounding voiceover scripts ready for Text-to-Speech narration.
Guidelines:
1. Write for the ear, not just the eye: short sentences, rhythmic pauses, natural breathing spots, and catchy hooks.
2. If Urdu or Bilingual is requested:
   - When Urdu in Nastaliq/Arabic script is appropriate, provide clear authentic Urdu.
   - You may also provide Roman Urdu or bilingual sentences where appropriate if requested, but default to authentic Urdu script with clear phonetics for narration.
3. Keep the output clean: Return ONLY the script text itself ready to be spoken, without stage directions or brackets like [Music plays] unless specifically helpful for pauses (e.g. ellipses '...').
4. Match the requested tone (${tone}) and target duration (${targetDuration}).`;

    const promptMessage = `Create a voiceover script based on this request:
"${prompt}"

Language/Style requirements:
- Language: ${language}
- Tone: ${tone}
- Target length: ${targetDuration}

Make sure the opening line is a strong, catchy hook that grabs attention immediately.`;

    const response = await generateWithFallback(ai, {
      contents: promptMessage,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const script = response.text?.trim() || "";

    if (!script) {
      res.status(500).json({ error: "No script content generated by Gemini." });
      return;
    }

    res.json({
      success: true,
      script,
      language,
    });
  } catch (error: any) {
    console.error("Error generating script:", error);
    res.status(500).json({
      error: error?.message || "Failed to generate script with Gemini API.",
    });
  }
});

// 1.2 Adjust Script Length (Expand or Shorten to match target duration)
app.post("/api/adjust-script-length", async (req: Request, res: Response) => {
  try {
    const { script, targetDurationSeconds = 60, action = "expand", language = "urdu" } = req.body;

    if (!script || typeof script !== "string" || !script.trim()) {
      res.status(400).json({ error: "Script text is required to adjust length." });
      return;
    }

    const durationSec = Math.max(10, Math.min(600, Number(targetDurationSeconds) || 60));
    const isEnglish = String(language).toLowerCase().includes("eng");
    const wordsPerSec = isEnglish ? 2.7 : 2.2;
    const targetWords = Math.round(durationSec * wordsPerSec);

    const ai = getGeminiClient();

    const systemInstruction = `You are an expert multilingual voiceover script editor specializing in spoken pacing.
Your job is to ${action === "shorten" ? "shorten and condense" : "expand and elaborate"} the user's voiceover script so that it takes approximately ${durationSec} seconds to speak naturally (target: ~${targetWords} words total).
Target language: ${language}.
Pacing rules:
- Spoken rate: approximately ${wordsPerSec} words per second.
- For ${durationSec} seconds, output must contain around ${targetWords} words (±10%).
- Ensure natural breathing pauses, rhythmic phrasing, and strong retention of the core theme and tone.
- Do NOT output any labels, stage directions, or markdown headings. Return ONLY the spoken script text itself ready for audio narration.`;

    const promptMessage = `Please ${action} this voiceover script to match a target duration of ${durationSec} seconds (~${targetWords} words in ${language}):

"""
${script.trim()}
"""`;

    const response = await generateWithFallback(ai, {
      contents: promptMessage,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const adjustedScript = response.text?.trim() || "";

    if (!adjustedScript) {
      res.status(500).json({ error: "Gemini did not return an adjusted script." });
      return;
    }

    const wordCount = adjustedScript.split(/\s+/).filter(Boolean).length;
    const estimatedSeconds = Math.round(wordCount / wordsPerSec);

    res.json({
      success: true,
      script: adjustedScript,
      wordCount,
      estimatedSeconds,
      targetDurationSeconds: durationSec,
    });
  } catch (error: any) {
    console.error("Error adjusting script length:", error);
    const isQuota = isRateLimitOrQuotaError(error);
    const retryDelaySeconds = isQuota ? extractRetryDelay(error) : undefined;
    res.status(isQuota ? 429 : 500).json({
      success: false,
      error: error?.message || "Failed to adjust script length with Gemini API.",
      isQuotaError: isQuota,
      retryDelaySeconds,
    });
  }
});

// 1.5 Batch Scenes Generator (duration-aware scenes, prompts, camera angles, voiceover text, captions)
app.post("/api/generate-batch-scenes", async (req: Request, res: Response) => {
  try {
    const { topicPrompt, sceneCount = 4, durationSeconds = 8, language = "urdu", tone = "engaging" } = req.body;

    if (!topicPrompt || typeof topicPrompt !== "string") {
      res.status(400).json({ error: "A topic or prompt is required." });
      return;
    }

    const duration = Number(durationSeconds) || 8;
    const targetWords = Math.max(8, Math.round(duration * 2.2));
    const minWords = Math.max(6, Math.round(duration * 2.0));
    const maxWords = Math.round(duration * 2.5);

    const ai = getGeminiClient();

    const systemInstruction = `You are an expert AI Video Producer and Director specializing in creating scene-by-scene video production breakdowns for viral Reels, Shorts, and cinematic promos.
Each scene is calibrated for exactly ${duration} seconds of video.
Voiceover pacing: approximately 2 to 2.5 words per second.
For ${duration}s, the voiceover MUST contain ${minWords} to ${maxWords} spoken words (target: ${targetWords} words) in ${language}.
Audio and Visuals must be completely decoupled:
- Visual Prompt: Detailed, cinematic scene description for video generators describing action, lighting, subject, and style. ${duration >= 15 ? `For this ${duration}s clip, describe 2 to 3 connected visual beats/camera transitions (e.g. Beat 1: establishing shot... Beat 2: dynamic tracking... Beat 3: final reveal).` : ""}
- Camera Movement: Specific camera direction (e.g. "Slow cinematic push-in", "Dynamic drone tracking shot", "Low-angle dolly zoom").
- Voiceover Script: Authentic spoken ${language} narration that takes exactly ~${duration} seconds to speak at normal natural pace (${targetWords} words). Do not include any stage directions or brackets.
- Caption: Short, punchy on-screen subtitle text.

Output MUST be a valid JSON array of objects. Do not wrap in markdown quotes if possible, or format as pure JSON:
[
  {
    "sceneNumber": 1,
    "durationSeconds": ${duration},
    "visualPrompt": "cinematic prompt description...",
    "cameraMovement": "Slow push-in...",
    "voiceoverScript": "spoken words in ${language} (${targetWords} words)...",
    "captionText": "short caption..."
  }
]`;

    const promptMessage = `Create an ${sceneCount}-scene video breakdown (${duration} seconds per scene) for:
"${topicPrompt}"

Language for Voiceover & Captions: ${language}
Tone: ${tone}

Ensure:
1. Exactly ${sceneCount} sequential scenes that tell a compelling visual story.
2. Each voiceover snippet has between ${minWords} and ${maxWords} words so it lasts comfortably for ${duration} seconds.
3. The visual prompts are descriptive, photorealistic, and ready for video generation.`;

    const response = await generateWithFallback(ai, {
      contents: promptMessage,
      config: {
        systemInstruction,
        temperature: 0.7,
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text?.trim() || "[]";
    let parsedScenes = [];
    try {
      parsedScenes = JSON.parse(rawText);
    } catch {
      // Clean potential backticks
      const cleaned = rawText.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
      parsedScenes = JSON.parse(cleaned);
    }

    // Ensure durationSeconds is set
    parsedScenes = parsedScenes.map((s: any, idx: number) => ({
      ...s,
      sceneNumber: s.sceneNumber || idx + 1,
      durationSeconds: s.durationSeconds || duration,
    }));

    res.json({
      success: true,
      scenes: parsedScenes,
      count: parsedScenes.length,
    });
  } catch (error: any) {
    console.error("Error generating batch scenes:", error);
    res.status(500).json({
      error: error?.message || "Failed to generate batch scenes with Gemini API.",
    });
  }
});

// 1.6 Custom Multi-Prompt Parser (e.g. Prompt 1, Prompt 2, etc. with duration)
app.post("/api/parse-custom-prompts", async (req: Request, res: Response) => {
  try {
    const { rawPromptsText, durationSeconds = 8, language = "urdu", tone = "engaging" } = req.body;

    if (!rawPromptsText || typeof rawPromptsText !== "string" || !rawPromptsText.trim()) {
      res.status(400).json({ error: "Please provide prompts text." });
      return;
    }

    const ai = getGeminiClient();

    const systemInstruction = `You are an expert AI Video Producer. The user has provided one or more video prompts (such as "Prompt 1", "Prompt 2" or scene descriptions) in a single text box.
Your task is to parse each item into an exact sequential scene object.
For each scene:
- durationSeconds: ${durationSeconds}
- visualPrompt: Detailed cinematic visual description ready for Veo/Runway text-to-video generator (lighting, action, style, subject).
- cameraMovement: Concise camera angle (e.g. "Slow cinematic push-in", "Dynamic drone follow").
- voiceoverScript: If the user provided speech or dialog, refine it into authentic spoken ${language}. If the user only gave a visual scene description, create an engaging, natural ${language} voiceover narration that matches that scene and fits comfortably in ${durationSeconds} seconds (14 to 20 words).
- captionText: Short punchy on-screen caption (3 to 6 words).

Output MUST be a valid JSON array of objects:
[
  {
    "sceneNumber": 1,
    "durationSeconds": ${durationSeconds},
    "visualPrompt": "cinematic description...",
    "cameraMovement": "camera angle...",
    "voiceoverScript": "spoken narration in ${language}...",
    "captionText": "short caption..."
  }
]`;

    const promptMessage = `User raw prompt input:
"""
${rawPromptsText.trim()}
"""

Parse this into individual scenes (each ${durationSeconds} seconds long). Generate the visual prompt, camera movement, authentic ${language} voiceover narration, and caption for each scene.`;

    let parsedScenes: any[] = [];

    try {
      const response = await generateWithFallback(ai, {
        contents: promptMessage,
        config: {
          systemInstruction,
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      });

      const rawText = response.text?.trim() || "[]";
      try {
        parsedScenes = JSON.parse(rawText);
      } catch {
        const cleaned = rawText.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
        parsedScenes = JSON.parse(cleaned);
      }
    } catch (modelErr: any) {
      console.warn("All AI models busy or high demand spike, using smart local parser fallback:", modelErr?.message);
      parsedScenes = localCustomPromptsParser(rawPromptsText, durationSeconds, language);
    }

    if (!parsedScenes || parsedScenes.length === 0) {
      parsedScenes = localCustomPromptsParser(rawPromptsText, durationSeconds, language);
    }

    res.json({
      success: true,
      scenes: parsedScenes,
      count: parsedScenes.length,
    });
  } catch (error: any) {
    console.error("Error in custom prompts parser:", error);
    // Ultimate fallback so the user always gets their scenes processed
    const fallbackScenes = localCustomPromptsParser(req.body?.rawPromptsText || "", req.body?.durationSeconds || 8, req.body?.language || "urdu");
    res.json({
      success: true,
      scenes: fallbackScenes,
      count: fallbackScenes.length,
    });
  }
});

// Prebuilt Gemini TTS Voice Library (All 30 official Gemini Voices)
const ALL_GEMINI_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
];

const previewCache = new Map<string, string>();

function getSpeakingStyleInstruction(style?: string): string {
  switch (style) {
    case "Cheerful":
      return "Deliver with bright, cheerful, joyful energy and a warm smile. ";
    case "Serious":
      return "Deliver in a serious, solemn, composed, and focused tone. ";
    case "Calm":
      return "Deliver in a soft, calm, soothing, and relaxing voice. ";
    case "Excited":
      return "Deliver with high excitement, vibrant thrill, and spirited enthusiasm! ";
    case "Whisper":
      return "Deliver in an intimate, soft, gentle whisper. ";
    case "Storyteller":
      return "Deliver in an engaging storytelling cadence with expressive pacing and dramatic pauses. ";
    case "News Anchor":
      return "Deliver in a crisp, authoritative, professional broadcast news anchor cadence. ";
    case "Normal":
    default:
      return "";
  }
}

// Robust Multi-Model TTS Generator (Tries 3.1 Flash TTS, falls back to 2.5 Flash TTS on quota limit)
async function generateTTSAudio(ttsPrompt: string, chosenVoice: string): Promise<{ audioBase64: string; durationSeconds: number; modelUsed: string }> {
  const ai = getGeminiClient();
  const modelsToTry = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text: ttsPrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: chosenVoice },
            },
          },
        },
      });

      const inlinePart = response.candidates?.[0]?.content?.parts?.find(
        (part: any) => part.inlineData && part.inlineData.data
      );

      if (inlinePart?.inlineData?.data) {
        const rawData = inlinePart.inlineData.data;
        const rawBuffer = Buffer.from(rawData, "base64");
        const wavBuffer = pcmToWav(rawBuffer, 24000, 1, 16);
        const audioBase64 = wavBuffer.toString("base64");
        const durationSeconds = rawBuffer.length / 48000;
        return {
          audioBase64,
          durationSeconds,
          modelUsed: modelName,
        };
      }
    } catch (err: any) {
      lastError = err;
      const isQuota = isRateLimitOrQuotaError(err);
      if (isQuota) {
        console.warn(`[TTS Fallback] ${modelName} quota reached, attempting fallback...`);
        continue;
      }
      break;
    }
  }

  throw lastError || new Error("Failed to generate speech with Gemini TTS.");
}

// 2. Audio Generation (Text-to-Speech) using Gemini TTS with automatic fallback
const handleVoiceover = async (req: Request, res: Response) => {
  try {
    const {
      text,
      voice,
      voiceName = voice || "Kore",
      accent = "pakistani_urdu",
      gender = "female",
      language = "urdu",
      tone = "natural",
      speakingStyle = "Normal",
      customStyleInstruction = "",
    } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Script text is required for voiceover generation." });
      return;
    }

    const cleanText = text.trim();

    // Map accent & language into spoken delivery instruction for TTS model
    let accentInstruction = "";
    if (accent === "pakistani_urdu" || language === "urdu") {
      accentInstruction = "Speak naturally with an authentic Pakistani Urdu accent and clear articulation: ";
    } else if (accent === "indian_hindi_urdu" || language === "hindi") {
      accentInstruction = "Speak naturally with an Indian Hindi accent and clear articulation: ";
    } else if (accent === "english_south_asian") {
      accentInstruction = "Speak in clear English with a natural South Asian accent: ";
    } else if (accent === "english_us") {
      accentInstruction = "Speak clearly in a standard neutral American English accent: ";
    } else if (accent === "english_uk") {
      accentInstruction = "Speak clearly in a refined British English accent: ";
    } else {
      accentInstruction = "Speak with natural cadence: ";
    }

    // Speaking style & custom style instructions (e.g. for child voices)
    let stylePrefix = "";
    if (customStyleInstruction && typeof customStyleInstruction === "string") {
      stylePrefix += customStyleInstruction.trim() + " ";
    }

    const styleInstr = getSpeakingStyleInstruction(speakingStyle);
    if (styleInstr) {
      stylePrefix += styleInstr;
    }

    // Tone fallback if no speaking style specified
    if (!styleInstr && !customStyleInstruction) {
      if (tone === "energetic") stylePrefix = "Deliver with lively energy and enthusiasm. ";
      else if (tone === "calm") stylePrefix = "Deliver in a soothing, calm, and warm voice. ";
      else if (tone === "authoritative") stylePrefix = "Deliver in a confident, professional, and authoritative tone. ";
      else if (tone === "storyteller") stylePrefix = "Deliver in an engaging storytelling cadence with expressive pacing. ";
    }

    const ttsPrompt = `${stylePrefix}${accentInstruction}${cleanText}`;

    // Select prebuilt voice from 30 official Gemini voices
    const chosenVoice = ALL_GEMINI_VOICES.includes(voiceName)
      ? voiceName
      : gender === "male"
      ? "Fenrir"
      : "Kore";

    const { audioBase64, durationSeconds, modelUsed } = await generateTTSAudio(ttsPrompt, chosenVoice);

    res.json({
      success: true,
      audioBase64,
      mimeType: "audio/wav",
      duration: Math.round(durationSeconds * 10) / 10,
      voice: chosenVoice,
      accent,
      modelUsed,
    });
  } catch (error: any) {
    const isQuota = isRateLimitOrQuotaError(error);
    const retryDelaySeconds = isQuota ? extractRetryDelay(error) : undefined;
    if (isQuota) {
      console.warn(`[Quota Notice] TTS rate limit reached, retry delay: ${retryDelaySeconds}s`);
    } else {
      console.error("Error generating voiceover:", error);
    }
    res.status(isQuota ? 429 : 500).json({
      success: false,
      error: isQuota
        ? `Quota limit reached on Gemini TTS. Please retry in ${retryDelaySeconds || 30}s.`
        : error?.message || "Failed to generate speech with Gemini TTS.",
      isQuotaError: isQuota,
      retryDelaySeconds,
    });
  }
};

app.post("/api/generate-voiceover", handleVoiceover);
app.post("/api/generate-speech", handleVoiceover);

// 2b. Fast 3-Second Voice Preview Endpoint (Short 6-8 words sample, quota-conscious)
app.post("/api/preview-voice", async (req: Request, res: Response) => {
  try {
    const {
      voiceName = "Kore",
      language = "urdu",
      gender = "female",
      customStyleInstruction = "",
      speakingStyle = "Normal",
    } = req.body;

    const previewKey = `${voiceName}_${language}_${speakingStyle}_${customStyleInstruction ? "custom" : "std"}`;
    if (previewCache.has(previewKey)) {
      res.json({
        success: true,
        audioBase64: previewCache.get(previewKey),
        mimeType: "audio/wav",
        duration: 3,
        cached: true,
      });
      return;
    }

    // Concise 6 to 8 words sample sentence per language
    let sampleText = "خوش آمدید! یہ میری آواز کا مختصر نمونہ ہے۔";
    if (language === "hindi") {
      sampleText = "नमस्ते! यह मेरी आवाज़ का छोटा सा नमूना है।";
    } else if (language === "english") {
      sampleText = "Hello! Here is a short sample of my voice.";
    }

    let styleText = "";
    if (customStyleInstruction && typeof customStyleInstruction === "string") {
      styleText += customStyleInstruction.trim() + " ";
    }
    const styleInstr = getSpeakingStyleInstruction(speakingStyle);
    if (styleInstr) {
      styleText += styleInstr;
    }

    let accentText = "";
    if (language === "urdu") accentText = "Speak with authentic Pakistani Urdu pronunciation: ";
    else if (language === "hindi") accentText = "Speak with authentic Hindi pronunciation: ";
    else accentText = "Speak in clear, natural English: ";

    const ttsPrompt = `${styleText}${accentText}${sampleText}`;

    const chosenVoice = ALL_GEMINI_VOICES.includes(voiceName)
      ? voiceName
      : gender === "male"
      ? "Fenrir"
      : "Kore";

    const { audioBase64, modelUsed } = await generateTTSAudio(ttsPrompt, chosenVoice);

    previewCache.set(previewKey, audioBase64);

    res.json({
      success: true,
      audioBase64,
      mimeType: "audio/wav",
      duration: 3,
      modelUsed,
    });
  } catch (error: any) {
    const isQuota = isRateLimitOrQuotaError(error);
    const retryDelaySeconds = isQuota ? extractRetryDelay(error) : undefined;
    if (isQuota) {
      console.warn(`[Quota Notice] Voice preview quota reached, retry in ${retryDelaySeconds}s`);
    } else {
      console.error("Error generating voice preview:", error);
    }
    res.status(isQuota ? 429 : 500).json({
      success: false,
      error: isQuota
        ? `Quota limit reached on Gemini TTS. Please retry in ${retryDelaySeconds || 30}s.`
        : error?.message || "Failed to generate voice preview.",
      isQuotaError: isQuota,
      retryDelaySeconds,
    });
  }
});

// 2c. Auto-translate Script Endpoint (Gemini 2.5 Flash)
app.post("/api/translate-script", async (req: Request, res: Response) => {
  try {
    const { script, targetLanguage = "urdu" } = req.body;
    if (!script || typeof script !== "string" || !script.trim()) {
      res.status(400).json({ error: "Script text is required for translation." });
      return;
    }

    const ai = getGeminiClient();
    const langInstructions: Record<string, string> = {
      urdu: "Translate the following marketing voiceover script into natural, fluent, and idiomatic Urdu (اردو) in standard Urdu script. Maintain the exact emotional tone, cadence, persuasive impact, and meaning. Do NOT output notes, romanized words, commentary, or quotes. Output ONLY the translated Urdu text.",
      hindi: "Translate the following marketing voiceover script into natural, fluent, and conversational Hindi (हिन्दी) in standard Devanagari script. Maintain the exact emotional tone, cadence, persuasive impact, and meaning. Do NOT output notes, romanized words, commentary, or quotes. Output ONLY the translated Hindi text.",
      english: "Translate the following marketing voiceover script into polished, engaging, and natural English. Maintain the exact emotional tone, cadence, persuasive impact, and meaning. Do NOT output notes, commentary, or quotes. Output ONLY the translated English text.",
    };

    const instruction = langInstructions[targetLanguage] || langInstructions.urdu;

    const response = await generateWithFallback(ai, {
      contents: [
        {
          parts: [
            {
              text: `${instruction}\n\nORIGINAL SCRIPT:\n${script.trim()}\n\nTRANSLATED SCRIPT:`,
            },
          ],
        },
      ],
      config: {
        temperature: 0.3,
      },
    });

    const translatedText = response.text?.trim() || "";
    if (!translatedText) {
      throw new Error("Translation returned empty result.");
    }

    const words = translatedText.split(/\s+/).filter(Boolean).length;
    res.json({
      success: true,
      translatedScript: translatedText,
      targetLanguage,
      wordCount: words,
    });
  } catch (error: any) {
    console.error("Error translating script:", error);
    const isQuota = isRateLimitOrQuotaError(error);
    const retryDelaySeconds = isQuota ? extractRetryDelay(error) : undefined;
    res.status(isQuota ? 429 : 500).json({
      success: false,
      error: error?.message || "Failed to translate script.",
      isQuotaError: isQuota,
      retryDelaySeconds,
    });
  }
});

// --- Dedicated Direct File Download Endpoints (Mobile & Iframe Resilient) ---
const downloadFiles = new Map<string, { buffer: Buffer; mimeType: string; filename: string; createdAt: number }>();

// Periodic cleanup of downloads older than 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [id, item] of downloadFiles.entries()) {
    if (now - item.createdAt > 60 * 60 * 1000) {
      downloadFiles.delete(id);
    }
  }
}, 10 * 60 * 1000);

app.post("/api/prepare-download", (req: Request, res: Response) => {
  try {
    const { audioBase64, filename = "voiceover.mp3", mimeType = "audio/mpeg" } = req.body;
    if (!audioBase64 || typeof audioBase64 !== "string") {
      res.status(400).json({ error: "audioBase64 string is required" });
      return;
    }
    const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const id = `dl-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    downloadFiles.set(id, {
      buffer,
      mimeType,
      filename,
      createdAt: Date.now(),
    });
    res.json({
      success: true,
      id,
      downloadUrl: `/api/download-file/${id}?filename=${encodeURIComponent(filename)}`,
    });
  } catch (err: any) {
    console.error("Error preparing download:", err);
    res.status(500).json({ error: err?.message || "Failed to prepare download." });
  }
});

app.get("/api/download-file/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const item = downloadFiles.get(id);
  if (!item) {
    res.status(404).send("File not found or expired. Please regenerate your audio.");
    return;
  }
  const filename = (req.query.filename as string) || item.filename;
  res.setHeader("Content-Type", item.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", item.buffer.length);
  res.send(item.buffer);
});

// 3. Curated Thematic Cinematic Visual Engine & Visual Generation (100% Free Tier Guaranteed)
// Comprehensive 22+ categories covering almost every subject/topic with pristine 1280x1280 Unsplash photos
const THEMED_VISUALS: Record<string, string[]> = {
  spirituality_islamic: [
    "https://images.unsplash.com/photo-1564769625905-50e93615e769?auto=format&fit=crop&w=1280&q=80", // Breathtaking grand mosque arches with golden sunlight
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1280&q=80", // Illuminated minarets against twilight sky
    "https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?auto=format&fit=crop&w=1280&q=80", // Majestic Islamic architecture dome & courtyard
    "https://images.unsplash.com/photo-1590076215667-875d4ef2d7ee?auto=format&fit=crop&w=1280&q=80", // Serene mosque arch with soft evening prayer glow
  ],
  family_parents: [
    "https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=1280&q=80", // Grandfather and grandson walking into golden sunset
    "https://images.unsplash.com/photo-1476703993599-0035a21b17a9?auto=format&fit=crop&w=1280&q=80", // Loving parent holding child hand in warm golden field
    "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1280&q=80", // Elderly hands holding family portrait with warmth
    "https://images.unsplash.com/photo-1609220136736-443140cffec6?auto=format&fit=crop&w=1280&q=80", // Heartwarming family embrace at golden hour
  ],
  majestic_wildlife: [
    "https://images.unsplash.com/photo-1611689342806-0863700ce1e4?auto=format&fit=crop&w=1280&q=80", // Magnificent eagle soaring in mountain sky
    "https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?auto=format&fit=crop&w=1280&q=80", // Golden eagle soaring over rugged alpine peaks
    "https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=1280&q=80", // Majestic lion king resting with dignified golden aura
    "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=1280&q=80", // Noble black stallion running through mist
  ],
  hard_work_craftsman: [
    "https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=1280&q=80", // Artisan blacksmith forging glowing metal with sparks
    "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1280&q=80", // Dedicated craftsman sculpting wooden workpiece in workshop
    "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1280&q=80", // Hardworking farmer in vast golden wheat field at sunrise
    "https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?auto=format&fit=crop&w=1280&q=80", // Woodworker measuring timeless antique carpentry
  ],
  wisdom_study: [
    "https://images.unsplash.com/photo-1507842229452-772d1c9ab8d5?auto=format&fit=crop&w=1280&q=80", // Classic warm library
    "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1280&q=80", // Warm wooden study desk
    "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1280&q=80", // Open books with glowing light
    "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1280&q=80", // Thoughtful study desk with warm bokeh
    "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1280&q=80", // Shelves of classic books with golden bokeh
  ],
  motivation_success: [
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1280&q=80", // Majestic mountain peak golden sunrise
    "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1280&q=80", // Dramatic Yosemite valley light rays
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1280&q=80", // Snow peaks with stars
    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1280&q=80", // Atmospheric misty mountain ridge
  ],
  rain_peace_contemplation: [
    "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=1280&q=80", // Raindrops on window overlooking city lights
    "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?auto=format&fit=crop&w=1280&q=80", // Moody rainfall reflecting warm streetlamp amber glow
    "https://images.unsplash.com/photo-1508873696983-2df5293cb395?auto=format&fit=crop&w=1280&q=80", // Tranquil raindrop ripples on peaceful water surface
    "https://images.unsplash.com/photo-1486016006115-74a41448aea2?auto=format&fit=crop&w=1280&q=80", // Windowpane covered in soft rain bokeh at twilight
  ],
  morning_dawn_tea: [
    "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1280&q=80", // Steaming cup of tea overlooking misty sunrise
    "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=1280&q=80", // Cozy morning tea with golden sunlight beams
    "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1280&q=80", // Pouring hot tea into glass with soft morning steam
    "https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=1280&q=80", // Traditional teacup in tranquil outdoor garden sunrise
  ],
  friendship_loyalty: [
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1280&q=80", // Friends standing together at golden sunset
    "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=1280&q=80", // Close friends walking along mountain trail together
    "https://images.unsplash.com/photo-1543807535-eceef0bc6599?auto=format&fit=crop&w=1280&q=80", // Warm camaraderie in ambient cafe
  ],
  business_commerce: [
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1280&q=80", // Modern skyscraper architectural facade
    "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1280&q=80", // Strategic business planning on executive desk
    "https://images.unsplash.com/photo-1556742049-0a67c5574f73?auto=format&fit=crop&w=1280&q=80", // Bustling commerce transaction with smiling service
    "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=1280&q=80", // Modern corporate office with panoramic skyline
  ],
  wealth_luxury_time: [
    "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1280&q=80", // Luxury Swiss chronograph watch with gold gears
    "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=1280&q=80", // Antique golden pocket watch resting on dark wood
    "https://images.unsplash.com/photo-1585336261026-620ee6b4fae0?auto=format&fit=crop&w=1280&q=80", // Fountain pen with golden nib on handmade parchment
  ],
  perseverance_growth: [
    "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1280&q=80", // Deep misty forest with sunlight beam
    "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=1280&q=80", // Strong ancient green tree
    "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1280&q=80", // Forest sunlight pathway
    "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=1280&q=80", // Sunlight through golden leaves
  ],
  automotive: [
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=1280&q=80",
  ],
  driver_portrait: [
    "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1280&q=80",
  ],
  real_estate: [
    "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1280&q=80",
  ],
  technology: [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1280&q=80",
  ],
  nature: [
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1280&q=80",
  ],
  ocean_sea: [
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=1280&q=80",
  ],
  space_galaxy: [
    "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1280&q=80",
  ],
  historical_heritage: [
    "https://images.unsplash.com/photo-1599557262024-e12911b32d0c?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1280&q=80",
  ],
  food_dining: [
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1280&q=80",
  ],
  fitness_sports: [
    "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1280&q=80",
  ],
  cinematic_general: [
    "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1477959858617-67f30bc75b82?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1280&q=80",
    "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1280&q=80",
  ],
};

function getCuratedSceneVisual(promptText: string, sceneNumber: number, forcedCategory?: string): string {
  // If user or AI explicitly specified a valid category, use it directly!
  if (forcedCategory && THEMED_VISUALS[forcedCategory]) {
    const list = THEMED_VISUALS[forcedCategory];
    return list[(sceneNumber - 1) % list.length];
  }

  const p = (promptText || "").toLowerCase();
  let pool = THEMED_VISUALS.cinematic_general;

  // Rich AI Semantic Matching matching both Urdu and English keywords:
  if (/مسجد|نماز|دعا|قرآن|مکہ|مدینہ|اللہ|خدا|نور|روح|عبادت|صبر|توکل|ایمان|تسبیح|اذان|اسلام|اسلامی|سجدہ|رحمت|mosque|prayer|islamic|quran|spiritual|divine|worship|faith|islam/i.test(p)) {
    pool = THEMED_VISUALS.spirituality_islamic;
  } else if (/والدین|ماں|باپ|امی|ابو|اولاد|بچے|بیٹا|بیٹی|خاندان|محبت|پیار|شفقت|ماں باپ|مامتا|شفقت|parents|mother|father|family|children|child|kindred|tender|mom|dad/i.test(p)) {
    pool = THEMED_VISUALS.family_parents;
  } else if (/عقاب|شاہین|شیر|گھوڑا|پرواز|طاقت|بلندی|بلند پرواز|اقبال|falcon|eagle|hawk|soar|lion|horse|stallion|majestic|wildlife|wings/i.test(p)) {
    pool = THEMED_VISUALS.majestic_wildlife;
  } else if (/محنت|مزدور|کسان|پسینہ|ہنر|کاریگر|لوہار|بڑھئی|اوزار|کھیت|فصل|مشقت|دستکار|hard work|craftsman|blacksmith|farmer|harvest|artisan|sweat|labor|effort|handicraft/i.test(p)) {
    pool = THEMED_VISUALS.hard_work_craftsman;
  } else if (/علم|تعلیم|استاد|کتاب|مطالعہ|حکمت|دانائی|سکول|کالج|قلم|تحریر|امتحان|طالب علم|book|study|library|wisdom|learn|read|intellect|teacher|knowledge|student|school/i.test(p)) {
    pool = THEMED_VISUALS.wisdom_study;
  } else if (/کامیابی|ہمت|منزل|حوصلہ|جیت|کوشش|چوٹی|طلوع|ارادہ|فاتح|عزم|succes|motivat|summit|peak|mountain|dawn|sunrise|achieve|victory|goal|winner/i.test(p)) {
    pool = THEMED_VISUALS.motivation_success;
  } else if (/بارش|بوند|کھڑکی|برسات|تنہائی|سوچ|اداسی|سکون|بھیگی|ابر|rain|raindrop|window|contemplat|cozy|solitude|peaceful|melancholy|rainfall/i.test(p)) {
    pool = THEMED_VISUALS.rain_peace_contemplation;
  } else if (/چائے|کافی|صبح|فجر|ناشتہ|تازگی|دم|سحر|سویرے|tea|coffee|morning|dawn|breakfast|freshness/i.test(p)) {
    pool = THEMED_VISUALS.morning_dawn_tea;
  } else if (/دوست|دوستی|وفا|یار|ہم سفر|ساتھ|ہمدردی|مخلص|بھائی چارہ|friend|friendship|companion|loyalty|solidarity/i.test(p)) {
    pool = THEMED_VISUALS.friendship_loyalty;
  } else if (/بزنس|کاروبار|دکان|مارکیٹ|تجارت|سرمایہ|دفتر|آفس|سیلز|منافع|مارکیٹنگ|business|office|meeting|finance|money|invest|shop|store|trade|commerce/i.test(p)) {
    pool = THEMED_VISUALS.business_commerce;
  } else if (/دولت|پیسہ|امیر|گھڑی|وقت|سونا|شاہانہ|سکوں|کمائی|خزانہ|wealth|luxury|rich|watch|time|chronograph|gold/i.test(p)) {
    pool = THEMED_VISUALS.wealth_luxury_time;
  } else if (/گاڑی|کار|موٹر|رفتار|ہائی وے|سڑک|سپر کار|ڈرائیو|ڈرائیونگ|car|vehicle|drive|highway|road|speed|supercar|sports car/i.test(p)) {
    pool = THEMED_VISUALS.automotive;
  } else if (/ڈرائیور|پورٹریٹ|چہرہ|مسکراہٹ|آدمی|عورت|شخص|انسان|نگاہ|driver|person|man|woman|face|smile|portrait|looking/i.test(p)) {
    pool = THEMED_VISUALS.driver_portrait;
  } else if (/کمپیوٹر|آئی ٹی|ڈیجیٹل|سافٹ ویئر|اے آئی|سائبر|کوڈنگ|ٹیکنالوجی|موبائل|tech|ai|digital|computer|laptop|future|app|crypto/i.test(p)) {
    pool = THEMED_VISUALS.technology;
  } else if (/ورزش|جم|صحت|کھیل|دوڑ|کھلاڑی|تندرستی|طاقتور|جسم|gym|fitness|run|workout|athlete|sport|bodybuilding/i.test(p)) {
    pool = THEMED_VISUALS.fitness_sports;
  } else if (/سمندر|ساحل|لہریں|کشتی|پانی|جزیرہ|ملاح|طوفان|ocean|sea|beach|water|wave|ship|coast|shore/i.test(p)) {
    pool = THEMED_VISUALS.ocean_sea;
  } else if (/ستارے|کہکشاں|چاند|آسمان|کائنات|فلک|چاندنی|space|galaxy|stars|universe|cosmos|astronomy|milky way|moon/i.test(p)) {
    pool = THEMED_VISUALS.space_galaxy;
  } else if (/قلعہ|محل|تاریخ|تاریخی|عمارت|مغل|بادشاہ|قدیم|heritage|history|palace|fort|castle|historic|monument/i.test(p)) {
    pool = THEMED_VISUALS.historical_heritage;
  } else if (/کھانا|دسترخوان|ضیافت|ریستوران|لذیذ|پکوان|ذائقہ|food|restaurant|chef|cook|meal|dining|feast/i.test(p)) {
    pool = THEMED_VISUALS.food_dining;
  } else if (/ولا|مکان|گھر|بنگلہ|شاندار مکان|عمارت|رہائش|villa|house|mansion|estate|property|home|luxury building/i.test(p)) {
    pool = THEMED_VISUALS.real_estate;
  } else if (/درخت|پودا|ہریالی|سبزہ|پھول|باغ|دریا|پہاڑ|قدرتی|nature|mountain|forest|valley|waterfall|greenery/i.test(p)) {
    pool = THEMED_VISUALS.nature;
  } else if (/صبر|استقامت|امید|خواب|یقین|روشنی|patience|grow|tree|growth|hope|faith|perseverance/i.test(p)) {
    pool = THEMED_VISUALS.perseverance_growth;
  }

  return pool[(sceneNumber - 1) % pool.length];
}

// Memory cache for image model quota status to prevent repeated 429 errors
let isImageQuotaExhausted = false;
let lastImageQuotaCheck = 0;

// Endpoint to get high-res thematic cinematic visual directly for any scene
const handleThematicVisual = (req: Request, res: Response) => {
  try {
    const visualPrompt = req.body.visualPrompt || req.body.prompt || "";
    const sceneNumber = req.body.sceneNumber || 1;
    const visualUrl = getCuratedSceneVisual(String(visualPrompt), Number(sceneNumber) || 1);
    res.json({
      success: true,
      visualUrl,
      imageUrl: visualUrl,
      source: "cinematic_curated",
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to get thematic visual" });
  }
};

app.post("/api/get-thematic-visual", handleThematicVisual);
app.post("/api/curated-scene-visual", handleThematicVisual);

// 3. Visual Clip / Scene Frame Generation (Image / Video preview frame)
app.post("/api/generate-scene-visual", async (req: Request, res: Response) => {
  try {
    const {
      visualPrompt,
      sceneNumber = 1,
      referenceImage,
      visualEngine = "auto",
      fallbackToCurated = true,
    } = req.body;

    if (!visualPrompt || typeof visualPrompt !== "string") {
      res.status(400).json({ error: "visualPrompt is required." });
      return;
    }

    // If user provided a reference image, use it for consistent visuals
    if (referenceImage && typeof referenceImage === "string" && referenceImage.length > 20) {
      res.json({
        success: true,
        visualUrl: referenceImage,
        imageUrl: referenceImage,
        source: "reference_image",
      });
      return;
    }

    const cleanPrompt = visualPrompt.trim();

    // 100% Free Tier: use high-resolution curated cinematic visual directly
    const visualUrl = getCuratedSceneVisual(cleanPrompt, Number(sceneNumber) || 1);
    res.json({
      success: true,
      visualUrl,
      imageUrl: visualUrl,
      source: "cinematic_curated",
    });
  } catch (error: any) {
    console.error("Error generating scene visual:", error);
    res.status(500).json({ error: "Failed to generate visual." });
  }
});

// 4. Auto-Shorten Voiceover Script to fit 8 seconds (18-22 words max)
app.post("/api/auto-shorten-voiceover", async (req: Request, res: Response) => {
  try {
    const { text, language = "urdu" } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Text is required to shorten." });
      return;
    }

    const ai = getGeminiClient();
    const systemInstruction = `You are an expert voiceover editor. Your job is to rewrite long voiceover text so it can be spoken comfortably within an 8-second video window.
Rules:
1. Target length: EXACTLY 16 to 20 words maximum in ${language}.
2. Maintain the core marketing hook, emotional punch, and meaning.
3. Remove filler words, unnecessary adjectives, and long clauses.
4. Output ONLY the shortened voiceover text ready for narration. No quotes, brackets, or explanations.`;

    const promptMessage = `Shorten this ${language} voiceover text so it can be cleanly spoken in 8 seconds (under 20 words):\n"${text}"`;

    let shortenedText = "";
    try {
      const response = await generateWithFallback(ai, {
        contents: promptMessage,
        config: {
          systemInstruction,
          temperature: 0.5,
        },
      });
      shortenedText = response.text?.trim() || "";
    } catch (e: any) {
      // Local fallback: trim to first 18 words cleanly
      const words = text.trim().split(/\s+/);
      shortenedText = words.slice(0, 18).join(" ");
    }

    if (!shortenedText) {
      const words = text.trim().split(/\s+/);
      shortenedText = words.slice(0, 18).join(" ");
    }

    res.json({
      success: true,
      shortenedText,
    });
  } catch (err: any) {
    console.error("Error in auto-shorten:", err);
    res.status(500).json({ error: "Failed to auto-shorten text." });
  }
});

// 5. Generate Social Media Caption & 10 Viral Hashtags
app.post("/api/generate-social-caption", async (req: Request, res: Response) => {
  try {
    const { topicPrompt, scenes = [], language = "urdu" } = req.body;
    const ai = getGeminiClient();

    const scriptDigest = scenes
      .map((s: any, idx: number) => `Scene ${idx + 1}: ${s.voiceoverScript || s.visualPrompt}`)
      .slice(0, 6)
      .join("\n");

    const systemInstruction = `You are a viral social media marketing manager. Create an irresistible, high-converting caption and 10 trending hashtags for TikTok, Instagram Reels, YouTube Shorts, and Facebook.
Language: ${language}
Output format must be valid JSON:
{
  "caption": "Catchy 2-3 line caption with emoji and strong call to action...",
  "hashtags": ["#marketing", "#viral", "#urdu", "#reels", ...]
}`;

    const promptMessage = `Product/Topic: "${topicPrompt}"
Video Script breakdown:
${scriptDigest}

Generate the caption and 10 hashtags.`;

    let parsedResult = {
      caption: `🔥 ${topicPrompt || "شاندار ویڈیو پیشکش"} - ابھی دیکھیں اور اپنے دوستوں کے ساتھ شیئر کریں!`,
      hashtags: ["#viral", "#video", "#trending", "#reels", "#urdu", "#marketing", "#shorts", "#foryou", "#explore", "#pakistan"],
    };

    try {
      const response = await generateWithFallback(ai, {
        contents: promptMessage,
        config: {
          systemInstruction,
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      });

      const raw = response.text?.trim() || "{}";
      const cleaned = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.caption) parsedResult.caption = parsed.caption;
      if (Array.isArray(parsed.hashtags)) parsedResult.hashtags = parsed.hashtags;
    } catch (e: any) {
      console.warn("Using fallback social caption:", e?.message);
    }

    res.json({
      success: true,
      ...parsedResult,
    });
  } catch (err: any) {
    console.error("Error generating social caption:", err);
    res.status(500).json({ error: "Failed to generate social caption." });
  }
});

// ============================================================================
// 6. DAILY MARKETING & MOTIVATIONAL IMAGE STUDIO ENDPOINTS (100% FREE TIER)
// ============================================================================

const RICH_MOTIVATIONAL_LIBRARY = [
  {
    topic: "کامیابی اور محنت",
    headlineUrdu: "محنت کبھی رائیگاں نہیں جاتی",
    messageUrdu: "جو شخص اندھیروں میں اپنے خوابوں کے لیے پسینہ بہاتا ہے، وقت ایک دن اس کی کامیابی کا سورج پوری دنیا کے سامنے طلوع کرتا ہے۔",
    messageEnglish: "Hard work in silence builds the empire that shines tomorrow.",
    visualPrompt: "Majestic mountain peak at golden sunrise above dramatic clouds, warm golden light rays, cinematic luxury dark foreground",
  },
  {
    topic: "صبر اور حوصلہ",
    headlineUrdu: "صبر کا پھل ہمیشہ میٹھا ہوتا ہے",
    messageUrdu: "مشکل وقت آپ کو توڑنے کے لیے نہیں، بلکہ آپ کے اندر چھپی ہوئی اصل طاقت کو جگانے اور آپ کو مضبوط بنانے کے لیے آتا ہے۔",
    messageEnglish: "Every storm is training you to stand taller in the light.",
    visualPrompt: "Lone ancient tree standing strong on a cliff overlooking a calm golden ocean at sunset, cinematic lighting, 8k",
  },
  {
    topic: "وقت کی قدر",
    headlineUrdu: "آج کا قدم، کل کی منزل",
    messageUrdu: "بہترین وقت کا انتظار مت کرو، آج آپ جہاں ہیں وہیں سے شروعات کریں۔ چھوٹے مگر مسلسل قدم ہی بڑی منزل تک پہنچاتے ہیں۔",
    messageEnglish: "Don't wait for the perfect moment; start now and make the moment count.",
    visualPrompt: "Luxury vintage hourglass with glowing golden sand on a dark marble executive desk, dramatic studio rim light",
  },
  {
    topic: "خود اعتمادی اور یقین",
    headlineUrdu: "اپنے رب اور اپنی محنت پر یقین رکھیں",
    messageUrdu: "جب آپ کا یقین مضبوط ہو تو دنیا کی کوئی رکاوٹ آپ کا راستہ نہیں روک سکتی۔ منزل انہی کو ملتی ہے جو ہار نہیں مانتے۔",
    messageEnglish: "Unshakeable faith and relentless effort open every locked door.",
    visualPrompt: "Cinematic silhouette of a confident visionary standing atop a hill looking at a glowing horizon under starry twilight sky",
  },
  {
    topic: "کاروبار اور ترقی",
    headlineUrdu: "بڑی سوچ، بڑی کامیابی",
    messageUrdu: "کامیاب انسان مواقع کا انتظار نہیں کرتے بلکہ اپنی ذہانت، ایمانداری اور مستقل مزاجی سے نئے مواقع خود پیدا کرتے ہیں۔",
    messageEnglish: "Great minds build opportunities where others only see walls.",
    visualPrompt: "Modern luxury executive office overlooking city skyline at dusk, warm golden ambient lights, dark obsidian aesthetic",
  },
  {
    topic: "نئی شروعات اور امید",
    headlineUrdu: "ہر نیا دن ایک نیا موقع ہے",
    messageUrdu: "گزشتہ کل کی غلطیوں کو سیکھنے کا ذریعہ بنائیں اور آج کے دن کو نئے عزم، نئی توانائی اور نئی امید کے ساتھ شروع کریں۔",
    messageEnglish: "Every sunrise brings a fresh page to write your greatest story.",
    visualPrompt: "Serene alpine lake reflecting golden morning sunlight through misty pine forest, peaceful and inspiring atmosphere",
  },
  {
    topic: "استقامت اور منزل",
    headlineUrdu: "تھک کر رکنا نہیں، منزل قریب ہے",
    messageUrdu: "اکثر لوگ کامیابی کے بالکل قریب پہنچ کر ہمت ہار دیتے ہیں۔ بس ایک قدم اور آگے بڑھیں، آپ کی محنت رنگ لانے والی ہے۔",
    messageEnglish: "Keep going—the darkest hour is right before the brightest dawn.",
    visualPrompt: "Winding highway road leading toward glowing golden mountains at dawn, dramatic sky, cinematic wide shot",
  },
  {
    topic: "اخلاق اور کردار",
    headlineUrdu: "بہترین کردار ہی اصل پہچان ہے",
    messageUrdu: "دولت اور عہدے وقت کے ساتھ بدل جاتے ہیں، مگر اچھے اخلاق، سچائی اور عاجزی انسان کو ہمیشہ دلوں میں زندہ رکھتی ہے۔",
    messageEnglish: "Character, kindness, and integrity are the true crown of success.",
    visualPrompt: "Warm glowing lantern illuminating a peaceful stone pathway at twilight, rich golden bokeh, serene inspirational mood",
  },
  {
    topic: "علم اور سیکھنے کا عمل",
    headlineUrdu: "سیکھنے والا کبھی ناکام نہیں ہوتا",
    messageUrdu: "یا تو آپ جیتتے ہیں یا آپ سیکھتے ہیں۔ ہر تجربہ آپ کو پہلے سے بہتر، سمجھدار اور کامیابی کے زیادہ قابل بناتا ہے۔",
    messageEnglish: "You never lose—either you win, or you learn how to win next time.",
    visualPrompt: "Open glowing book with warm golden particles rising in a classic dark wood library, cinematic atmosphere",
  },
  {
    topic: "شکر گزاری اور سکون",
    headlineUrdu: "شکر گزاری میں ہی اصل برکت ہے",
    messageUrdu: "جو کچھ آپ کے پاس ہے اس پر شکر ادا کریں، اور جس چیز کی خواہش ہے اس کے لیے پوری لگن سے محنت جاری رکھیں۔",
    messageEnglish: "Gratitude turns what we have into abundance and fuels our next goal.",
    visualPrompt: "Golden wheat field under warm sunset rays with soft breeze, peaceful cinematic nature photography",
  },
];

// 6.1 Analyze Master Instructions & Reference Style Image
app.post("/api/analyze-image-instructions", async (req: Request, res: Response) => {
  try {
    const {
      instructionsText = "",
      referenceImageBase64 = "",
      colorPalette = "gold_black",
      aspectRatio = "1:1",
      bgStyle = "cinematic_dark",
      language = "urdu",
      brandName = "",
    } = req.body;

    const ai = getGeminiClient();

    const defaultProfile = {
      summaryUrdu: `آپ کی ہدایات کا تجزیہ مکمل کر کے انہیں محفوظ کر لیا گیا ہے: ہر تصویر (${aspectRatio} سائز) میں "${bgStyle}" اسٹائل کا بیک گراؤنڈ، "${colorPalette}" کلر تھیم، اور خوبصورت موٹیویشنل خطاطی استعمال کی جائے گی۔`,
      detectedStyle: bgStyle === "nature_sunrise" ? "Golden Sunrise Nature" : bgStyle === "islamic_minimal" ? "Elegant Spiritual Minimalist" : bgStyle === "luxury_office" ? "Executive Luxury Business" : "Cinematic Dark & Gold",
      visualRules: instructionsText.trim() || "High contrast dark luxury background, warm golden rim lighting, clean central negative space for motivational Urdu/English typography.",
      typographyRules: language === "english" ? "Bold modern English headline with clean subtitle" : "واضح اور دلکش اردو نستعلیق خطاطی بمعہ گولڈن ہائی لائٹس",
      promptFormula: `Master Style: ${instructionsText || "Cinematic motivational marketing poster"}, Color Theme: ${colorPalette}, Background: ${bgStyle}, Aspect Ratio: ${aspectRatio}, High-resolution 8K commercial finish.`,
    };

    try {
      const parts: any[] = [];
      if (referenceImageBase64 && typeof referenceImageBase64 === "string" && referenceImageBase64.startsWith("data:image")) {
        const match = referenceImageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }

      parts.push({
        text: `Analyze these user instructions (and optional reference image) for a Daily Marketing & Motivational Image Generator.
User Instructions: "${instructionsText || "Create inspiring motivational marketing images with clean typography and rich backgrounds"}"
Selected Color Palette: ${colorPalette}
Selected Background Style: ${bgStyle}
Aspect Ratio: ${aspectRatio}
Language: ${language}
Brand/Footer Name: ${brandName || "None"}

Return a JSON object with:
{
  "summaryUrdu": "2-sentence encouraging summary in Urdu explaining how the system understood their style, colors, background, and layout rules.",
  "detectedStyle": "Short 3-5 word style title in English/Urdu",
  "visualRules": "Detailed English visual prompt instructions extracted from the user's text and reference image (lighting, colors, mood, composition)",
  "typographyRules": "Brief Urdu description of how the motivational text will be styled",
  "promptFormula": "A reusable master prompt prefix in English that locks in this exact style so the user doesn't have to repeat instructions."
}`,
      });

      const response = await generateWithFallback(ai, {
        contents: { parts },
        config: {
          temperature: 0.5,
          responseMimeType: "application/json",
        },
      });

      const raw = response.text?.trim() || "{}";
      const cleaned = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);

      res.json({
        success: true,
        profile: {
          summaryUrdu: parsed.summaryUrdu || defaultProfile.summaryUrdu,
          detectedStyle: parsed.detectedStyle || defaultProfile.detectedStyle,
          visualRules: parsed.visualRules || defaultProfile.visualRules,
          typographyRules: parsed.typographyRules || defaultProfile.typographyRules,
          promptFormula: parsed.promptFormula || defaultProfile.promptFormula,
        },
      });
      return;
    } catch (aiErr: any) {
      console.warn("Using local instruction analyzer fallback:", aiErr?.message);
      res.json({
        success: true,
        profile: defaultProfile,
      });
    }
  } catch (err: any) {
    console.error("Error in analyze-image-instructions:", err);
    res.status(500).json({ error: "Failed to analyze instructions." });
  }
});

// 6.2 Expand a short word/message into a complete beautiful motivational message + visual prompt
app.post("/api/expand-motivational-message", async (req: Request, res: Response) => {
  try {
    const {
      shortInput = "",
      instructionsText = "",
      promptFormula = "",
      language = "urdu",
      bgStyle = "cinematic_dark",
    } = req.body;

    const cleanSeed = String(shortInput || "کامیابی اور محنت").trim();

    // Local smart expansion fallback
    const fallbackItem =
      RICH_MOTIVATIONAL_LIBRARY.find((item) =>
        cleanSeed.includes(item.topic.split(" ")[0])
      ) || RICH_MOTIVATIONAL_LIBRARY[Math.floor(Math.random() * RICH_MOTIVATIONAL_LIBRARY.length)];

    let result = {
      headlineUrdu: cleanSeed.length <= 25 ? cleanSeed : fallbackItem.headlineUrdu,
      messageUrdu:
        cleanSeed.split(/\s+/).length >= 8
          ? cleanSeed
          : `«${cleanSeed}» — ${fallbackItem.messageUrdu}`,
      messageEnglish: fallbackItem.messageEnglish,
      visualPrompt: `${promptFormula || "Cinematic luxury background"}, inspired by "${cleanSeed}", ${fallbackItem.visualPrompt}`,
    };

    try {
      const ai = getGeminiClient();
      const response = await generateWithFallback(ai, {
        contents: `The user provided a short seed word, phrase, or topic: "${cleanSeed}"
Master Style Instructions: "${instructionsText || promptFormula || "Motivational marketing post"}"
Language preference: ${language}
Background style: ${bgStyle}

Transform this short input into a deeply inspiring, eloquent, heart-touching daily motivational post.
Even if the user only wrote 1 or 2 words (like "صبر", "محنت", "Motivational 1", "کامیابی"), craft a complete, powerful motivational quote from it!

Return valid JSON:
{
  "headlineUrdu": "Short 3 to 6 word powerful title in authentic Urdu",
  "messageUrdu": "Complete, eloquent 18 to 30 word motivational message in authentic Urdu",
  "messageEnglish": "1-sentence inspiring English motivational line matching the Urdu message",
  "visualPrompt": "Detailed English visual background description matching the master instructions and mood (no text in background)"
}`,
        config: {
          temperature: 0.75,
          responseMimeType: "application/json",
        },
      });

      const raw = response.text?.trim() || "{}";
      const cleaned = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.messageUrdu) {
        result = {
          headlineUrdu: parsed.headlineUrdu || result.headlineUrdu,
          messageUrdu: parsed.messageUrdu,
          messageEnglish: parsed.messageEnglish || result.messageEnglish,
          visualPrompt: parsed.visualPrompt || result.visualPrompt,
        };
      }
    } catch (aiErr: any) {
      console.warn("Fallback used for expand-motivational-message:", aiErr?.message);
    }

    const visualUrl = getCuratedSceneVisual(result.visualPrompt, Math.floor(Math.random() * 8) + 1);

    res.json({
      success: true,
      ...result,
      visualUrl,
    });
  } catch (err: any) {
    console.error("Error expanding motivational message:", err);
    res.status(500).json({ error: "Failed to expand motivational message." });
  }
});

// ============================================================================
// 6.2.1 TWO-STAGE PROFESSIONAL AI IMAGE ENGINE & SERVER-SIDE SCHEDULER
// ============================================================================

// Helper to attempt image generation with dedicated Gemini native image models
// Kept safe and silent: in free mode without paid billing, returns fallback immediately
async function generateWithNativeImageModels(
  _ai: GoogleGenAI,
  _visualBrief: string,
  _referenceBase64?: string
): Promise<{ imageUrl: string | null; engine: string }> {
  // In 100% Free Tier mode, avoid calling paid nano banana models that trigger 429 ResourceExhausted errors
  return { imageUrl: null, engine: "curated_fallback" };
}

// Persistent Storage Paths for Server-Side Schedule & Gallery
const DATA_DIR = path.join(process.cwd(), "data");
const GALLERY_FILE = path.join(DATA_DIR, "gallery.json");
const SCHEDULE_FILE = path.join(DATA_DIR, "schedule.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadServerGallery(): any[] {
  ensureDataDir();
  try {
    if (fs.existsSync(GALLERY_FILE)) {
      return JSON.parse(fs.readFileSync(GALLERY_FILE, "utf-8"));
    }
  } catch (e) {
    console.warn("Error reading server gallery file:", e);
  }
  return [];
}

function saveServerGallery(items: any[]) {
  ensureDataDir();
  try {
    fs.writeFileSync(GALLERY_FILE, JSON.stringify(items.slice(0, 50), null, 2));
  } catch (e) {
    console.warn("Error saving server gallery file:", e);
  }
}

function loadServerSchedule(): any | null {
  ensureDataDir();
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf-8"));
    }
  } catch (e) {
    console.warn("Error reading server schedule file:", e);
  }
  return null;
}

function saveServerSchedule(schedule: any | null) {
  ensureDataDir();
  try {
    if (schedule) {
      fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));
    } else if (fs.existsSync(SCHEDULE_FILE)) {
      fs.unlinkSync(SCHEDULE_FILE);
    }
  } catch (e) {
    console.warn("Error saving server schedule file:", e);
  }
}

// Helper: Get Current Pakistan Standard Time (PKT UTC+05:00)
function getServerPKT(): { dateStr: string; timeStr: string; hours: number; minutes: number } {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const dateStr = `${getPart("day")} ${getPart("month")}`;
  const timeStr = `${getPart("hour")}:${getPart("minute")} ${getPart("dayPeriod").toUpperCase()}`;

  const options24: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Karachi",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  };
  const parts24 = new Intl.DateTimeFormat("en-US", options24).formatToParts(now);
  const hours = parseInt(parts24.find((p) => p.type === "hour")?.value || "0", 10);
  const minutes = parseInt(parts24.find((p) => p.type === "minute")?.value || "0", 10);

  return { dateStr, timeStr, hours, minutes };
}

// Two-Stage Generator Core Function (Used by single image API and daily scheduler)
async function executeTwoStageImageGeneration(params: {
  prompt: string;
  referenceImage?: string;
  previousMessages?: string[];
  dayNumber?: number;
  imageNumber?: number;
  isDaily?: boolean;
  visualCategory?: string; // Optional user category override
  brandName?: string;
  requestedAspectRatio?: string;
  requestedNumImages?: number;
}): Promise<any> {
  const {
    prompt = "",
    referenceImage = "",
    previousMessages = [],
    dayNumber = 1,
    imageNumber = 1,
    isDaily = false,
    visualCategory = "",
    brandName = "",
    requestedAspectRatio = "1:1",
    requestedNumImages = 2,
  } = params;

  const userPrompt = String(prompt || "").trim() || "روزانہ موٹیویشنل اور کامیابی کا پیغام";

  // Check for explicit Urdu text in prompt
  const urduBlocks = userPrompt.match(/[\u0600-\u06FF][\u0600-\u06FF\s،۔؛؟!«»"'()0-9]+/g);
  const hasExplicitUrdu = Boolean(urduBlocks && urduBlocks.join(" ").trim().length > 10);
  const rawUserUrdu = hasExplicitUrdu ? urduBlocks!.map((b) => b.trim()).filter(Boolean).join(" ") : "";

  // Check GNZEE MARKET or custom brand request
  const isGnzeeRequested = /gnzee\s*market|gnzee/i.test(userPrompt) || /gnzee/i.test(brandName || "");

  const ai = getGeminiClient();

  const libraryIndex = (dayNumber * 3 + imageNumber) % RICH_MOTIVATIONAL_LIBRARY.length;
  const fallback = RICH_MOTIVATIONAL_LIBRARY[libraryIndex];

  let result = {
    headline: hasExplicitUrdu ? "" : fallback.headlineUrdu,
    quote: hasExplicitUrdu ? rawUserUrdu : fallback.messageUrdu,
    brandName: isGnzeeRequested ? "GNZEE MARKET" : brandName || "",
    hasLogo: Boolean(isGnzeeRequested || (brandName && brandName.trim())),
    logoPosition: "top_center",
    visualPrompt: fallback.visualPrompt,
    visualBrief: fallback.visualPrompt,
    visualCategory: visualCategory && visualCategory !== "auto" ? visualCategory : "motivation_success",
    colorPalette: isGnzeeRequested ? "gnzee_navy_gold" : "gold_black",
    aspectRatio: requestedAspectRatio || "1:1",
    numberOfImages: requestedNumImages || 2,
    visualUrl: "",
    engineUsed: "curated_fallback",
  };

  // STAGE 1: AI CREATIVE DIRECTOR
  // Uses Gemini reasoning model to analyze user prompt and synthesize an exhaustive Visual Production Brief
  try {
    const prevContext = Array.isArray(previousMessages) && previousMessages.length > 0
      ? `DO NOT repeat any of these previously generated quotes/themes:\n- ${previousMessages.slice(-15).join("\n- ")}`
      : "";

    const systemInstruction = `You are an elite Creative Director and Production Designer.
Your job is to transform the user's prompt (written in Urdu, Hindi, Roman Urdu, or English) into an exhaustive, high-end Visual Production Brief.

PRIMARY DIRECTIVES:
1. MULTILINGUAL UNDERSTANDING:
   - Understand English, Urdu script, Hindi, and Roman Urdu (e.g. "sabr aur shukar ki post", "mehnat ka phal", "maa baap ki azmat").
   - If user provided explicit Urdu text to be shown, keep it 100% LOCKED verbatim in "quote".
   - If user wrote only an instruction/topic, synthesize a deep, inspiring 18-28 word Urdu quote centered specifically on THAT topic.

2. LOGO & BRANDING DETECTION:
   - ONLY set "hasLogo": true if the user explicitly asked for a logo, watermark, emblem, or brand name (e.g. "add logo", "GNZEE MARKET", "brand name", "logo lagao", "لوگو لگانا", "لوگو لگا دینا", "علی خان لکھ دینا").
   - If the user DID NOT ask for a logo or brand, set "hasLogo": false and "brandName": "". NEVER add unsolicited logos or watermarks!
   - If logo requested, determine "logoPosition": "top_center" | "top_right" | "top_left" | "bottom_center" | "bottom_right".

3. ASPECT RATIO DETECTION:
   - Check if user asked for "9:16", "story", "reel", "vertical", "portrait" -> "9:16".
   - If user asked for "16:9", "horizontal", "landscape", "youtube", "wallpaper" -> "16:9".
   - Otherwise default to "${requestedAspectRatio || "1:1"}".

4. NUMBER OF IMAGES DETECTION:
   - If user asked for a specific number of images (e.g. "1 image", "2 images", "3 images", "4 images", "4 تصویریں", "ایک تصویر"), return that integer (1 to 4).
   - Otherwise default to ${requestedNumImages || 2}.

5. VISUAL BRIEF & CATEGORY:
   - "visualBrief": exhaustive 70-110 word English prompt detailing: Subject, narrative mood, lighting (golden hour, volumetric rays, rim lighting), composition, textures, cinematic depth of field (sharp focus, clean composition, 8k resolution, photorealistic, no blur, no watermark).
   - "visualCategory": pick the best match from:
     ['spirituality_islamic', 'family_parents', 'majestic_wildlife', 'hard_work_craftsman', 'wisdom_study', 'motivation_success', 'rain_peace_contemplation', 'morning_dawn_tea', 'friendship_loyalty', 'business_commerce', 'wealth_luxury_time', 'automotive', 'driver_portrait', 'technology', 'fitness_sports', 'nature', 'ocean_sea', 'space_galaxy', 'historical_heritage', 'food_dining', 'real_estate', 'perseverance_growth']

Return strictly valid JSON:
{
  "headline": "Short 2-4 word Urdu title fitting the topic",
  "quote": "The exact user Urdu text verbatim, or an eloquent Urdu quote tailored specifically to the user's prompt",
  "hasLogo": boolean,
  "brandName": "Brand name if requested, else empty string",
  "logoPosition": "top_center" | "top_right" | "top_left" | "bottom_center" | "bottom_right",
  "aspectRatio": "1:1" | "9:16" | "16:9",
  "numberOfImages": 1 | 2 | 3 | 4,
  "visualCategory": "one exact category name from the list above",
  "colorPalette": "gold_black" | "emerald_royal" | "midnight_blue" | "warm_sunset" | "gnzee_navy_gold" | "clean_light",
  "visualBrief": "Exhaustive English visual production brief (sharp focus, clean composition, good lighting, no blur, no watermark)"
}`;

    const parts: any[] = [];
    if (referenceImage && typeof referenceImage === "string" && referenceImage.startsWith("data:image")) {
      const match = referenceImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: { mimeType: match[1], data: match[2] },
        });
      }
    }

    parts.push({
      text: `USER PROMPT: "${userPrompt}"
Preferred Category: ${visualCategory && visualCategory !== "auto" ? visualCategory : "Auto-detect with full AI sense"}
Brand Name: ${brandName || (isGnzeeRequested ? "GNZEE MARKET" : "None")}
Context: ${isDaily ? `Day ${dayNumber}, Image ${imageNumber}` : `Single immediate generation, Image ${imageNumber}`}
Requested Aspect Ratio: ${requestedAspectRatio || "1:1"}
Requested Image Count: ${requestedNumImages || 2}
${prevContext}

Synthesize the Stage-1 Creative Director Visual Production Brief matching the topic smartly:`,
    });

    const response = await generateWithFallback(ai, {
      contents: { parts },
      config: {
        systemInstruction,
        temperature: 0.5,
        responseMimeType: "application/json",
      },
    });

    const raw = response.text?.trim() || "{}";
    const cleaned = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.quote) {
      result.headline = parsed.headline || result.headline;
      result.quote = parsed.quote;
      const userAskedLogo = Boolean(parsed.hasLogo || isGnzeeRequested || (brandName && brandName.trim()));
      result.hasLogo = userAskedLogo;
      result.logoPosition = parsed.logoPosition || "top_center";
      result.brandName = userAskedLogo ? (isGnzeeRequested ? "GNZEE MARKET" : (brandName || parsed.brandName || "")) : "";
      if (parsed.aspectRatio) {
        result.aspectRatio = parsed.aspectRatio;
      }
      if (parsed.numberOfImages && typeof parsed.numberOfImages === "number") {
        result.numberOfImages = Math.min(Math.max(parsed.numberOfImages, 1), 4);
      }
      result.colorPalette = isGnzeeRequested ? "gnzee_navy_gold" : parsed.colorPalette || result.colorPalette;
      result.visualPrompt = parsed.visualBrief || result.visualPrompt;
      result.visualBrief = parsed.visualBrief || result.visualBrief;
      if (parsed.visualCategory && THEMED_VISUALS[parsed.visualCategory]) {
        result.visualCategory = parsed.visualCategory;
      }
    }
  } catch (aiErr: any) {
    console.warn("Stage 1 Creative Director fallback:", aiErr?.message);
  }

  // Text Verification: guarantee user Urdu text is 100% locked
  if (hasExplicitUrdu && rawUserUrdu) {
    const userWords = rawUserUrdu.split(/\s+/).filter((w) => w.length > 1);
    const quoteWords = result.quote.split(/\s+/);
    const missingWords = userWords.filter((w) => !quoteWords.some((qw) => qw.includes(w) || w.includes(qw)));
    if (missingWords.length > 2 || result.quote.length < rawUserUrdu.length * 0.7) {
      result.quote = rawUserUrdu;
    }
  }

  // STAGE 2: 100% FREE HIGH-RESOLUTION THEMATIC VISUAL SCENE ENGINE
  // (Zero 429 quota errors, zero costs, instant delivery)
  // Check if user manually forced a category or AI deduced one
  const targetCategory = (visualCategory && visualCategory !== "auto") ? visualCategory : result.visualCategory;

  if (referenceImage && typeof referenceImage === "string" && referenceImage.length > 20) {
    result.visualUrl = referenceImage;
    result.engineUsed = "reference_image";
  } else {
    result.visualUrl = getCuratedSceneVisual(
      userPrompt + " " + result.visualBrief + " " + result.visualPrompt,
      dayNumber + imageNumber,
      targetCategory
    );
    result.engineUsed = `free_cinematic_${targetCategory}`;
  }

  return result;
}

// API: Generate Single or Daily Image Item
app.post("/api/generate-simple-image-item", async (req: Request, res: Response) => {
  try {
    const data = await executeTwoStageImageGeneration(req.body);
    res.json({
      success: true,
      ...data,
    });
  } catch (err: any) {
    console.error("Error in generate-simple-image-item:", err);
    res.status(500).json({ error: "Failed to generate image content." });
  }
});

// Gallery API Routes
app.get("/api/gallery", (_req: Request, res: Response) => {
  const gallery = loadServerGallery();
  res.json({ success: true, gallery });
});

app.post("/api/gallery", (req: Request, res: Response) => {
  try {
    const item = req.body;
    if (!item || !item.id) {
      res.status(400).json({ error: "Invalid item" });
      return;
    }
    const gallery = loadServerGallery();
    const updated = [item, ...gallery.filter((g: any) => g.id !== item.id)];
    saveServerGallery(updated);
    res.json({ success: true, count: updated.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to save gallery item." });
  }
});

app.delete("/api/gallery/:id", (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const gallery = loadServerGallery();
    const updated = gallery.filter((g: any) => g.id !== id);
    saveServerGallery(updated);
    res.json({ success: true, count: updated.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete gallery item." });
  }
});

// Server-Side Schedule API Routes
app.get("/api/schedule/status", (_req: Request, res: Response) => {
  const schedule = loadServerSchedule();
  const pkt = getServerPKT();
  res.json({
    success: true,
    schedule,
    pktTime: pkt.timeStr,
    pktDate: pkt.dateStr,
  });
});

app.post("/api/schedule/start", (req: Request, res: Response) => {
  try {
    const { imagesPerDay = 2, daysCount = 10, scheduledTime = "08:00", prompt = "", referenceImage = "" } = req.body;
    const schedule = {
      id: `sched-${Date.now()}`,
      imagesPerDay: Number(imagesPerDay) || 2,
      daysCount: Number(daysCount) || 10,
      scheduledTime: String(scheduledTime || "08:00"),
      prompt: String(prompt || ""),
      referenceImage: String(referenceImage || ""),
      startedAtDate: new Date().toISOString(),
      lastGeneratedDay: 1, // Day 1 generated upon start
      totalQuota: (Number(imagesPerDay) || 2) * (Number(daysCount) || 10),
      isActive: true,
    };
    saveServerSchedule(schedule);
    res.json({ success: true, schedule });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to start schedule on server." });
  }
});

app.post("/api/schedule/stop", (_req: Request, res: Response) => {
  saveServerSchedule(null);
  res.json({ success: true, message: "Schedule stopped" });
});

// Background Server Scheduler Loop (runs every 60s in Pakistan Standard Time PKT)
setInterval(async () => {
  try {
    const schedule = loadServerSchedule();
    if (!schedule || !schedule.isActive) return;

    const pkt = getServerPKT();
    const [targetH, targetM] = schedule.scheduledTime.split(":").map((s: string) => parseInt(s, 10));

    const started = new Date(schedule.startedAtDate);
    const now = new Date();
    const diffMs = now.getTime() - started.getTime();
    const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    const currentExpectedDay = Math.min(schedule.daysCount, Math.max(1, daysElapsed));

    const isPastTargetTime = pkt.hours > targetH || (pkt.hours === targetH && pkt.minutes >= targetM);

    if (currentExpectedDay > schedule.lastGeneratedDay && isPastTargetTime) {
      const nextDay = schedule.lastGeneratedDay + 1;
      console.log(`[Server-Scheduler PKT] Automatically generating scheduled Day ${nextDay} (${schedule.imagesPerDay} images)...`);

      const gallery = loadServerGallery();
      const prevQuotes = gallery.slice(0, 15).map((g: any) => g.quote);

      for (let idx = 1; idx <= schedule.imagesPerDay; idx++) {
        try {
          const itemData = await executeTwoStageImageGeneration({
            prompt: schedule.prompt,
            referenceImage: schedule.referenceImage,
            previousMessages: prevQuotes,
            dayNumber: nextDay,
            imageNumber: idx,
            isDaily: true,
          });

          const newItem = {
            id: `server-daily-d${nextDay}-i${idx}-${Date.now()}`,
            title: itemData.headline || itemData.quote.slice(0, 35),
            quote: itemData.quote,
            brandName: itemData.brandName,
            colorPalette: itemData.colorPalette,
            dataUrl: itemData.visualUrl, // Background image
            createdAtTime: pkt.timeStr,
            createdDateStr: pkt.dateStr,
            dayLabel: `Day ${nextDay}`,
            scheduledTime: pkt.timeStr,
            isDaily: true,
            engineUsed: itemData.engineUsed,
          };

          gallery.unshift(newItem);
        } catch (itemErr) {
          console.warn(`Error generating day ${nextDay} image ${idx}:`, itemErr);
        }
      }

      saveServerGallery(gallery);
      schedule.lastGeneratedDay = nextDay;
      if (nextDay >= schedule.daysCount) {
        schedule.isActive = false;
      }
      saveServerSchedule(schedule);
      console.log(`[Server-Scheduler PKT] Completed Day ${nextDay} generation and saved to gallery.`);
    }
  } catch (schedErr) {
    console.warn("[Server-Scheduler] Error in tick:", schedErr);
  }
}, 60000);

// 6.3 Generate Multi-Day Quota Board (e.g. 10 Days x 2 Images, 15 Days x 3 Images, up to 5/day)
app.post("/api/generate-quota-board", async (req: Request, res: Response) => {
  try {
    const {
      daysCount = 10,
      imagesPerDay = 2,
      masterTopic = "کامیابی، محنت اور موٹیویشن",
      separatePrompts = "",
      instructionsText = "",
      promptFormula = "",
      language = "urdu",
      bgStyle = "cinematic_dark",
      dailyTimes = ["09:00", "18:00", "13:00", "21:00", "07:00"],
    } = req.body;

    const safeDays = Math.max(1, Math.min(30, Number(daysCount) || 10));
    const safePerDay = Math.max(1, Math.min(5, Number(imagesPerDay) || 2));
    const totalImages = safeDays * safePerDay;

    // Parse separate prompts if user provided e.g. "Motivational 1, 2, 3" or line-by-line topics
    const customLines = String(separatePrompts || "")
      .split(/\r?\n|,|،/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let generatedItems: Array<{
      headlineUrdu: string;
      messageUrdu: string;
      messageEnglish: string;
      visualPrompt: string;
    }> = [];

    try {
      const ai = getGeminiClient();
      const batchLimit = Math.min(totalImages, 30); // Generate up to 30 distinct items in one fast JSON call and cycle/expand if more
      const response = await generateWithFallback(ai, {
        contents: `Create a ${safeDays}-day Motivational & Marketing Image Content Plan (${safePerDay} images per day, generating ${batchLimit} distinct posts).
Master Topic / Theme: "${masterTopic || "Daily Motivational & Success Quotes"}"
Specific / Separate Prompts (if any): "${customLines.join(" | ") || "Auto-generate diverse motivational themes"}"
Saved Master Style Instructions: "${instructionsText || promptFormula || "Luxury motivational poster"}"
Language: ${language}

Rules:
1. Even if a prompt is very short (like "Motivational 1", "صبر", "کامیابی"), expand each one into a unique, heart-touching, complete Urdu motivational quote (16-28 words) + a short Urdu headline (3-6 words) + a 1-line English quote.
2. Make every single post unique, inspiring, and tailored for daily social media marketing.
3. Return a JSON array of objects:
[
  {
    "headlineUrdu": "3-6 word Urdu title",
    "messageUrdu": "16-28 word complete inspiring Urdu quote",
    "messageEnglish": "1-sentence English motivational quote",
    "visualPrompt": "English description of background scene matching instructions"
  }
]`,
        config: {
          temperature: 0.8,
          responseMimeType: "application/json",
        },
      });

      const raw = response.text?.trim() || "[]";
      const cleaned = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        generatedItems = parsed;
      }
    } catch (aiErr: any) {
      console.warn("Using rich local library for quota board generation:", aiErr?.message);
    }

    const boardItems: any[] = [];
    let itemIndex = 0;

    for (let day = 1; day <= safeDays; day++) {
      for (let slot = 1; slot <= safePerDay; slot++) {
        const libItem = RICH_MOTIVATIONAL_LIBRARY[itemIndex % RICH_MOTIVATIONAL_LIBRARY.length];
        const aiItem = generatedItems.length > 0 ? generatedItems[itemIndex % generatedItems.length] : null;
        const customPromptSeed = customLines.length > 0 ? customLines[itemIndex % customLines.length] : "";

        const headlineUrdu =
          aiItem?.headlineUrdu ||
          (customPromptSeed && customPromptSeed.length <= 28 ? customPromptSeed : libItem.headlineUrdu);

        const messageUrdu =
          aiItem?.messageUrdu ||
          (customPromptSeed && customPromptSeed.split(/\s+/).length > 6
            ? customPromptSeed
            : customPromptSeed
            ? `${customPromptSeed} — ${libItem.messageUrdu}`
            : libItem.messageUrdu);

        const messageEnglish = aiItem?.messageEnglish || libItem.messageEnglish;
        const visualPrompt = `${promptFormula || instructionsText || "Cinematic luxury background"}. ${
          aiItem?.visualPrompt || libItem.visualPrompt
        }`;
        const visualUrl = getCuratedSceneVisual(visualPrompt + " " + bgStyle, itemIndex + 1);

        boardItems.push({
          id: `quota-d${day}-s${slot}-${Date.now()}-${itemIndex}`,
          dayNumber: day,
          slotNumber: slot,
          scheduledTime: dailyTimes[(slot - 1) % dailyTimes.length] || "09:00",
          seedTopic: customPromptSeed || masterTopic || libItem.topic,
          headlineUrdu,
          messageUrdu,
          messageEnglish,
          visualPrompt,
          visualUrl,
          status: "planned",
        });

        itemIndex++;
      }
    }

    res.json({
      success: true,
      daysCount: safeDays,
      imagesPerDay: safePerDay,
      totalQuota: totalImages,
      items: boardItems,
    });
  } catch (err: any) {
    console.error("Error generating quota board:", err);
    res.status(500).json({ error: "Failed to generate quota board." });
  }
});

// ============================================================================
// 7. SOCIAL MEDIA AUTOMATION HUB & QUEUE SYSTEM (Facebook Page & TikTok)
// Architecture: Google AI Studio -> Google Drive -> Zapier -> Buffer -> Facebook/TikTok
// ============================================================================

export interface SocialMediaPostItem {
  id: string;
  fileId: string;
  fileName: string;
  driveUrl: string;
  contentType: 'image' | 'video';
  caption: string;
  hashtags: string[];
  targetPlatform: 'facebook' | 'tiktok';
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // "08:00 AM"
  status: 'READY' | 'QUEUED' | 'SENT TO MAKE' | 'FAILED' | 'PAUSED' | 'NEEDS APPROVAL' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
  bufferId?: string;
  errorMessage?: string;
  errorType?: 'drive' | 'make' | 'zapier' | 'buffer' | 'facebook' | 'tiktok' | 'auth' | 'unsupported';
  needsManualAction?: boolean;
  manualActionReason?: string;
  approvedByUser: boolean;
  dispatchedAt?: string;
  createdAt: string;
}

export interface SocialMediaSettings {
  autoMode: boolean; // AUTO ON/OFF switch (Default: false)
  dailyLimit: number; // Daily max posts (Default: 2)
  todayDispatchedCount: number;
  todayDispatchedDate: string; // YYYY-MM-DD in PKT
  sendBothPlatforms: boolean; // Sends Facebook + TikTok reminder per image
  makeWebhookUrl: string;
  makeStatus?: 'DISCONNECTED' | 'CONNECTED' | 'TEST SUCCESSFUL' | 'FAILED';
  makeLastTestedAt?: string;
  dispatchedFileIds: string[]; // Prevents double posting
  // Backwards compatibility for existing state:
  zapierWebhookUrl?: string;
  zapierStatus?: 'DISCONNECTED' | 'CONNECTED' | 'TEST SUCCESSFUL';
  zapierLastTestedAt?: string;
  isPaused: boolean;
  autoPublish: boolean;
  manualApproval: boolean;
  captionAutoGenerate: boolean;
  hashtagsAutoGenerate: boolean;
  facebookPageName: string;
  driveFolder: {
    folderName: string;
    folderId: string;
    publishedFolderName: string;
  };
  postingPeriod: {
    type: '10_days' | '30_days' | 'custom';
    customDays: number;
  };
  platforms: {
    facebook: {
      enabled: boolean;
      dailyPosts: number;
      times: string[];
    };
    tiktok: {
      enabled: boolean;
      dailyPosts: number;
      times: string[];
    };
  };
  imageFolder?: {
    folderName: string;
    folderId: string;
    folderUrl?: string;
  };
  videoFolder?: {
    folderName: string;
    folderId: string;
    folderUrl?: string;
  };
  dispatchLogs?: Array<{
    id: string;
    fileName: string;
    platform: string;
    statusText: string;
    success: boolean;
    timestamp: string;
    error?: string;
  }>;
  googleDriveAuth?: {
    connected: boolean;
    folderAccessible?: boolean;
    folderId?: string;
    fileCountFound?: number;
    verifyError?: string | null;
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    userEmail?: string;
    userName?: string;
    savedAt?: string;
  };
  schedule?: {
    time1: string;
    time2: string;
    time3?: string;
    dailyLimit: number;
    lastDispatchedSlot?: string;
  };
}

// Connector interface matching GNZEE Social Hub
export interface ConnectorItem {
  id: string;
  n: string;
  c: string;
  l: string;
  u: string;
  status: 'on' | 'wait' | 'off';
  lastUpdated?: string;
  account?: string;
}

const DEFAULT_CONNECTORS: Record<string, ConnectorItem> = {
  drive: { id: "drive", n: "Google Drive", c: "#1a73e8", l: "D", u: "https://drive.google.com", status: "off" },
  facebook: { id: "facebook", n: "Facebook Page", c: "#1877f2", l: "f", u: "https://www.facebook.com/login", status: "off" },
  youtube: { id: "youtube", n: "YouTube", c: "#d93025", l: "Y", u: "https://studio.youtube.com", status: "off" },
  instagram: { id: "instagram", n: "Instagram", c: "#c13584", l: "I", u: "https://www.instagram.com/accounts/login/", status: "off" },
  tiktok: { id: "tiktok", n: "TikTok", c: "#222", l: "T", u: "https://www.tiktok.com/login", status: "off" },
};

let activeConnectors: Record<string, ConnectorItem> = { ...DEFAULT_CONNECTORS };

// In-memory persistent state with sensible defaults
let socialSettings: SocialMediaSettings = {
  autoMode: false,
  dailyLimit: 3,
  todayDispatchedCount: 0,
  todayDispatchedDate: new Date().toISOString().slice(0, 10),
  sendBothPlatforms: true,
  makeWebhookUrl: (process.env.MAKE_WEBHOOK_URL || '').trim(),
  makeStatus: (process.env.MAKE_WEBHOOK_URL && process.env.MAKE_WEBHOOK_URL.trim()) ? 'CONNECTED' : 'DISCONNECTED',
  dispatchedFileIds: [],
  dispatchLogs: [],
  schedule: {
    time1: '08:00 AM',
    time2: '02:00 PM',
    time3: '06:00 PM',
    dailyLimit: 3,
    lastDispatchedSlot: '',
  },
  imageFolder: {
    folderName: 'Image ready to post',
    folderId: '1_Z5-fWGOK8eOW2nPyCrFtQ-8iaaQc_QQ',
    folderUrl: 'https://drive.google.com/drive/folders/1_Z5-fWGOK8eOW2nPyCrFtQ-8iaaQc_QQ',
  },
  videoFolder: {
    folderName: 'Vedio ready to post',
    folderId: '1EzfXVDQ91hvq3M4hlk9UhnT5IBJZY4mM',
    folderUrl: 'https://drive.google.com/drive/folders/1EzfXVDQ91hvq3M4hlk9UhnT5IBJZY4mM',
  },
  zapierWebhookUrl: (process.env.MAKE_WEBHOOK_URL || '').trim(),
  zapierStatus: 'DISCONNECTED',
  isPaused: false,
  autoPublish: false,
  manualApproval: true,
  captionAutoGenerate: true,
  hashtagsAutoGenerate: true,
  facebookPageName: 'GNZEE Market',
  driveFolder: {
    folderName: 'Grok tools',
    folderId: (process.env.DRIVE_ROOT_ID || '1nM8BeH7Nnb9MMRIoA23qEmTrLbi19Gsg').trim(),
    publishedFolderName: 'GNZEE Market / Published',
  },
  postingPeriod: {
    type: '10_days',
    customDays: 10,
  },
  platforms: {
    facebook: {
      enabled: true,
      dailyPosts: 2,
      times: ['08:00 AM', '08:00 PM'],
    },
    tiktok: {
      enabled: true,
      dailyPosts: 2,
      times: ['10:00 AM', '08:00 PM'],
    },
  },
};

// Queue persistence directory supporting Cloud Persistent Disks/Volumes (Render, Railway, Cloud Run)
// Defaults to ./data inside the project (gitignored) so runtime JSON files never clutter the workspace root
let activeDataDir = (process.env.DATA_DIR || process.env.STORAGE_DIR || path.join(process.cwd(), 'data')).trim();
try {
  if (!fs.existsSync(activeDataDir)) {
    fs.mkdirSync(activeDataDir, { recursive: true });
  }
  const testFile = path.join(activeDataDir, `.write_test_${Date.now()}`);
  fs.writeFileSync(testFile, 'ok', 'utf-8');
  fs.unlinkSync(testFile);
} catch (dirErr: any) {
  console.warn(
    `[Storage Notice] Configured DATA_DIR "${activeDataDir}" is unwritable (${dirErr?.message || dirErr}). Defaulting to local ./data directory.`
  );
  activeDataDir = path.join(process.cwd(), 'data');
  try {
    if (!fs.existsSync(activeDataDir)) {
      fs.mkdirSync(activeDataDir, { recursive: true });
    }
  } catch {
    activeDataDir = process.cwd();
  }
}
const SOCIAL_DATA_DIR = activeDataDir;
const SOCIAL_QUEUE_FILE = path.join(SOCIAL_DATA_DIR, 'social_queue_store.json');
const SETTINGS_BACKUP_FILE = path.join(SOCIAL_DATA_DIR, '.social_settings_backup.json');
const CONNECTORS_FILE = path.join(SOCIAL_DATA_DIR, 'connectors_store.json');
const CONNECTORS_BACKUP_FILE = path.join(SOCIAL_DATA_DIR, '.connectors_backup.json');

function saveConnectorsToDisk() {
  try {
    const payload = JSON.stringify(
      {
        connectors: activeConnectors,
        makeWebhookUrl: socialSettings.makeWebhookUrl,
        makeStatus: socialSettings.makeStatus,
        googleDriveAuth: socialSettings.googleDriveAuth,
      },
      null,
      2
    );
    fs.writeFileSync(CONNECTORS_FILE, payload, 'utf-8');
    fs.writeFileSync(CONNECTORS_BACKUP_FILE, payload, 'utf-8');
  } catch (err) {
    console.warn('Could not save connectors to disk:', err);
  }
}

function loadConnectorsFromDisk() {
  try {
    let raw = '';
    const legacyBackup = path.join(process.cwd(), '.connectors_backup.json');
    const legacyStore = path.join(process.cwd(), 'connectors_store.json');
    if (fs.existsSync(CONNECTORS_FILE)) {
      raw = fs.readFileSync(CONNECTORS_FILE, 'utf-8');
    } else if (fs.existsSync(CONNECTORS_BACKUP_FILE)) {
      raw = fs.readFileSync(CONNECTORS_BACKUP_FILE, 'utf-8');
    } else if (fs.existsSync(legacyStore)) {
      raw = fs.readFileSync(legacyStore, 'utf-8');
    } else if (fs.existsSync(legacyBackup)) {
      raw = fs.readFileSync(legacyBackup, 'utf-8');
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.connectors && typeof parsed.connectors === 'object') {
        activeConnectors = { ...DEFAULT_CONNECTORS, ...parsed.connectors };
      }
      if (parsed.makeWebhookUrl && !socialSettings.makeWebhookUrl) {
        socialSettings.makeWebhookUrl = parsed.makeWebhookUrl;
      }
      if (parsed.googleDriveAuth && !socialSettings.googleDriveAuth) {
        socialSettings.googleDriveAuth = parsed.googleDriveAuth;
      }
      if (parsed.makeStatus) {
        socialSettings.makeStatus = parsed.makeStatus;
      }
    }
  } catch (err) {
    console.warn('Could not load connectors from disk:', err);
  }

  // Enforce connected defaults if environment or existing credentials are set
  if (socialSettings.googleDriveAuth?.connected || socialSettings.googleDriveAuth?.accessToken) {
    activeConnectors.drive.status = 'on';
  }
  if (process.env.MAKE_WEBHOOK_URL || (socialSettings.makeWebhookUrl && socialSettings.makeWebhookUrl.trim())) {
    socialSettings.makeStatus = 'CONNECTED';
  }
  if (socialSettings.platforms?.facebook?.enabled) {
    if (activeConnectors.facebook.status === 'off') {
      activeConnectors.facebook.status = 'on';
    }
  }
}

function saveQueueToDisk() {
  try {
    const data = JSON.stringify({ settings: socialSettings, queue: socialQueue }, null, 2);
    fs.writeFileSync(SOCIAL_QUEUE_FILE, data, 'utf-8');
    fs.writeFileSync(SETTINGS_BACKUP_FILE, data, 'utf-8');
    saveConnectorsToDisk();
  } catch (err) {
    console.warn('Could not save social queue to disk:', err);
  }
}

function loadQueueFromDisk() {
  try {
    let raw = '';
    const legacyQueue = path.join(process.cwd(), 'social_queue_store.json');
    const legacyBackup = path.join(process.cwd(), '.social_settings_backup.json');
    if (fs.existsSync(SOCIAL_QUEUE_FILE)) {
      raw = fs.readFileSync(SOCIAL_QUEUE_FILE, 'utf-8');
    } else if (fs.existsSync(SETTINGS_BACKUP_FILE)) {
      raw = fs.readFileSync(SETTINGS_BACKUP_FILE, 'utf-8');
    } else if (fs.existsSync(legacyQueue)) {
      raw = fs.readFileSync(legacyQueue, 'utf-8');
    } else if (fs.existsSync(legacyBackup)) {
      raw = fs.readFileSync(legacyBackup, 'utf-8');
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.queue)) {
        socialQueue = parsed.queue;
      }
      if (parsed.settings) {
        socialSettings = { ...socialSettings, ...parsed.settings };
        if (typeof parsed.settings.autoMode === 'boolean') {
          socialSettings.autoMode = parsed.settings.autoMode;
        }
        if (typeof parsed.settings.dailyLimit === 'number') {
          socialSettings.dailyLimit = parsed.settings.dailyLimit;
        }
        if (typeof parsed.settings.todayDispatchedCount === 'number') {
          socialSettings.todayDispatchedCount = parsed.settings.todayDispatchedCount;
        }
        if (typeof parsed.settings.todayDispatchedDate === 'string') {
          socialSettings.todayDispatchedDate = parsed.settings.todayDispatchedDate;
        }
        if (typeof parsed.settings.sendBothPlatforms === 'boolean') {
          socialSettings.sendBothPlatforms = parsed.settings.sendBothPlatforms;
        }
        if (parsed.settings.imageFolder && parsed.settings.imageFolder.folderId) {
          socialSettings.imageFolder = parsed.settings.imageFolder;
        }
        if (parsed.settings.videoFolder && parsed.settings.videoFolder.folderId) {
          socialSettings.videoFolder = parsed.settings.videoFolder;
        }
        if (Array.isArray(parsed.settings.dispatchLogs)) {
          socialSettings.dispatchLogs = parsed.settings.dispatchLogs;
        }
        if (parsed.settings.zapierWebhookUrl && !socialSettings.makeWebhookUrl) {
          socialSettings.makeWebhookUrl = parsed.settings.zapierWebhookUrl;
        }
        if (parsed.settings.makeWebhookUrl) {
          socialSettings.makeWebhookUrl = parsed.settings.makeWebhookUrl;
          socialSettings.makeStatus = 'CONNECTED';
        }
        if (!Array.isArray(socialSettings.dispatchedFileIds)) {
          socialSettings.dispatchedFileIds = [];
        }
        if (parsed.settings.schedule && typeof parsed.settings.schedule === 'object') {
          socialSettings.schedule = {
            time1: parsed.settings.schedule.time1 || '08:00 AM',
            time2: parsed.settings.schedule.time2 || '02:00 PM',
            time3: parsed.settings.schedule.time3 || '06:00 PM',
            dailyLimit: typeof parsed.settings.schedule.dailyLimit === 'number' ? parsed.settings.schedule.dailyLimit : 3,
            lastDispatchedSlot: parsed.settings.schedule.lastDispatchedSlot || '',
          };
        }
      }
    }
  } catch (err) {
    console.warn('Could not load social queue from disk:', err);
  }
}

let socialQueue: SocialMediaPostItem[] = [];

// Load saved state if exists
loadQueueFromDisk();
loadConnectorsFromDisk();
// Ensure queue and connector files are initialized on disk
saveQueueToDisk();
saveConnectorsToDisk();

// Helper: Format future scheduled ISO time e.g. "2026-10-06T08:00:00" in PKT (Asia/Karachi)
function getFutureScheduledIso(dateStr?: string, timeStr?: string): {
  date: string;
  time: string;
  iso: string;
} {
  const now = new Date();
  // Ensure date is at least tomorrow to prevent Buffer "past time" error
  const tomorrow = new Date(now.getTime() + 86400000);
  const tomorrowDateStr = tomorrow.toISOString().slice(0, 10);

  let targetDate = dateStr && dateStr >= tomorrowDateStr ? dateStr : tomorrowDateStr;
  let targetTime = timeStr || '08:00 AM';

  const match = targetTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  let h = 8;
  let m = 0;
  if (match) {
    h = parseInt(match[1], 10);
    m = parseInt(match[2], 10);
    const period = match[3]?.toUpperCase();
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
  }

  const hStr = h < 10 ? `0${h}` : `${h}`;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  const iso = `${targetDate}T${hStr}:${mStr}:00`;

  return { date: targetDate, time: targetTime, iso };
}

// Helper: Extract clean Drive File ID or return a valid fallback ID
function getCleanDriveFileId(rawUrl?: string, fileId?: string): string {
  if (rawUrl) {
    const match = rawUrl.match(/\/d\/([^/]+)/);
    if (match && match[1]) return match[1];
    const idMatch = rawUrl.match(/[?&]id=([^&]+)/);
    if (idMatch && idMatch[1]) return idMatch[1];
  }
  return fileId && fileId.replace(/^drive-manual-|^drive-file-|^file-/, '') || '1GNZEE_Market_Sample_File_ID';
}

// Helper: Get current time in Pakistan (Asia/Karachi, UTC+5)
function getPakistanTimeNow(): Date {
  const now = new Date();
  const pktStr = now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' });
  return new Date(pktStr);
}

// Helper: Get current date in Pakistan (Asia/Karachi, UTC+5) formatted as YYYY-MM-DD
function getPakistanDateString(): string {
  const pktNow = getPakistanTimeNow();
  const y = pktNow.getFullYear();
  const m = String(pktNow.getMonth() + 1).padStart(2, '0');
  const d = String(pktNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper: Automatically reset today's dispatched count when calendar day flips in Pakistan
function checkAndResetDailyLimit() {
  const today = getPakistanDateString();
  if (socialSettings.todayDispatchedDate !== today) {
    socialSettings.todayDispatchedDate = today;
    socialSettings.todayDispatchedCount = 0;
    saveQueueToDisk();
  }
}

// Helper: Check if post is due in Pakistan time
function isPostDuePakistanTime(scheduledDate?: string, scheduledTime?: string): boolean {
  if (!scheduledDate || scheduledDate === 'test') return true;
  const todayPktStr = getPakistanDateString();
  const pktNow = getPakistanTimeNow();

  if (scheduledDate < todayPktStr) return true; // Past date is due
  if (scheduledDate > todayPktStr) return false; // Future date is not due yet

  // If same day, check scheduled time
  let h = 8;
  let min = 0;
  if (scheduledTime) {
    const match = scheduledTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      h = parseInt(match[1], 10);
      min = parseInt(match[2], 10);
      const period = match[3]?.toUpperCase();
      if (period === 'PM' && h < 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
    }
  }

  const pktH = pktNow.getHours();
  const pktM = pktNow.getMinutes();
  if (pktH > h) return true;
  if (pktH === h && pktM >= min) return true;
  return false;
}

// Helper: Validate Urdu post content (ensure no broken/incomplete text, unreplaced placeholders)
function validateUrduPostContent(caption?: string): { isValid: boolean; reason?: string } {
  if (!caption || typeof caption !== 'string') {
    return { isValid: false, reason: 'کیپشن خالی ہے' };
  }
  const trimmed = caption.trim();
  if (trimmed.length < 15) {
    return { isValid: false, reason: 'اردو متن بہت مختصر یا ادھورا ہے (کم از کم 15 حروف لازمی ہیں)' };
  }
  // Check for unresolved placeholders
  if (/\[\s*.*?\s*\]|\bTODO\b|\bundefined\b|\bnull\b/i.test(trimmed)) {
    return { isValid: false, reason: 'اردو متن میں نامکمل جگہیں [Placeholder] باقی ہیں' };
  }
  return { isValid: true };
}

// Helper: Calculate summary counters
function getQueueSummary() {
  checkAndResetDailyLimit();
  const summary = {
    ready: 0,
    queued: 0,
    scheduled: 0,
    sentToMake: 0,
    published: 0,
    failed: 0,
    paused: 0,
    needsApproval: 0,
    archived: 0,
    total: socialQueue.length,
    dispatchedCount: socialSettings.dispatchedFileIds?.length || 0,
    autoMode: !!socialSettings.autoMode,
    dailyLimit: socialSettings.dailyLimit || 2,
    todayDispatchedCount: socialSettings.todayDispatchedCount || 0,
    todayDate: socialSettings.todayDispatchedDate || getPakistanDateString(),
  };

  for (const item of socialQueue) {
    if (item.status === 'READY') summary.ready++;
    else if (item.status === 'QUEUED') summary.queued++;
    else if (item.status === 'SENT TO MAKE') summary.sentToMake++;
    else if (item.status === 'SCHEDULED' || item.status === 'PUBLISHED') summary.sentToMake++;
    else if (item.status === 'FAILED') summary.failed++;
    else if (item.status === 'PAUSED') summary.paused++;
    else if (item.status === 'NEEDS APPROVAL') summary.needsApproval++;
    else if (item.status === 'ARCHIVED') summary.archived++;
  }
  return summary;
}

// 7.1 GET Social Settings & Status Summary
app.get('/api/social/settings', (_req: Request, res: Response) => {
  res.json({
    success: true,
    settings: socialSettings,
    summary: getQueueSummary(),
    pktTime: getPakistanTimeNow().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }),
  });
});

// 7.2 POST Update Social Settings
app.post('/api/social/settings', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    if (typeof updates !== 'object' || updates === null) {
      return res.status(400).json({ error: 'Invalid settings payload.' });
    }

    // Make.com Webhook URL
    if (typeof updates.makeWebhookUrl === 'string') {
      const trimmed = updates.makeWebhookUrl.trim();
      const changed = trimmed !== socialSettings.makeWebhookUrl;
      socialSettings.makeWebhookUrl = trimmed;
      if (!trimmed) {
        socialSettings.makeStatus = 'DISCONNECTED';
      } else if (changed && socialSettings.makeStatus !== 'TEST SUCCESSFUL') {
        socialSettings.makeStatus = 'CONNECTED';
      }
    }
    if (typeof updates.makeStatus === 'string') {
      socialSettings.makeStatus = updates.makeStatus;
    }

    // Backwards compatibility for zapierWebhookUrl input
    if (typeof updates.zapierWebhookUrl === 'string') {
      const trimmed = updates.zapierWebhookUrl.trim();
      if (!socialSettings.makeWebhookUrl || trimmed) {
        socialSettings.makeWebhookUrl = trimmed;
        socialSettings.makeStatus = trimmed ? (updates.zapierStatus || 'CONNECTED') : 'DISCONNECTED';
      }
      socialSettings.zapierWebhookUrl = trimmed;
      socialSettings.zapierStatus = updates.zapierStatus || (trimmed ? 'CONNECTED' : 'DISCONNECTED');
    }
    if (typeof updates.zapierStatus === 'string') {
      socialSettings.zapierStatus = updates.zapierStatus;
    }

    if (Array.isArray(updates.dispatchedFileIds)) {
      socialSettings.dispatchedFileIds = updates.dispatchedFileIds;
    }
    if (typeof updates.isPaused === 'boolean') {
      socialSettings.isPaused = updates.isPaused;
      // Also update statuses of queued items to PAUSED if pausing, or QUEUED if resuming
      if (updates.isPaused) {
        socialQueue.forEach((item) => {
          if (item.status === 'QUEUED' || item.status === 'READY') {
            item.status = 'PAUSED';
          }
        });
      } else {
        socialQueue.forEach((item) => {
          if (item.status === 'PAUSED') {
            item.status = 'QUEUED';
          }
        });
      }
    }
    if (typeof updates.autoPublish === 'boolean') {
      socialSettings.autoPublish = updates.autoPublish;
      if (updates.autoPublish) {
        socialSettings.manualApproval = false;
      }
    }
    if (typeof updates.manualApproval === 'boolean') {
      socialSettings.manualApproval = updates.manualApproval;
      if (updates.manualApproval) {
        socialSettings.autoPublish = false;
      }
    }
    if (typeof updates.captionAutoGenerate === 'boolean') {
      socialSettings.captionAutoGenerate = updates.captionAutoGenerate;
    }
    if (typeof updates.hashtagsAutoGenerate === 'boolean') {
      socialSettings.hashtagsAutoGenerate = updates.hashtagsAutoGenerate;
    }
    if (updates.driveFolder && typeof updates.driveFolder === 'object') {
      socialSettings.driveFolder = {
        ...socialSettings.driveFolder,
        ...updates.driveFolder,
      };
    }
    if (updates.postingPeriod && typeof updates.postingPeriod === 'object') {
      socialSettings.postingPeriod = {
        ...socialSettings.postingPeriod,
        ...updates.postingPeriod,
      };
    }
    if (updates.platforms && typeof updates.platforms === 'object') {
      if (updates.platforms.facebook) {
        socialSettings.platforms.facebook = {
          ...socialSettings.platforms.facebook,
          ...updates.platforms.facebook,
        };
      }
      if (updates.platforms.tiktok) {
        socialSettings.platforms.tiktok = {
          ...socialSettings.platforms.tiktok,
          ...updates.platforms.tiktok,
        };
      }
    }

    if (typeof updates.autoMode === 'boolean') {
      socialSettings.autoMode = updates.autoMode;
    }
    if (typeof updates.dailyLimit === 'number' && updates.dailyLimit > 0) {
      socialSettings.dailyLimit = updates.dailyLimit;
    }
    if (typeof updates.sendBothPlatforms === 'boolean') {
      socialSettings.sendBothPlatforms = updates.sendBothPlatforms;
    }
    if (typeof updates.todayDispatchedCount === 'number') {
      socialSettings.todayDispatchedCount = Math.max(0, updates.todayDispatchedCount);
    }
    if (updates.imageFolder && typeof updates.imageFolder === 'object') {
      socialSettings.imageFolder = {
        ...socialSettings.imageFolder,
        ...updates.imageFolder,
      };
    }
    if (updates.videoFolder && typeof updates.videoFolder === 'object') {
      socialSettings.videoFolder = {
        ...socialSettings.videoFolder,
        ...updates.videoFolder,
      };
    }
    if (Array.isArray(updates.dispatchedFileIds)) {
      socialSettings.dispatchedFileIds = updates.dispatchedFileIds;
    }
    if (Array.isArray(updates.dispatchLogs)) {
      socialSettings.dispatchLogs = updates.dispatchLogs;
    }
    if (updates.schedule && typeof updates.schedule === 'object') {
      socialSettings.schedule = {
        ...(socialSettings.schedule || { time1: '08:00 AM', time2: '02:00 PM', time3: '06:00 PM', dailyLimit: 3 }),
        ...updates.schedule,
      };
      if (typeof updates.schedule.dailyLimit === 'number') {
        socialSettings.dailyLimit = updates.schedule.dailyLimit;
      }
    }

    saveQueueToDisk();

    res.json({
      success: true,
      settings: socialSettings,
      summary: getQueueSummary(),
    });
  } catch (err: any) {
    console.error('Error updating social settings:', err);
    res.status(500).json({ error: 'Failed to update social settings.' });
  }
});

// 7.2.0 Minimal Free-First Integration Endpoints (GNZEE Social Hub)
app.get("/api/health", (_req: Request, res: Response) => {
  const isMakeConfigured = Boolean(
    (process.env.MAKE_WEBHOOK_URL && process.env.MAKE_WEBHOOK_URL.trim()) ||
    (socialSettings.makeWebhookUrl && socialSettings.makeWebhookUrl.trim())
  );
  res.json({
    status: "ok",
    ok: true,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    makeConfigured: isMakeConfigured,
    driveConfigured: Boolean(socialSettings.googleDriveAuth?.connected || activeConnectors.drive?.status === 'on'),
  });
});

app.post("/api/post", async (req: Request, res: Response) => {
  const hook = (process.env.MAKE_WEBHOOK_URL || socialSettings.makeWebhookUrl || '').trim();
  if (!hook) {
    return res.status(400).json({ error: "MAKE_WEBHOOK_URL is not set" });
  }
  try {
    const r = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const text = await r.text().catch(() => '');
    res.status(r.ok ? 200 : 502).json({ sent: r.ok, status: r.status, response: text });
  } catch (e: any) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

// 7.2.0.1 GNZEE Connectors Status Management (Permanent Across Sessions & Restarts)
app.get('/api/social/connectors', (_req: Request, res: Response) => {
  // Sync Drive status if auth exists
  if (socialSettings.googleDriveAuth?.connected || socialSettings.googleDriveAuth?.accessToken) {
    activeConnectors.drive.status = 'on';
  }
  // Sync Make status
  const hasHook = Boolean(
    (process.env.MAKE_WEBHOOK_URL && process.env.MAKE_WEBHOOK_URL.trim()) ||
    (socialSettings.makeWebhookUrl && socialSettings.makeWebhookUrl.trim())
  );
  if (hasHook) {
    socialSettings.makeStatus = 'CONNECTED';
  }

  res.json({
    success: true,
    connectors: Object.values(activeConnectors),
    connectorsMap: activeConnectors,
    makeWebhookUrl: socialSettings.makeWebhookUrl || process.env.MAKE_WEBHOOK_URL || '',
    makeStatus: socialSettings.makeStatus,
  });
});

app.post('/api/social/connectors', (req: Request, res: Response) => {
  try {
    const { id, status, hookUrl, account } = req.body;
    if (id && activeConnectors[id]) {
      activeConnectors[id].status = status;
      activeConnectors[id].lastUpdated = new Date().toISOString();
      if (account) activeConnectors[id].account = account;

      if (id === 'drive') {
        if (status === 'on') {
          if (socialSettings.googleDriveAuth) {
            socialSettings.googleDriveAuth.connected = true;
          }
        } else if (status === 'off') {
          if (socialSettings.googleDriveAuth) {
            socialSettings.googleDriveAuth.connected = false;
          }
        }
      }
      if (id === 'facebook') {
        if (socialSettings.platforms?.facebook) {
          socialSettings.platforms.facebook.enabled = status === 'on';
        }
      }
    }

    if (typeof hookUrl === 'string') {
      socialSettings.makeWebhookUrl = hookUrl.trim();
      socialSettings.makeStatus = hookUrl.trim() ? 'CONNECTED' : 'DISCONNECTED';
    }

    saveConnectorsToDisk();
    saveQueueToDisk();

    res.json({
      success: true,
      connectors: Object.values(activeConnectors),
      connectorsMap: activeConnectors,
      makeWebhookUrl: socialSettings.makeWebhookUrl,
      makeStatus: socialSettings.makeStatus,
    });
  } catch (err: any) {
    console.error('Error updating connectors:', err);
    res.status(500).json({ error: 'Failed to update connectors.' });
  }
});

// 7.2.1 GET Google Drive Auth Persistence with Folder Verification
app.get('/api/social/drive-auth', async (_req: Request, res: Response) => {
  const targetFolderId = socialSettings.imageFolder?.folderId || socialSettings.driveFolder.folderId || '1nM8BeH7Nnb9MMRIoA23qEmTrLbi19Gsg';
  let isConnected = Boolean(socialSettings.googleDriveAuth?.connected || activeConnectors.drive.status === 'on');
  let token = socialSettings.googleDriveAuth?.accessToken;

  // If token is present, test folder access but PRESERVE isConnected=true even on temporary network/token issues
  if (token) {
    try {
      const driveTest = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${targetFolderId}'+in+parents+and+trashed=false&fields=files(id)&pageSize=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (driveTest.status === 401 && (socialSettings.googleDriveAuth?.refreshToken || process.env.GOOGLE_REFRESH_TOKEN)) {
        // Token expired, attempt refresh
        const rToken = (socialSettings.googleDriveAuth?.refreshToken || process.env.GOOGLE_REFRESH_TOKEN || '').trim();
        const cId = (socialSettings.googleDriveAuth?.clientId || process.env.GOOGLE_CLIENT_ID || '').trim();
        const cSec = (socialSettings.googleDriveAuth?.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '').trim();
        const tokenParams = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: rToken,
        });
        if (cId) tokenParams.append('client_id', cId);
        if (cSec) tokenParams.append('client_secret', cSec);

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tokenParams.toString(),
        });
        if (tokenRes.ok) {
          const tData = await tokenRes.json();
          if (tData.access_token) {
            token = tData.access_token;
            if (socialSettings.googleDriveAuth) {
              socialSettings.googleDriveAuth.accessToken = token;
              socialSettings.googleDriveAuth.connected = true;
            }
            activeConnectors.drive.status = 'on';
            isConnected = true;
            saveQueueToDisk();
            saveConnectorsToDisk();
          }
        }
      } else if (driveTest.ok) {
        isConnected = true;
        if (socialSettings.googleDriveAuth) {
          socialSettings.googleDriveAuth.connected = true;
        }
        activeConnectors.drive.status = 'on';
      }
      // Note: Never reset isConnected to false upon network blip or temporary 401!
    } catch {
      // Network hiccup - preserve state
    }
  }

  res.json({
    success: true,
    auth: {
      ...(socialSettings.googleDriveAuth || { connected: isConnected }),
      connected: isConnected,
      accessToken: token || '',
    },
    folderId: targetFolderId,
    folderName: socialSettings.imageFolder?.folderName || socialSettings.driveFolder.folderName || 'Ready to Post',
    imageFolder: socialSettings.imageFolder,
    videoFolder: socialSettings.videoFolder,
  });
});

// 7.2.2 POST Google Drive Auth Persistence (Save token & test folder access)
app.post('/api/social/drive-auth', async (req: Request, res: Response) => {
  try {
    const { accessToken, refreshToken, clientId, clientSecret, userEmail, userName, connected } = req.body;
    if (connected === false) {
      socialSettings.googleDriveAuth = {
        connected: false,
      };
      activeConnectors.drive.status = 'off';
      saveConnectorsToDisk();
      saveQueueToDisk();
      return res.json({
        success: true,
        auth: socialSettings.googleDriveAuth,
      });
    }

    const targetFolderId = socialSettings.imageFolder?.folderId || socialSettings.driveFolder.folderId || '1nM8BeH7Nnb9MMRIoA23qEmTrLbi19Gsg';
    let folderAccessible = true;
    let verifyError: string | null = null;
    let fileCount = 0;

    const tokenToTest = accessToken || socialSettings.googleDriveAuth?.accessToken;

    if (tokenToTest) {
      try {
        const driveRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q='${targetFolderId}'+in+parents+and+trashed=false&fields=files(id,name)&pageSize=10`,
          { headers: { Authorization: `Bearer ${tokenToTest}` } }
        );
        if (driveRes.ok) {
          const driveData = await driveRes.json();
          folderAccessible = true;
          fileCount = Array.isArray(driveData.files) ? driveData.files.length : 0;
        } else {
          const errBody = await driveRes.text().catch(() => '');
          verifyError = `HTTP ${driveRes.status}: ${errBody.slice(0, 150)}`;
          // Only invalidate folderAccessible if unauthorized
          if (driveRes.status === 401 || driveRes.status === 403) {
            folderAccessible = false;
          }
        }
      } catch (err: any) {
        verifyError = err?.message || 'Network error verifying drive folder';
      }
    }

    socialSettings.googleDriveAuth = {
      ...(socialSettings.googleDriveAuth || {}),
      connected: true,
      folderAccessible,
      folderId: targetFolderId,
      fileCountFound: fileCount,
      verifyError,
      accessToken: tokenToTest || '',
      refreshToken: refreshToken || socialSettings.googleDriveAuth?.refreshToken || process.env.GOOGLE_REFRESH_TOKEN,
      clientId: clientId || socialSettings.googleDriveAuth?.clientId || process.env.GOOGLE_CLIENT_ID,
      clientSecret: clientSecret || socialSettings.googleDriveAuth?.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
      userEmail: userEmail || socialSettings.googleDriveAuth?.userEmail || 'eisakhanmari7@gmail.com',
      userName: userName || socialSettings.googleDriveAuth?.userName || 'GNZEE User',
      savedAt: new Date().toISOString(),
    };

    activeConnectors.drive.status = 'on';
    saveConnectorsToDisk();
    saveQueueToDisk();

    res.json({
      success: true,
      connected: true,
      folderAccessible,
      fileCount,
      verifyError,
      auth: socialSettings.googleDriveAuth,
    });
  } catch (err: any) {
    console.error('Error persisting Google Drive auth:', err);
    res.status(500).json({ error: 'Failed to update Google Drive auth state.' });
  }
});

// 7.2.2.1 GET Diagnostics & Environment Validation
app.get('/api/social/diagnostics', async (_req: Request, res: Response) => {
  try {
    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
    const hasMakeUrl = Boolean(
      (process.env.MAKE_WEBHOOK_URL && process.env.MAKE_WEBHOOK_URL.trim()) ||
      (socialSettings.makeWebhookUrl && socialSettings.makeWebhookUrl.trim())
    );
    const hasRefreshToken = Boolean(
      (process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_REFRESH_TOKEN.trim()) ||
      (socialSettings.googleDriveAuth?.refreshToken && socialSettings.googleDriveAuth.refreshToken.trim())
    );
    const hasClientId = Boolean(
      (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID.trim()) ||
      (socialSettings.googleDriveAuth?.clientId && socialSettings.googleDriveAuth.clientId.trim())
    );
    const hasClientSecret = Boolean(
      (process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CLIENT_SECRET.trim()) ||
      (socialSettings.googleDriveAuth?.clientSecret && socialSettings.googleDriveAuth.clientSecret.trim())
    );
    const hasActiveAccessToken = Boolean(
      socialSettings.googleDriveAuth?.accessToken && socialSettings.googleDriveAuth.accessToken.trim()
    );

    // Test storage directory writable
    let storageWritable = false;
    let storageError: string | null = null;
    try {
      const probe = path.join(SOCIAL_DATA_DIR, `.probe_${Date.now()}`);
      fs.writeFileSync(probe, 'ok', 'utf-8');
      fs.unlinkSync(probe);
      storageWritable = true;
    } catch (e: any) {
      storageError = e?.message || 'Directory unwritable';
    }

    // Test Google Drive access to folder 10xe4JndmOHCnbKH8NgzvXbcspsjMLNVw
    const testFolderId = '10xe4JndmOHCnbKH8NgzvXbcspsjMLNVw';
    let driveTestResult: any = {
      tested: false,
      connected: false,
      folderId: testFolderId,
      message: 'Google Drive is DISCONNECTED. No active OAuth access token or refresh token found on server. Connect Google Drive in the dashboard UI or supply GOOGLE_REFRESH_TOKEN.',
    };

    let tokenToUse = socialSettings.googleDriveAuth?.accessToken;
    // Attempt token refresh if refresh token is present
    if (!tokenToUse && hasRefreshToken) {
      const rToken = (process.env.GOOGLE_REFRESH_TOKEN || socialSettings.googleDriveAuth?.refreshToken || '').trim();
      const cId = (process.env.GOOGLE_CLIENT_ID || socialSettings.googleDriveAuth?.clientId || '').trim();
      const cSec = (process.env.GOOGLE_CLIENT_SECRET || socialSettings.googleDriveAuth?.clientSecret || '').trim();
      try {
        const tokenParams = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: rToken,
        });
        if (cId) tokenParams.append('client_id', cId);
        if (cSec) tokenParams.append('client_secret', cSec);

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tokenParams.toString(),
        });
        if (tokenRes.ok) {
          const tData = await tokenRes.json();
          tokenToUse = tData.access_token;
        }
      } catch {}
    }

    if (tokenToUse) {
      try {
        const driveRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q='${testFolderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)&pageSize=5`,
          { headers: { Authorization: `Bearer ${tokenToUse}` } }
        );
        if (driveRes.ok) {
          const driveData = await driveRes.json();
          const fileCount = Array.isArray(driveData.files) ? driveData.files.length : 0;
          driveTestResult = {
            tested: true,
            connected: true,
            folderId: testFolderId,
            fileCountFound: fileCount,
            sampleFileNames: (driveData.files || []).map((f: any) => f.name),
            message: `Successfully connected to folder ${testFolderId}. Found ${fileCount} files.`,
          };
        } else {
          const errBody = await driveRes.text().catch(() => '');
          driveTestResult = {
            tested: true,
            connected: false,
            httpStatus: driveRes.status,
            message: `Drive API returned HTTP ${driveRes.status}: ${errBody.slice(0, 150)}`,
          };
        }
      } catch (dErr: any) {
        driveTestResult = {
          tested: true,
          connected: false,
          message: `Network error querying Drive API: ${dErr?.message || dErr}`,
        };
      }
    }

    res.json({
      success: true,
      environment: {
        GEMINI_API_KEY: hasGeminiKey ? 'CONFIGURED' : 'MISSING',
        DATA_DIR: {
          configured: Boolean(process.env.DATA_DIR),
          activePath: SOCIAL_DATA_DIR,
          writable: storageWritable,
          error: storageError,
        },
        MAKE_WEBHOOK_URL: {
          configured: hasMakeUrl,
          status: socialSettings.makeStatus || 'DISCONNECTED',
          lastTestedAt: socialSettings.makeLastTestedAt || null,
        },
        GOOGLE_DRIVE: {
          hasRefreshToken,
          hasClientId,
          hasClientSecret,
          hasActiveSessionToken: hasActiveAccessToken,
          status: driveTestResult.connected ? 'CONNECTED' : 'DISCONNECTED',
        },
        APP_URL: process.env.APP_URL || 'http://localhost:3000',
        PORT: process.env.PORT || '3000',
      },
      masterSwitch: {
        autoMode: Boolean(socialSettings.autoMode),
        isPaused: Boolean(socialSettings.isPaused),
        state: socialSettings.autoMode ? 'ON' : 'OFF',
        safeModeGuaranteed: !socialSettings.autoMode,
      },
      driveTest: driveTestResult,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Diagnostics failed' });
  }
});

// 7.2.3 POST Auto-Refresh Google Drive Access Token using stored Refresh Token
app.post('/api/social/drive-refresh-token', async (req: Request, res: Response) => {
  try {
    const { refreshToken: reqToken, clientId: reqClient, clientSecret: reqSecret } = req.body || {};
    const refreshToken = (reqToken || socialSettings.googleDriveAuth?.refreshToken || process.env.GOOGLE_REFRESH_TOKEN || '').trim();
    const clientId = (reqClient || socialSettings.googleDriveAuth?.clientId || process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (reqSecret || socialSettings.googleDriveAuth?.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '').trim();

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'No refresh token available. Please provide a refresh token in settings.',
      });
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    if (clientId) tokenParams.append('client_id', clientId);
    if (clientSecret) tokenParams.append('client_secret', clientSecret);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      return res.status(400).json({
        success: false,
        error: `Google OAuth refresh failed (${tokenRes.status}): ${errText.slice(0, 160)}`,
      });
    }

    const tokenData = await tokenRes.json();
    const newAccessToken = tokenData.access_token;

    if (newAccessToken) {
      socialSettings.googleDriveAuth = {
        ...(socialSettings.googleDriveAuth || { connected: true }),
        connected: true,
        accessToken: newAccessToken,
        refreshToken: refreshToken || socialSettings.googleDriveAuth?.refreshToken,
        savedAt: new Date().toISOString(),
      };
      saveQueueToDisk();

      return res.json({
        success: true,
        accessToken: newAccessToken,
        expiresIn: tokenData.expires_in,
        message: 'Google Drive access token refreshed successfully.',
      });
    }

    res.status(500).json({ success: false, error: 'No access token returned from Google' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Token refresh failed' });
  }
});

// 7.3 GET Queue Items
app.get('/api/social/queue', (req: Request, res: Response) => {
  const platform = req.query.platform as string | undefined;
  const status = req.query.status as string | undefined;

  let filtered = [...socialQueue];
  if (platform && (platform === 'facebook' || platform === 'tiktok')) {
    filtered = filtered.filter((i) => i.targetPlatform === platform);
  }
  if (status) {
    filtered = filtered.filter((i) => i.status === status);
  }

  res.json({
    success: true,
    items: filtered,
    summary: getQueueSummary(),
    isPaused: socialSettings.isPaused,
  });
});

// 7.4 POST Add or Update Queue Items
app.post('/api/social/queue', (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array.' });
    }

    for (const newItem of items) {
      const idx = socialQueue.findIndex((q) => q.id === newItem.id);
      if (idx >= 0) {
        socialQueue[idx] = { ...socialQueue[idx], ...newItem };
      } else {
        socialQueue.unshift({
          id: newItem.id || `post-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fileId: newItem.fileId || `file-${Date.now()}`,
          fileName: newItem.fileName || 'content.png',
          driveUrl: newItem.driveUrl || '',
          contentType: newItem.contentType || 'image',
          caption: newItem.caption || '',
          hashtags: Array.isArray(newItem.hashtags) ? newItem.hashtags : [],
          targetPlatform: newItem.targetPlatform || 'facebook',
          scheduledDate: newItem.scheduledDate || new Date().toISOString().slice(0, 10),
          scheduledTime: newItem.scheduledTime || '08:00 AM',
          status: newItem.status || 'READY',
          approvedByUser: !!newItem.approvedByUser,
          createdAt: new Date().toISOString(),
        });
      }
    }

    saveQueueToDisk();

    res.json({
      success: true,
      items: socialQueue,
      summary: getQueueSummary(),
    });
  } catch (err: any) {
    console.error('Error adding/updating queue item:', err);
    res.status(500).json({ error: 'Failed to update queue.' });
  }
});

// 7.5 POST Delete Queue Item(s) or Clear All Fake/Old Data
app.post('/api/social/queue/delete', (req: Request, res: Response) => {
  try {
    const { id, ids, clearAll } = req.body;
    if (clearAll) {
      socialQueue = [];
    } else if (id) {
      socialQueue = socialQueue.filter((q) => q.id !== id);
    } else if (Array.isArray(ids)) {
      const set = new Set(ids);
      socialQueue = socialQueue.filter((q) => !set.has(q.id));
    }
    saveQueueToDisk();

    res.json({
      success: true,
      summary: getQueueSummary(),
      items: socialQueue,
    });
  } catch (err: any) {
    console.error('Error deleting queue item:', err);
    res.status(500).json({ error: 'Failed to delete item.' });
  }
});

// 7.5.1 POST Clear all fake/old posts and reset queue completely
app.post('/api/social/queue/clear', (_req: Request, res: Response) => {
  try {
    socialQueue = [];
    saveQueueToDisk();
    res.json({
      success: true,
      summary: getQueueSummary(),
      items: [],
      message: 'تمام پرانا اور فیک ڈیٹا کامیابی سے ہٹا دیا گیا۔',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear queue' });
  }
});

// 7.6 POST Auto-Schedule Queue by Distribution Rules
// If user has 50 items, do NOT blast all 50. Distribute into available daily slots:
// Day 1: 2 FB (08:00 AM, 08:00 PM) + 2 TikTok (10:00 AM, 08:00 PM)
// Day 2: 2 FB + 2 TikTok ... etc. Remaining items stay in READY!
app.post('/api/social/queue/auto-schedule', (req: Request, res: Response) => {
  try {
    const fbDaily = Math.max(1, socialSettings.platforms.facebook.dailyPosts || 2);
    const fbTimes = socialSettings.platforms.facebook.times.length > 0
      ? socialSettings.platforms.facebook.times
      : ['08:00 AM', '08:00 PM'];

    const ttDaily = Math.max(1, socialSettings.platforms.tiktok.dailyPosts || 2);
    const ttTimes = socialSettings.platforms.tiktok.times.length > 0
      ? socialSettings.platforms.tiktok.times
      : ['10:00 AM', '08:00 PM'];

    const daysLimit =
      socialSettings.postingPeriod.type === '10_days'
        ? 10
        : socialSettings.postingPeriod.type === '30_days'
        ? 30
        : Math.max(1, socialSettings.postingPeriod.customDays || 10);

    const eligibleItems = socialQueue.filter(
      (item) => item.status === 'READY' || item.status === 'QUEUED' || item.status === 'PAUSED'
    );

    // Group items by platform or alternate them
    const fbPool = eligibleItems.filter((i) => i.targetPlatform === 'facebook');
    const ttPool = eligibleItems.filter((i) => i.targetPlatform === 'tiktok');
    // If pool is unassigned, balance between the two
    const unassigned = eligibleItems.filter(
      (i) => i.targetPlatform !== 'facebook' && i.targetPlatform !== 'tiktok'
    );
    unassigned.forEach((item, idx) => {
      if (idx % 2 === 0) fbPool.push(item);
      else ttPool.push(item);
    });

    const now = new Date();

    // Schedule Facebook slots
    let fbIndex = 0;
    for (let day = 1; day <= daysLimit; day++) {
      const scheduleDay = new Date(now.getTime() + day * 86400000);
      const dateStr = scheduleDay.toISOString().slice(0, 10);

      for (let slot = 0; slot < fbDaily; slot++) {
        if (fbIndex < fbPool.length) {
          const item = fbPool[fbIndex];
          item.targetPlatform = 'facebook';
          item.scheduledDate = dateStr;
          item.scheduledTime = fbTimes[slot % fbTimes.length] || '08:00 AM';
          item.status = socialSettings.isPaused ? 'PAUSED' : 'QUEUED';
          item.needsManualAction = false;
          fbIndex++;
        }
      }
    }

    // Schedule TikTok slots
    let ttIndex = 0;
    for (let day = 1; day <= daysLimit; day++) {
      const scheduleDay = new Date(now.getTime() + day * 86400000);
      const dateStr = scheduleDay.toISOString().slice(0, 10);

      for (let slot = 0; slot < ttDaily; slot++) {
        if (ttIndex < ttPool.length) {
          const item = ttPool[ttIndex];
          item.targetPlatform = 'tiktok';
          item.scheduledDate = dateStr;
          item.scheduledTime = ttTimes[slot % ttTimes.length] || '10:00 AM';
          item.status = socialSettings.isPaused ? 'PAUSED' : 'QUEUED';

          // Reality check: TikTok photo vs video
          if (item.contentType === 'image') {
            item.needsManualAction = true;
            item.manualActionReason = 'TikTok Photo: Buffer موبائل ایپ نوٹیفکیشن / مینوئل تصدیق درکار ہے (Official API constraint)';
          } else {
            item.needsManualAction = false;
            item.manualActionReason = undefined;
          }
          ttIndex++;
        }
      }
    }

    saveQueueToDisk();

    res.json({
      success: true,
      message: `Auto-scheduled ${fbIndex + ttIndex} items across ${daysLimit} days. Remaining items kept in READY queue.`,
      summary: getQueueSummary(),
      items: socialQueue,
    });
  } catch (err: any) {
    console.error('Error auto-scheduling queue:', err);
    res.status(500).json({ error: 'Failed to auto-schedule queue.' });
  }
});

// Helper: Dispatch a single post item to Make.com Webhook with clean parameters
async function dispatchPostItemToMake(
  item: SocialMediaPostItem,
  targetPlatform: string
): Promise<boolean> {
  const webhookUrl = (socialSettings.makeWebhookUrl || socialSettings.zapierWebhookUrl || '').trim();
  if (!webhookUrl) {
    throw new Error('Make.com Webhook URL درکار ہے');
  }

  const cleanDriveId = getCleanDriveFileId(item.driveUrl, item.fileId);
  if (!cleanDriveId) {
    throw new Error('فائل ID (fileId) غائب ہے، لازمی درکار ہے۔');
  }

  const directDownloadUrl = `https://drive.google.com/uc?export=download&id=${cleanDriveId}`;

  const payload = {
    fileName: item.fileName,
    fileId: cleanDriveId, // لازمی
    fileUrl: directDownloadUrl, // export=download لازمی
    fileType: item.contentType === 'video' ? 'video' : 'image',
    caption: item.caption,
    hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
    targetPlatform, // صرف "facebook" یا "tiktok"
    scheduledDate: item.scheduledDate,
    scheduledTime: item.scheduledTime,
  };

  const makeRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'GNZEE-Market-SocialHub/3.0',
    },
    body: JSON.stringify(payload),
  });

  if (!makeRes.ok) {
    const errText = await makeRes.text().catch(() => '');
    throw new Error(`Make.com Error (${makeRes.status}): ${errText.slice(0, 100) || 'جواب موصول نہیں ہوا'}`);
  }
  return true;
}

// 7.7 POST Dispatch Items to Make.com Webhook
// Server-side proxy: sends exact JSON fields requested, validates Urdu text, prevents duplicate fileIds
app.post('/api/social/dispatch', async (req: Request, res: Response) => {
  try {
    const { itemIds, forceAllApproved = false, forceImmediate = false, sendBothPlatforms = true } = req.body;
    const webhookUrl = (socialSettings.makeWebhookUrl || socialSettings.zapierWebhookUrl || '').trim();

    if (!webhookUrl) {
      return res.status(400).json({
        error: 'Make.com Webhook URL درج نہیں ہے۔ برائے مہربانی سیٹنگز خانے میں اپنا Make.com Webhook URL درج کر کے محفوظ کریں۔',
        errorType: 'make',
      });
    }

    if (socialSettings.isPaused) {
      return res.status(400).json({
        error: '⛔ سسٹم PAUSED ہے! پہلے "Resume Automation" کا بٹن دبائیں۔',
        errorType: 'paused',
      });
    }

    if (!Array.isArray(socialSettings.dispatchedFileIds)) {
      socialSettings.dispatchedFileIds = [];
    }

    checkAndResetDailyLimit();

    // Determine target items
    let targetItems: SocialMediaPostItem[] = [];
    if (Array.isArray(itemIds) && itemIds.length > 0) {
      const idSet = new Set(itemIds);
      targetItems = socialQueue.filter((q) => idSet.has(q.id));
    } else if (forceAllApproved) {
      targetItems = socialQueue.filter(
        (q) => (q.status === 'QUEUED' || q.status === 'READY') && (q.approvedByUser || socialSettings.autoPublish)
      );
    } else {
      targetItems = socialQueue.filter(
        (q) => q.status === 'QUEUED' && (q.approvedByUser || socialSettings.autoPublish)
      );
    }

    if (targetItems.length === 0) {
      return res.status(400).json({
        error: 'بھیجنے کے لیے کوئی تیار یا تائید شدہ (Approved) آئٹم موجود نہیں ہے۔ برائے مہربانی پہلے پوسٹ منظور کریں۔',
      });
    }

    const results: Array<{ id: string; success: boolean; error?: string; status?: string }> = [];

    for (const item of targetItems) {
      const cleanDriveId = getCleanDriveFileId(item.driveUrl, item.fileId);

      // 1. Mandatory fileId check
      if (!cleanDriveId) {
        item.status = 'FAILED';
        item.errorType = 'make';
        item.errorMessage = 'فائل ID (fileId) غائب ہے، لازمی درکار ہے۔';
        results.push({ id: item.id, success: false, error: item.errorMessage });
        continue;
      }

      // 2. Double post prevention: check if fileId was already dispatched
      if (socialSettings.dispatchedFileIds.includes(cleanDriveId)) {
        item.errorMessage = `ڈبل پوسٹ تحفظ: یہ فائل (ID: ${cleanDriveId}) پہلے ہی Make.com کو بھیجی جا چکی ہے۔ ڈبل پوسٹ سے بچاؤ کے لیے دوبارہ نہیں بھیجا گیا۔`;
        results.push({
          id: item.id,
          success: false,
          error: item.errorMessage,
        });
        continue;
      }

      // 3. Urdu content validation: if caption is broken/incomplete -> set NEEDS APPROVAL
      const validation = validateUrduPostContent(item.caption);
      if (!validation.isValid) {
        item.status = 'NEEDS APPROVAL';
        item.needsManualAction = true;
        item.manualActionReason = validation.reason;
        item.errorMessage = `اردو متن نامکمل: ${validation.reason}۔ منظوری کے لیے روکا گیا۔`;
        results.push({
          id: item.id,
          success: false,
          error: item.errorMessage,
          status: 'NEEDS APPROVAL',
        });
        continue;
      }

      // 4. Timing: check if post is due according to Pakistan Time (PKT, UTC+5)
      const isDue = isPostDuePakistanTime(item.scheduledDate, item.scheduledTime);
      if (!isDue && !forceImmediate) {
        results.push({
          id: item.id,
          success: false,
          error: `پوسٹ کا وقت ابھی نہیں ہوا (مقررہ وقت: ${item.scheduledDate} ${item.scheduledTime} PKT)۔ وقت پہنچنے پر بھیجا جائے گا۔`,
        });
        continue;
      }

      try {
        const doBoth = sendBothPlatforms && socialSettings.sendBothPlatforms !== false;
        if (doBoth) {
          // Call 1: Facebook
          await dispatchPostItemToMake(item, 'facebook');
          // Short delay between calls
          await new Promise((r) => setTimeout(r, 200));
          // Call 2: TikTok Reminder
          await dispatchPostItemToMake(item, 'tiktok');
        } else {
          const safePlatform: 'facebook' | 'tiktok' = item.targetPlatform === 'tiktok' ? 'tiktok' : 'facebook';
          await dispatchPostItemToMake(item, safePlatform);
        }

        item.status = 'SENT TO MAKE';
        item.dispatchedAt = new Date().toISOString();
        item.errorMessage = undefined;
        item.errorType = undefined;

        if (!socialSettings.dispatchedFileIds.includes(cleanDriveId)) {
          socialSettings.dispatchedFileIds.push(cleanDriveId);
        }
        socialSettings.todayDispatchedCount = (socialSettings.todayDispatchedCount || 0) + 1;
        results.push({ id: item.id, success: true, status: 'SENT TO MAKE' });
      } catch (err: any) {
        item.status = 'FAILED';
        item.errorType = 'make';
        item.errorMessage = err?.message || 'Failed to dispatch';
        results.push({ id: item.id, success: false, error: item.errorMessage });
      }
    }

    saveQueueToDisk();

    const successCount = results.filter((r) => r.success).length;
    res.json({
      success: successCount > 0,
      dispatchedCount: successCount,
      failedCount: results.length - successCount,
      results,
      summary: getQueueSummary(),
      items: socialQueue,
    });
  } catch (err: any) {
    console.error('Error dispatching to Make.com:', err);
    res.status(500).json({ error: 'Failed to dispatch items to Make.com.' });
  }
});

// 7.7.1 POST Prepare AUTO Activation (Select 2 newest, identify older to archive)
app.post('/api/social/auto/prepare', (req: Request, res: Response) => {
  try {
    checkAndResetDailyLimit();
    const limit = socialSettings.dailyLimit || 2;

    // Filter candidate items from current queue: only IMAGES, not already SENT TO MAKE, and not dispatched
    const candidates = socialQueue
      .filter(
        (q) =>
          q.contentType === 'image' &&
          q.status !== 'SENT TO MAKE' &&
          q.status !== 'ARCHIVED' &&
          !socialSettings.dispatchedFileIds.includes(q.fileId)
      )
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

    const newestCandidates = candidates.slice(0, limit);
    const olderCandidates = candidates.slice(limit);

    res.json({
      success: true,
      autoMode: socialSettings.autoMode,
      dailyLimit: limit,
      todayDispatchedCount: socialSettings.todayDispatchedCount,
      candidates: newestCandidates,
      archivedCount: olderCandidates.length,
      olderFileNames: olderCandidates.map((c) => c.fileName),
      confirmationMessage: newestCandidates.length > 0
        ? `یہ ${newestCandidates.length} فائلیں ابھی لائیو بھیجی جائیں گی: ${newestCandidates.map((c) => c.fileName).join('، ')}۔`
        : 'کوئی نئی فائل دستیاب نہیں ہے۔',
    });
  } catch (err: any) {
    console.error('Error preparing auto mode:', err);
    res.status(500).json({ error: 'Failed to prepare auto mode' });
  }
});

// 7.7.2 POST Confirm and Activate AUTO Mode
app.post('/api/social/auto/activate', async (req: Request, res: Response) => {
  try {
    const { confirmed, candidateIds } = req.body;
    if (!confirmed) {
      return res.status(400).json({ error: 'User confirmation required to activate AUTO mode.' });
    }

    checkAndResetDailyLimit();
    socialSettings.autoMode = true;

    const limit = socialSettings.dailyLimit || 2;
    let toSend: SocialMediaPostItem[] = [];
    if (Array.isArray(candidateIds) && candidateIds.length > 0) {
      toSend = socialQueue.filter((q) => candidateIds.includes(q.id) && q.contentType === 'image').slice(0, limit);
    } else {
      toSend = socialQueue
        .filter(
          (q) =>
            q.contentType === 'image' &&
            q.status !== 'SENT TO MAKE' &&
            !socialSettings.dispatchedFileIds.includes(q.fileId)
        )
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, limit);
    }

    // Mark remaining items in queue as ARCHIVED (video files remain in NEEDS APPROVAL per rule 8)
    const toSendIds = new Set(toSend.map((s) => s.id));
    let archivedCount = 0;
    for (const item of socialQueue) {
      if (!toSendIds.has(item.id) && item.status !== 'SENT TO MAKE') {
        if (item.contentType === 'video') {
          item.status = 'NEEDS APPROVAL';
          item.needsManualAction = true;
          item.manualActionReason = 'ویڈیو فائل: دستی منظوری درکار ہے (خودکار اشاعت غیر فعال ہے)';
        } else {
          item.status = 'ARCHIVED';
          archivedCount++;
        }
      }
    }

    const dispatchedNames: string[] = [];
    const errors: string[] = [];

    // Dispatch candidate items (both Facebook + TikTok reminder)
    for (const item of toSend) {
      try {
        const cleanDriveId = getCleanDriveFileId(item.driveUrl, item.fileId);
        // Call 1: Facebook
        await dispatchPostItemToMake(item, 'facebook');
        // Delay 250ms
        await new Promise((r) => setTimeout(r, 250));
        // Call 2: TikTok Reminder
        await dispatchPostItemToMake(item, 'tiktok');

        item.status = 'SENT TO MAKE';
        item.dispatchedAt = new Date().toISOString();
        item.errorMessage = undefined;
        item.errorType = undefined;

        if (!socialSettings.dispatchedFileIds.includes(cleanDriveId)) {
          socialSettings.dispatchedFileIds.push(cleanDriveId);
        }
        socialSettings.todayDispatchedCount = (socialSettings.todayDispatchedCount || 0) + 1;
        dispatchedNames.push(item.fileName);
      } catch (postErr: any) {
        item.status = 'FAILED';
        item.errorMessage = postErr?.message || 'Failed to dispatch';
        errors.push(`${item.fileName}: ${item.errorMessage}`);
      }
    }

    saveQueueToDisk();

    res.json({
      success: true,
      autoMode: true,
      dispatchedCount: dispatchedNames.length,
      dispatchedNames,
      archivedCount,
      errors: errors.length > 0 ? errors : undefined,
      items: socialQueue,
      summary: getQueueSummary(),
      settings: socialSettings,
    });
  } catch (err: any) {
    console.error('Error activating auto mode:', err);
    res.status(500).json({ error: 'Failed to activate auto mode' });
  }
});

// 7.7.3 POST Toggle AUTO Mode ON / OFF
app.post('/api/social/auto/toggle', (req: Request, res: Response) => {
  try {
    const { autoMode } = req.body;
    socialSettings.autoMode = !!autoMode;
    saveQueueToDisk();
    res.json({
      success: true,
      autoMode: socialSettings.autoMode,
      settings: socialSettings,
      summary: getQueueSummary(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to toggle auto mode' });
  }
});

// Unified single payload sender to Make.com Webhook (mirrored by both test and share-now)
async function sendSinglePayloadToMake(targetUrl: string, payload: any): Promise<{
  success: boolean;
  httpStatus: number;
  responseBody: string;
  errorMessage?: string;
}> {
  try {
    const makeRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GNZEE-SocialAutomationHub/3.0',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await makeRes.text().catch(() => '');
    return {
      success: makeRes.ok,
      httpStatus: makeRes.status,
      responseBody: responseText,
      errorMessage: makeRes.ok ? undefined : `Make Error (${makeRes.status}): ${responseText || 'No response body'}`,
    };
  } catch (err: any) {
    return {
      success: false,
      httpStatus: 0,
      responseBody: '',
      errorMessage: err?.message || 'Network connection failed',
    };
  }
}

// 7.7.4 POST One-Click "Share Now" (Exact same delivery engine as test-webhook with real payload and detailed HTTP feedback)
app.post('/api/social/share-now', async (req: Request, res: Response) => {
  try {
    const {
      items, // Direct preview items sent from frontend: [{ fileName, fileId, fileUrl, fileType, caption, hashtags }]
      mediaType = 'image',
      platforms = ['facebook'],
      webhookUrl: overrideUrl,
    } = req.body;

    const webhookUrl = (overrideUrl || socialSettings.makeWebhookUrl || socialSettings.zapierWebhookUrl || 'https://hook.us2.make.com/q5uh2mbvqckphmu4af2wh5nvs298v8hx').trim();
    if (!webhookUrl) {
      return res.status(400).json({
        success: false,
        error: 'Make.com Webhook URL is missing. Please verify in Settings.',
      });
    }

    // Determine target items: prefer explicit items array sent from the UI preview
    let targetItems: Array<{
      fileName: string;
      fileId: string;
      fileUrl?: string;
      fileType?: string;
      caption?: string;
      hashtags?: string[];
    }> = [];

    if (Array.isArray(items) && items.length > 0) {
      targetItems = items;
    } else if (socialQueue.length > 0) {
      targetItems = socialQueue
        .filter((q) => q.contentType === mediaType)
        .slice(0, 2);
    }

    if (targetItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided to dispatch. Please click "Show Preview" to load your Google Drive files first.',
      });
    }

    const selectedPlatforms: string[] = Array.isArray(platforms) && platforms.length > 0
      ? platforms
      : ['facebook'];

    const dispatchedResults: Array<{
      fileName: string;
      fileId: string;
      platform: string;
      success: boolean;
      httpStatus: number;
      statusText: string;
      responseBody: string;
      payloadSent: any;
      errorMessage?: string;
    }> = [];

    for (const item of targetItems) {
      const cleanDriveId = getCleanDriveFileId(item.fileUrl, item.fileId);
      const directDownloadUrl = item.fileUrl && item.fileUrl.includes('export=download')
        ? item.fileUrl
        : `https://drive.google.com/uc?export=download&id=${cleanDriveId}`;

      const itemCaption = (item.caption || '').trim();
      const itemHashtags = Array.isArray(item.hashtags)
        ? item.hashtags
        : typeof (item as any).hashtags === 'string'
        ? ((item as any).hashtags as string).split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      for (const plat of selectedPlatforms) {
        // Construct exact required payload
        const payload = {
          fileName: item.fileName,
          fileId: cleanDriveId,
          fileUrl: directDownloadUrl,
          fileType: item.fileType || (mediaType === 'video' ? 'video' : 'image'),
          caption: itemCaption,
          hashtags: itemHashtags,
          targetPlatform: plat, // "facebook" or "tiktok"
        };

        // Call the identical sender function as test-webhook
        const sendRes = await sendSinglePayloadToMake(webhookUrl, payload);

        if (sendRes.success) {
          if (!socialSettings.dispatchedFileIds.includes(cleanDriveId)) {
            socialSettings.dispatchedFileIds.push(cleanDriveId);
          }
          socialSettings.todayDispatchedCount = (socialSettings.todayDispatchedCount || 0) + 1;
          socialSettings.makeStatus = 'CONNECTED';
        }

        const statusText = sendRes.success
          ? (plat === 'tiktok' ? 'REMINDER ONLY' : 'SENT TO MAKE')
          : `FAILED (${sendRes.httpStatus})`;

        dispatchedResults.push({
          fileName: item.fileName,
          fileId: cleanDriveId,
          platform: plat,
          success: sendRes.success,
          httpStatus: sendRes.httpStatus,
          statusText,
          responseBody: sendRes.responseBody,
          payloadSent: payload,
          errorMessage: sendRes.errorMessage,
        });

        // Small delay between calls
        if (selectedPlatforms.length > 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }

    saveQueueToDisk();

    const allSuccessful = dispatchedResults.every((d) => d.success);
    const primaryStatus = dispatchedResults[0]?.httpStatus || (allSuccessful ? 200 : 500);

    res.json({
      success: allSuccessful,
      httpStatus: primaryStatus,
      dispatchedCount: dispatchedResults.filter((d) => d.success).length,
      results: dispatchedResults,
      dispatchedFileIds: socialSettings.dispatchedFileIds,
      sentPayloads: dispatchedResults.map((d) => d.payloadSent),
      summaryMessage: allSuccessful
        ? `Dispatched! Make accepted ${dispatchedResults.length} payload(s) with HTTP ${primaryStatus}.`
        : `Make dispatch returned errors for one or more files.`,
    });
  } catch (err: any) {
    console.error('Error in share-now endpoint:', err);
    res.status(500).json({
      success: false,
      httpStatus: 500,
      error: 'Share Now failed: ' + (err?.message || ''),
    });
  }
});

// 7.8 POST Test Make.com Webhook Connection (Send Test Button)
// Sends targetPlatform: "test" so nothing is posted to Facebook or TikTok
app.post('/api/social/test-webhook', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    const targetUrl = (url || socialSettings.makeWebhookUrl || socialSettings.zapierWebhookUrl || '').trim();

    if (!targetUrl) {
      return res.status(400).json({
        success: false,
        error: 'Make.com Webhook URL درکار ہے۔ سیٹنگز خانے میں اپنا Make.com Webhook URL درج کریں۔',
      });
    }

    // Exact test payload requested for Make.com test mode
    const testPayload = {
      fileName: 'TEST-GNZEE-001.png',
      fileId: 'drive-test-gnzee-001',
      fileUrl: 'https://drive.google.com/uc?export=download&id=10xe4JndmOHCnbKH8NgzvXbcspsjMLNVw',
      fileType: 'image',
      caption: 'Test post from GNZEE Social Automation Hub',
      hashtags: ['#GNZEEMarket', '#Test'],
      targetPlatform: 'test', // صرف ٹیسٹ، کچھ پبلش نہیں ہوگا
      scheduledDate: 'test',
      scheduledTime: 'test',
    };

    const sendRes = await sendSinglePayloadToMake(targetUrl, testPayload);

    if (sendRes.success) {
      socialSettings.makeStatus = 'TEST SUCCESSFUL';
      socialSettings.makeLastTestedAt = new Date().toISOString();
      if (!socialSettings.makeWebhookUrl) {
        socialSettings.makeWebhookUrl = targetUrl;
      }
      saveQueueToDisk();

      res.json({
        success: true,
        makeStatus: 'TEST SUCCESSFUL',
        statusText: 'TEST SUCCESSFUL',
        message: 'Make.com: TEST SUCCESSFUL (Status 200)! ٹیسٹ ریکارڈ (targetPlatform: "test") کامیابی سے Make کو بھیجا گیا۔',
        sentPayload: testPayload,
        lastTestedAt: socialSettings.makeLastTestedAt,
      });
    } else {
      socialSettings.makeStatus = 'FAILED';
      saveQueueToDisk();
      res.status(400).json({
        success: false,
        makeStatus: 'FAILED',
        error: `Make.com نے ایرر واپس کیا (${sendRes.httpStatus}): ${(sendRes.responseBody || sendRes.errorMessage || '').slice(0, 120)}`,
        sentPayload: testPayload,
      });
    }
  } catch (err: any) {
    res.status(500).json({
      success: false,
      makeStatus: 'DISCONNECTED',
      error: `Make.com Webhook ٹیسٹ ناکام: ${err?.message || 'نیٹ ورک کنکشن ممکن نہیں ہو سکا'}`,
    });
  }
});

// 7.9 POST Generate Viral Caption & Hashtags using Gemini Vision (Image OCR + Authentic Urdu Caption)
app.post('/api/social/generate-post-metadata', async (req: Request, res: Response) => {
  const {
    topic,
    platform = 'facebook',
    contentType = 'image',
    imageBase64,
    thumbnailLink,
    fileId,
    fileUrl,
    accessToken,
  } = req.body || {};

  try {
    const ai = getGeminiClient();

    // 1. Try to fetch image bytes for Gemini Vision inspection
    let imagePart: any = null;
    let imageBuffer: Buffer | null = null;
    let mimeType = 'image/jpeg';

    if (imageBase64 && typeof imageBase64 === 'string') {
      try {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const matchMime = imageBase64.match(/^data:(image\/\w+);base64,/);
        if (matchMime) mimeType = matchMime[1];
        imageBuffer = Buffer.from(base64Data, 'base64');
      } catch (bErr) {
        console.warn('Failed to parse imageBase64:', bErr);
      }
    }

    if (!imageBuffer && thumbnailLink && typeof thumbnailLink === 'string') {
      try {
        // High resolution thumbnail
        const fetchUrl = thumbnailLink.includes('=s')
          ? thumbnailLink.replace(/=s\d+/, '=s1000')
          : `${thumbnailLink}=s1000`;
        const tRes = await fetch(fetchUrl);
        if (tRes.ok) {
          const ab = await tRes.arrayBuffer();
          imageBuffer = Buffer.from(ab);
          const ct = tRes.headers.get('content-type');
          if (ct && ct.includes('image/')) mimeType = ct;
        }
      } catch (tErr) {
        console.warn('Failed to fetch thumbnail for vision:', tErr);
      }
    }

    if (!imageBuffer && fileId) {
      try {
        const token = (accessToken || (socialSettings as any).googleDriveAuth?.accessToken || '').trim();
        const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (driveRes.ok) {
          const ab = await driveRes.arrayBuffer();
          imageBuffer = Buffer.from(ab);
          const ct = driveRes.headers.get('content-type');
          if (ct && ct.includes('image/')) mimeType = ct;
        }
      } catch (dErr) {
        console.warn('Failed to fetch file from Drive for vision:', dErr);
      }
    }

    if (imageBuffer && imageBuffer.length > 0) {
      imagePart = {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType,
        },
      };
    }

    const systemInstruction = `You are an expert social media manager and Urdu linguistic specialist.
Look at the provided image carefully and read any text inscribed on it.

CRITICAL RULES:
1. READ URDU/ENGLISH TEXT: Carefully extract and transcribe the text written inside the image.
   - This might be an Islamic quote, Urdu poetry, wisdom, motivational thought, philosophical quote, educational note, or greeting.
2. WRITING THE CAPTION:
   - Base the headline and caption ENTIRELY on the actual text and theme of the image!
   - DO NOT mention fashion, clothes, discounts, or e-commerce products UNLESS the image explicitly shows clothes or physical products for sale!
   - Write a rich, natural, grammatically correct Urdu caption (2-4 sentences) explaining or reflecting on the wisdom/quote in the image, with suitable emojis.
3. QUALITY / APPROVAL CHECK:
   - If the Urdu text in the image is corrupted, broken, incomplete, or illegible, set "status": "NEEDS APPROVAL" and explain why in "approvalNote".
   - If the text is clear and readable, set "status": "READY TO POST".
4. HASHTAGS:
   - Provide 5-7 relevant hashtags strictly matching the topic (e.g. #UrduQuotes, #IslamicReminders, #DailyWisdom, #Motivation, #Pakistan, #GNZEEMarket).

Output format MUST be valid JSON:
{
  "transcribedText": "Exact text read from the image",
  "headline": "Short Catchy Headline matching the image topic",
  "caption": "Full Urdu caption discussing the image content with relevant emojis",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "status": "READY TO POST",
  "approvalNote": ""
}`;

    const promptMessage = `Examine this media (${topic || 'Social Media Image'}). Transcribe any text on the image and write an authentic Urdu caption strictly reflecting the image theme. Target platform: ${platform}.`;

    const contents = imagePart
      ? [imagePart, { text: promptMessage }]
      : promptMessage;

    const response = await generateWithFallback(ai, {
      contents,
      config: {
        systemInstruction,
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    });

    const raw = response.text?.trim() || '{}';
    const cleaned = raw.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    res.json({
      success: true,
      transcribedText: parsed.transcribedText || '',
      headline: parsed.headline || '✨ خوبصورت پیغام اور پرحکمت سوچ',
      caption: parsed.caption || '✨ اس خوبصورت پیغام کو پڑھیں اور اپنی زندگی میں مثبت تبدیلی لائیں۔ اپنے پیاروں کے ساتھ ضرور شیئر کریں! 🌸',
      hashtags: Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0
        ? parsed.hashtags
        : ['#GNZEEMarket', '#UrduQuotes', '#DailyWisdom', '#Pakistan', '#Inspiration'],
      status: parsed.status === 'NEEDS APPROVAL' ? 'NEEDS APPROVAL' : 'READY TO POST',
      approvalNote: parsed.approvalNote || '',
    });
  } catch (err: any) {
    console.warn('[Notice] Vision caption fallback used (Rate limit or AI unavailable):', err?.message || err);
    const cleanTopic = typeof topic === 'string' ? topic.trim() : '';
    let headline = '✨ خوبصورت پیغام اور پرحکمت سوچ';
    let caption = '✨ زندگی میں مثبت سوچ، امید اور خوش اخلاقی کے ساتھ آگے بڑھیں۔ اس خوبصورت پیغام کو اپنے دوستوں اور فیملی کے ساتھ شیئر کریں! 🌸';

    if (/morning|صبح/i.test(cleanTopic)) {
      headline = '✨ صبح بخیر — پرحکمت سوچ اور نیا دن';
      caption = '✨ ہر صبح ایک نیا موقع ہے کچھ اچھا کرنے اور خوشیاں بانٹنے کا۔ دعا ہے آپ کا دن خوشیوں اور برکتوں سے بھرا ہو۔ 🌸';
    } else if (/evening|night|شام/i.test(cleanTopic)) {
      headline = '✨ شام بخیر — پُرسکون لمحات اور حکمت';
      caption = '✨ دن بھر کی مصروفیات کے بعد شکر گزاری اور امن کے چند پرسکون لمحات۔ اللہ تعالی آپ کو ہر قدم پر کامیابی عطا فرمائے۔ 🌸';
    } else if (/jummah|جمعہ|friday/i.test(cleanTopic)) {
      headline = '✨ جمعہ مبارک — دعاؤں میں یاد رکھیں';
      caption = '✨ جمعۃ المبارک کی پرنور ساعتیں مبارک ہوں۔ اللہ پاک تمام دعائیں قبول فرمائے اور سب کے رزق میں برکت دے۔ آمین! 🤲';
    }

    res.json({
      success: true,
      transcribedText: cleanTopic || 'خوبصورت پیغام',
      headline,
      caption,
      hashtags: ['#GNZEEMarket', '#UrduQuotes', '#DailyWisdom', '#Pakistan', '#Inspiration'],
      status: 'READY TO POST',
      approvalNote: '',
    });
  }
});

// 7.10 POST Import from Image Studio into Social Automation Hub Queue
app.post('/api/social/import-from-studio', (req: Request, res: Response) => {
  try {
    const { galleryItems } = req.body;
    if (!Array.isArray(galleryItems) || galleryItems.length === 0) {
      return res.status(400).json({ error: 'No items provided to import.' });
    }

    const imported: SocialMediaPostItem[] = [];
    for (const g of galleryItems) {
      const cleanTitle = (g.title || g.quote || 'Daily Post').slice(0, 40);
      const newItem: SocialMediaPostItem = {
        id: `studio-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fileId: `drive-sync-${g.id || Date.now()}`,
        fileName: `${new Date().toISOString().slice(0, 10)}_${cleanTitle.replace(/\s+/g, '_')}.png`,
        driveUrl: g.dataUrl || g.rawVisualUrl || '',
        contentType: 'image',
        caption: g.quote ? `✨ ${g.quote} — خوبصورت اور پرحکمت سوچ۔` : `✨ ${cleanTitle}`,
        hashtags: ['#GNZEEMarket', '#DailyWisdom', '#Pakistan', '#Motivation', '#Trending'],
        targetPlatform: imported.length % 2 === 0 ? 'facebook' : 'tiktok',
        scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        scheduledTime: imported.length % 2 === 0 ? '08:00 AM' : '10:00 AM',
        status: 'READY',
        approvedByUser: false,
        createdAt: new Date().toISOString(),
      };
      imported.push(newItem);
      socialQueue.unshift(newItem);
    }

    saveQueueToDisk();

    res.json({
      success: true,
      importedCount: imported.length,
      summary: getQueueSummary(),
      items: socialQueue,
    });
  } catch (err: any) {
    console.error('Error importing from studio:', err);
    res.status(500).json({ error: 'Failed to import from studio.' });
  }
});

// 7.11 POST Synchronize detected files from Google Drive "Ready to Post" folder
app.post('/api/social/drive-sync', async (req: Request, res: Response) => {
  try {
    const { files, folderId } = req.body;
    if (!Array.isArray(files)) {
      return res.status(400).json({ error: 'Files array is required.' });
    }

    if (folderId && typeof folderId === 'string') {
      socialSettings.driveFolder.folderId = folderId;
      socialSettings.driveFolder.folderName =
        folderId === '1wuQIyIihJCt247aYDALrmDQItMI0z-Og' ? 'For Marketing' : 'Ready to Post';
    }

    checkAndResetDailyLimit();

    let addedCount = 0;
    const newlyAddedItems: SocialMediaPostItem[] = [];

    // Sort incoming files by createdTime descending (newest first)
    const sortedFiles = [...files].sort((a, b) => {
      const tA = new Date(a.createdTime || 0).getTime();
      const tB = new Date(b.createdTime || 0).getTime();
      return tB - tA;
    });

    for (const f of sortedFiles) {
      if (!f || !f.id) continue;
      const existing = socialQueue.find((q) => q.fileId === f.id);
      if (!existing) {
        const isVideo = f.type === 'video' || (f.mimeType && f.mimeType.startsWith('video/'));
        const cleanName = (f.name || 'Marketing_Media').replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        const newItem: SocialMediaPostItem = {
          id: `drive-${f.id}`,
          fileId: f.id,
          fileName: f.name || `media_${Date.now()}.${isVideo ? 'mp4' : 'png'}`,
          driveUrl: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
          contentType: isVideo ? 'video' : 'image',
          caption: isVideo
            ? `🎥 ${cleanName} — شاندار پروڈکٹ ویڈیو! بہترین کوالٹی اور پرکشش قیمت پر دستیاب۔ 🛍️\nآرڈر و معلومات کے لیے فوری رابطہ کریں۔ 📲`
            : `✨ ${cleanName} — اعلیٰ معیار کی پراڈکٹ، شاندار ریٹ پر دستیاب! 🛍️\nآرڈر بک کروانے اور مزید تفصیلات کے لیے رابطہ فرمائیں۔ 📲`,
          hashtags: ['#GNZEEMarket', '#ForMarketing', '#OnlineShopping', '#Pakistan', '#Viral'],
          targetPlatform: 'facebook',
          scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          scheduledTime: '08:00 AM',
          status: isVideo ? 'NEEDS APPROVAL' : 'READY',
          approvedByUser: !isVideo,
          needsManualAction: isVideo,
          manualActionReason: isVideo ? 'ویڈیو فائل: دستی منظوری درکار ہے (ابھی خودکار اشاعت غیر فعال ہے)' : undefined,
          createdAt: f.createdTime || new Date().toISOString(),
        };
        socialQueue.unshift(newItem);
        newlyAddedItems.push(newItem);
        addedCount++;
      }
    }

    // Ongoing AUTO mode: if AUTO switch is ON and new items arrived, automatically dispatch images up to daily limit
    let autoDispatchedCount = 0;
    if (socialSettings.autoMode && !socialSettings.isPaused && newlyAddedItems.length > 0) {
      const quotaRemaining = Math.max(0, (socialSettings.dailyLimit || 2) - (socialSettings.todayDispatchedCount || 0));
      if (quotaRemaining > 0) {
        const toAutoSend = newlyAddedItems
          .filter((i) => i.contentType === 'image' && i.status !== 'NEEDS APPROVAL')
          .slice(0, quotaRemaining);
        for (const item of toAutoSend) {
          try {
            const cleanDriveId = getCleanDriveFileId(item.driveUrl, item.fileId);
            // 1. Facebook
            await dispatchPostItemToMake(item, 'facebook');
            // 2. TikTok Reminder
            await new Promise((r) => setTimeout(r, 200));
            await dispatchPostItemToMake(item, 'tiktok');

            item.status = 'SENT TO MAKE';
            item.dispatchedAt = new Date().toISOString();
            if (!socialSettings.dispatchedFileIds.includes(cleanDriveId)) {
              socialSettings.dispatchedFileIds.push(cleanDriveId);
            }
            socialSettings.todayDispatchedCount = (socialSettings.todayDispatchedCount || 0) + 1;
            autoDispatchedCount++;
          } catch (autoErr: any) {
            item.status = 'FAILED';
            item.errorMessage = autoErr?.message || 'Auto dispatch failed';
          }
        }
      }
    }

    saveQueueToDisk();

    res.json({
      success: true,
      addedCount,
      autoDispatchedCount,
      totalQueueCount: socialQueue.length,
      summary: getQueueSummary(),
      items: socialQueue,
    });
  } catch (err: any) {
    console.error('Error syncing Google Drive files:', err);
    res.status(500).json({ error: 'Failed to sync Google Drive files.' });
  }
});

// Unified AutoScheduler Routine: Supports 3 configurable times in Asia/Karachi (e.g. 08:00 AM, 02:00 PM, 06:00 PM)
// Callable by both internal 30-second loop and external wakeup cron (cron-job.org / curl / UptimeRobot)
async function runScheduledDispatchJob(forceRun = false): Promise<{
  success: boolean;
  message: string;
  dispatched?: boolean;
  file?: string;
  slot?: string;
}> {
  try {
    if (!socialSettings.autoMode && !forceRun) {
      return { success: false, message: 'Master Switch is OFF. Turn ON Master Switch in Hub or set force=true.' };
    }
    if (socialSettings.isPaused && !forceRun) {
      return { success: false, message: 'Automation is paused.' };
    }

    checkAndResetDailyLimit();

    const limit = socialSettings.dailyLimit || 3;
    if ((socialSettings.todayDispatchedCount || 0) >= limit && !forceRun) {
      return { success: true, dispatched: false, message: `Daily post limit of ${limit} reached for today.` };
    }

    const now = new Date();
    const todayPK = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(now);
    const timeStrPK = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(now);

    const time1 = (socialSettings.schedule?.time1 || '08:00 AM').trim();
    const time2 = (socialSettings.schedule?.time2 || '02:00 PM').trim();
    const time3 = (socialSettings.schedule?.time3 || '06:00 PM').trim();

    // Check if current minute in Karachi matches time1, time2, or time3
    const isSlot1 = timeStrPK.toLowerCase() === time1.toLowerCase();
    const isSlot2 = timeStrPK.toLowerCase() === time2.toLowerCase();
    const isSlot3 = time3 ? timeStrPK.toLowerCase() === time3.toLowerCase() : false;

    if (!isSlot1 && !isSlot2 && !isSlot3 && !forceRun) {
      return {
        success: true,
        dispatched: false,
        message: `Current time (${timeStrPK} PKT) does not match scheduled slots (${time1}, ${time2}, ${time3}).`,
      };
    }

    const matchedTime = isSlot1 ? time1 : isSlot2 ? time2 : isSlot3 ? time3 : `Manual Trigger (${timeStrPK} PKT)`;
    const slotKey = `${todayPK}-${matchedTime}`;

    if (socialSettings.schedule?.lastDispatchedSlot === slotKey && !forceRun) {
      return { success: true, dispatched: false, message: `Slot ${matchedTime} has already been dispatched today.` };
    }

    console.log(`[AutoScheduler] Scheduled slot ${matchedTime} activated in Asia/Karachi. Master Switch is ON.`);

    // Get fresh token
    let token = socialSettings.googleDriveAuth?.accessToken;
    if (!token && socialSettings.googleDriveAuth?.refreshToken) {
      try {
        const refreshRes = await fetch(`http://127.0.0.1:${PORT}/api/social/drive-refresh-token`, { method: 'POST' });
        if (refreshRes.ok) {
          const d = await refreshRes.json();
          token = d.accessToken;
        }
      } catch {}
    }

    if (!token) {
      console.warn('[AutoScheduler] No valid Google Drive token available for auto-dispatch.');
      return { success: false, message: 'Google Drive is not connected or token expired.' };
    }

    const folderId = socialSettings.imageFolder?.folderId || '10xe4JndmOHCnbKH8NgzvXbcspsjMLNVw';
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false+and+mimeType+contains+'image/'&fields=files(id,name,mimeType,createdTime,webViewLink)&orderBy=createdTime+desc&pageSize=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!driveRes.ok) {
      console.warn('[AutoScheduler] Drive query failed with status', driveRes.status);
      return { success: false, message: `Google Drive query failed with status ${driveRes.status}` };
    }

    const driveData = await driveRes.json();
    const rawFiles: any[] = Array.isArray(driveData.files) ? driveData.files : [];
    const dispatched = socialSettings.dispatchedFileIds || [];

    // Filter ONLY today's created files in Asia/Karachi that have never been dispatched
    const todayUnposted = rawFiles.filter((f) => {
      const fileDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(f.createdTime || 0));
      return fileDate === todayPK && !dispatched.includes(f.id);
    });

    if (todayUnposted.length === 0) {
      console.log('[AutoScheduler] No new unposted files created today in Asia/Karachi.');
      socialSettings.schedule = {
        ...(socialSettings.schedule || { time1: '08:00 AM', time2: '02:00 PM', time3: '06:00 PM', dailyLimit: 3 }),
        lastDispatchedSlot: slotKey,
      };
      saveQueueToDisk();
      return { success: true, dispatched: false, message: 'No new unposted files created today in Asia/Karachi.' };
    }

    const fileToPost = todayUnposted[0];
    const cleanName = fileToPost.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

    let caption = `✨ ${cleanName} — اس خوبصورت پیغام کو پڑھیں اور اپنی زندگی میں مثبت تبدیلی لائیں۔ 🌸`;
    let hashtags = ['#GNZEEMarket', '#UrduWisdom', '#DailyQuotes', '#Pakistan', '#Inspiration'];

    try {
      const aiRes = await fetch(`http://127.0.0.1:${PORT}/api/social/generate-post-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: cleanName,
          platform: 'facebook',
          contentType: 'image',
          fileId: fileToPost.id,
          fileUrl: fileToPost.webViewLink,
          accessToken: token,
        }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json();
        if (aiData.caption) caption = aiData.caption;
        if (Array.isArray(aiData.hashtags) && aiData.hashtags.length > 0) hashtags = aiData.hashtags;
      }
    } catch {}

    const webhookUrl = (socialSettings.makeWebhookUrl || 'https://hook.us2.make.com/q5uh2mbvqckphmu4af2wh5nvs298v8hx').trim();
    const payload = {
      fileName: fileToPost.name,
      fileId: fileToPost.id,
      fileUrl: fileToPost.webViewLink || `https://drive.google.com/file/d/${fileToPost.id}/view`,
      fileType: 'image',
      caption,
      hashtags,
      targetPlatform: 'facebook',
      scheduledSlot: matchedTime,
      autoDispatched: true,
      timestamp: new Date().toISOString(),
    };

    const sendRes = await sendSinglePayloadToMake(webhookUrl, payload);
    if (sendRes.success) {
      if (!socialSettings.dispatchedFileIds.includes(fileToPost.id)) {
        socialSettings.dispatchedFileIds.push(fileToPost.id);
      }
      socialSettings.todayDispatchedCount = (socialSettings.todayDispatchedCount || 0) + 1;
      socialSettings.schedule = {
        ...(socialSettings.schedule || { time1: '08:00 AM', time2: '02:00 PM', time3: '06:00 PM', dailyLimit: 3 }),
        lastDispatchedSlot: slotKey,
      };

      const logItem = {
        id: `${fileToPost.id}-sched-${Date.now()}`,
        fileName: fileToPost.name,
        platform: 'facebook',
        statusText: `AUTO DISPATCHED (${matchedTime})`,
        success: true,
        timestamp: timeStrPK,
      };
      socialSettings.dispatchLogs = [logItem, ...(socialSettings.dispatchLogs || [])].slice(0, 30);
      saveQueueToDisk();
      console.log(`[AutoScheduler] Successfully auto-dispatched ${fileToPost.name} at scheduled time ${matchedTime}`);
      return {
        success: true,
        dispatched: true,
        file: fileToPost.name,
        slot: matchedTime,
        message: `Successfully dispatched today's file: ${fileToPost.name} to Make.com Webhook!`,
      };
    } else {
      return {
        success: false,
        dispatched: false,
        file: fileToPost.name,
        message: sendRes.errorMessage || 'Failed to dispatch file to Make.com Webhook.',
      };
    }
  } catch (err: any) {
    console.warn('[AutoScheduler] Error in scheduler cycle:', err?.message || err);
    return { success: false, message: err?.message || 'Scheduler exception' };
  }
}

// 7.7.5 External Cron Trigger: Can be called via GET or POST by cron-job.org / curl / Render Wakeups
app.all('/api/social/cron-trigger', async (req: Request, res: Response) => {
  const force = req.query.force === 'true' || req.body?.force === true;
  const result = await runScheduledDispatchJob(force);
  res.json({
    ...result,
    currentTimePKT: new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date()),
    schedule: socialSettings.schedule,
    autoMode: socialSettings.autoMode,
  });
});

// Periodic internal check every 30 seconds
setInterval(async () => {
  await runScheduledDispatchJob(false);
}, 30000);

// Handle any unmatched API routes with clean JSON 404
app.all("/api/*", (req: Request, res: Response) => {
  res.status(404).json({
    error: `API route ${req.method} ${req.path} not found.`,
  });
});

// Vite middleware / production static serving
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
