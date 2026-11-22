import { AspectRatio } from '../types';
import { wavToMp3Blob } from './audioEncoder';

export interface RenderOptions {
  aspectRatio: AspectRatio;
  durationSeconds: number;
  captionText?: string;
  brandName?: string;
  logoImg?: HTMLImageElement | null;
  primaryColor?: string;
  secondaryColor?: string;
  onProgress?: (progress: number) => void;
}

export function getDimensionsForAspectRatio(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '16:9':
    default:
      return { width: 1280, height: 720 };
  }
}

function createFallbackImage(width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e293b');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Subtle cinematic glow
      const radial = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width * 0.7);
      radial.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
      radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = c.toDataURL('image/jpeg', 0.85);
  });
}

/**
 * Renders an 8-second cinematic motion video clip with pan/zoom, brand overlay, and subtitles
 */
export async function renderSceneToVideoBlob(
  imageUrlOrList: string | string[],
  durationSeconds: number,
  captionText?: string,
  options?: Partial<RenderOptions>
): Promise<Blob> {
  const aspectRatio: AspectRatio = options?.aspectRatio || '16:9';
  const { width, height } = getDimensionsForAspectRatio(aspectRatio);
  const rawUrls = Array.isArray(imageUrlOrList) ? imageUrlOrList : [imageUrlOrList];

  return new Promise(async (resolve, reject) => {
    try {
      const cleanUrls = rawUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
      if (cleanUrls.length === 0) {
        cleanUrls.push('https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1280&q=80');
      }

      const loadedImages: HTMLImageElement[] = [];
      for (const url of cleanUrls) {
        let loaded = false;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((res) => {
          img.onload = () => {
            loaded = true;
            res(true);
          };
          img.onerror = () => {
            res(false);
          };
          img.src = url;
        });

        if (loaded) {
          loadedImages.push(img);
        } else {
          // If crossOrigin anonymous failed (often due to CORS restrictions on CDN), try without crossOrigin
          const directImg = new Image();
          await new Promise((res) => {
            directImg.onload = () => {
              loaded = true;
              res(true);
            };
            directImg.onerror = () => {
              res(false);
            };
            directImg.src = url;
          });

          if (loaded) {
            loadedImages.push(directImg);
          } else {
            // If both failed, use high quality cinematic gradient frame
            const fallbackImg = await createFallbackImage(width, height);
            loadedImages.push(fallbackImg);
          }
        }
      }

      if (loadedImages.length === 0) {
        const fallbackImg = await createFallbackImage(width, height);
        loadedImages.push(fallbackImg);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas 2D context not available');
      }

      // Check supported MIME type
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const stream = canvas.captureStream(30); // 30 fps
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 3500000,
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(chunks, { type: mimeType });
        resolve(videoBlob);
      };

      mediaRecorder.start();

      const fps = 30;
      const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
      let frame = 0;

      const renderInterval = setInterval(() => {
        if (frame >= totalFrames) {
          clearInterval(renderInterval);
          mediaRecorder.stop();
          return;
        }

        const t = frame / totalFrames; // 0 to 1

        const segmentCount = loadedImages.length;
        const currentSegment = Math.min(segmentCount - 1, Math.floor(t * segmentCount));
        const img = loadedImages[currentSegment];
        const segT = (t * segmentCount) - currentSegment;

        // Cinematic camera movement per segment
        let scale = 1.05;
        let panX = 0;
        let panY = 0;

        if (segmentCount > 1) {
          scale = 1.04 + segT * 0.12;
          panX = (segT - 0.5) * (width * 0.04);
          panY = (segT - 0.5) * (height * 0.03);
        } else if (durationSeconds > 10) {
          const phases = durationSeconds >= 18 ? 3 : 2;
          const currentPhase = Math.min(phases - 1, Math.floor(t * phases));
          const phaseProgress = (t * phases) - currentPhase;

          if (currentPhase === 0) {
            scale = 1.04 + phaseProgress * 0.12;
            panX = (phaseProgress - 0.5) * (width * 0.04);
            panY = (phaseProgress - 0.5) * (height * 0.03);
          } else if (currentPhase === 1) {
            scale = 1.16 - phaseProgress * 0.08;
            panX = (0.5 - phaseProgress) * (width * 0.05);
            panY = -(phaseProgress - 0.5) * (height * 0.03);
          } else {
            scale = 1.05 + phaseProgress * 0.10;
            panX = (phaseProgress - 0.5) * (width * 0.03);
            panY = (phaseProgress - 0.5) * (height * 0.02);
          }
        } else {
          scale = 1.05 + t * 0.14;
          panX = (t - 0.5) * (width * 0.05);
          panY = (t - 0.5) * (height * 0.04);
        }

        ctx.save();
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, width, height);

        // Calculate aspect fill for background image
        ctx.translate(width / 2 + panX, height / 2 + panY);
        ctx.scale(scale, scale);

        const imgRatio = img.width / img.height;
        const canvasRatio = width / height;
        let drawW = width;
        let drawH = height;

        if (imgRatio > canvasRatio) {
          drawW = height * imgRatio;
        } else {
          drawH = width / imgRatio;
        }

        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();

        // Cinematic vignette overlay
        const maxDim = Math.max(width, height);
        const gradient = ctx.createRadialGradient(
          width / 2,
          height / 2,
          maxDim * 0.25,
          width / 2,
          height / 2,
          maxDim * 0.65
        );
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Brand Kit: Watermark / Logo / Name at top
        if (options?.brandName) {
          ctx.save();
          ctx.font = 'bold 16px "Noto Nastaliq Urdu", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillStyle = 'rgba(2, 6, 23, 0.65)';
          const badgeW = ctx.measureText(options.brandName).width + 30;
          ctx.beginPath();
          ctx.roundRect(24, 24, badgeW, 34, 8);
          ctx.fill();
          ctx.fillStyle = options.primaryColor || '#f59e0b';
          ctx.fillText(options.brandName, 38, 47);
          ctx.restore();
        }

        // Subtitle / Caption bar at bottom
        if (captionText) {
          ctx.save();
          const fontSize = aspectRatio === '9:16' ? 24 : aspectRatio === '1:1' ? 26 : 28;
          ctx.font = `bold ${fontSize}px "Noto Nastaliq Urdu", "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';

          const boxW = width * 0.88;
          const boxH = 54;
          const boxX = (width - boxW) / 2;
          const boxY = height - (aspectRatio === '9:16' ? 140 : 85);

          // Subtitle background pill with subtle accent border
          ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, 12);
          ctx.fill();

          ctx.strokeStyle = options?.primaryColor ? `${options.primaryColor}88` : 'rgba(245, 158, 11, 0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Text with soft yellow/amber accent
          ctx.fillStyle = '#fef08a';
          ctx.fillText(captionText, width / 2, boxY + 36);
          ctx.restore();
        }

        frame++;
        if (options?.onProgress && frame % 15 === 0) {
          options.onProgress(Math.round((frame / totalFrames) * 100));
        }
      }, 1000 / fps);
    } catch (err) {
      const safeError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Scene video rendering failed');
      reject(safeError);
    }
  });
}

/**
 * Synthesizes a soft ambient musical background buffer (sine/triangle chords)
 */
function createAmbientMusicBuffer(durationSeconds: number, sampleRate = 24000, volume = 0.25): Int16Array {
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const buffer = new Int16Array(totalSamples);
  const chords = [
    [261.63, 329.63, 392.00], // C major
    [220.00, 261.63, 329.63], // A minor
    [174.61, 220.00, 261.63], // F major
    [196.00, 246.94, 293.66], // G major
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const chordIndex = Math.floor(t / 4) % chords.length;
    const chord = chords[chordIndex];

    let sampleVal = 0;
    for (const freq of chord) {
      // Soft gentle warm chord harmonic
      sampleVal += Math.sin(2 * Math.PI * freq * t) * 0.3;
      sampleVal += Math.sin(2 * Math.PI * (freq * 0.5) * t) * 0.15; // sub bass warmth
    }

    // Apply gentle tremolo and user volume
    const tremolo = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.5 * t);
    sampleVal = sampleVal * tremolo * volume * 0.3;

    // Clamp
    sampleVal = Math.max(-1, Math.min(1, sampleVal));
    buffer[i] = Math.floor(sampleVal * 32767);
  }

  return buffer;
}

/**
 * Combines multiple WAV base64 audio tracks into one seamless merged MP3 blob
 */
export function mergeWavAudiosToMp3(base64Audios: string[], bgMusicVolume = 0): Blob {
  const allSamples: Int16Array[] = [];
  let totalLength = 0;

  for (const b64 of base64Audios) {
    if (!b64) continue;
    try {
      const binaryString = atob(b64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      let pcmOffset = 44;
      const view = new DataView(bytes.buffer);
      if (
        bytes.byteLength > 44 &&
        view.getUint8(0) === 0x52 &&
        view.getUint8(1) === 0x49 &&
        view.getUint8(2) === 0x46 &&
        view.getUint8(3) === 0x46
      ) {
        for (let i = 12; i < Math.min(bytes.byteLength - 8, 200); i++) {
          if (
            view.getUint8(i) === 0x64 &&
            view.getUint8(i + 1) === 0x61 &&
            view.getUint8(i + 2) === 0x74 &&
            view.getUint8(i + 3) === 0x61
          ) {
            pcmOffset = i + 8;
            break;
          }
        }
      }

      const pcmBytes = bytes.byteLength - pcmOffset;
      const sampleCount = (pcmBytes - (pcmBytes % 2)) >> 1;
      const sampleArray = new Int16Array(bytes.buffer, pcmOffset, sampleCount);
      allSamples.push(sampleArray);
      totalLength += sampleCount;

      // Add a slight 0.3s pause between scenes
      const pauseSamples = new Int16Array(7200);
      allSamples.push(pauseSamples);
      totalLength += 7200;
    } catch (err) {
      console.warn('Error reading audio chunk for merger:', err);
    }
  }

  const mergedBuffer = new Int16Array(totalLength);
  let offset = 0;
  for (const chunk of allSamples) {
    mergedBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  // Mix background music if enabled
  if (bgMusicVolume > 0 && totalLength > 0) {
    const durationSec = totalLength / 24000;
    const bgMusic = createAmbientMusicBuffer(durationSec, 24000, bgMusicVolume);
    for (let i = 0; i < totalLength; i++) {
      const voice = mergedBuffer[i] / 32768.0;
      const music = (bgMusic[i] || 0) / 32768.0;
      let mixed = voice + music;
      mixed = Math.max(-1, Math.min(1, mixed));
      mergedBuffer[i] = Math.floor(mixed * 32767);
    }
  }

  // Wrap into WAV header then convert to MP3
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = mergedBuffer.byteLength;

  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  view.setUint32(0, 0x52494646, false); // RIFF
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // WAVE
  view.setUint32(12, 0x666d7420, false); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint32(36, 0x64617461, false); // data
  view.setUint32(40, dataSize, true);

  const wavBytes = new Uint8Array(wavBuffer, 44);
  wavBytes.set(new Uint8Array(mergedBuffer.buffer));

  return wavToMp3Blob(wavBuffer, 24000, 1, 128);
}

/**
 * Merges multiple video clips sequentially into one unified final video with subtitles & voiceover
 */
export async function mergeFullVideo(
  scenes: {
    videoBlobUrl?: string;
    visualUrl?: string;
    captionText?: string;
    durationSeconds: number;
    audioBase64?: string;
  }[],
  options: {
    aspectRatio: AspectRatio;
    brandName?: string;
    primaryColor?: string;
    burnSubtitles: boolean;
    bgMusicVolume: number;
    onProgress?: (progress: number, statusText: string) => void;
  }
): Promise<Blob> {
  const { width, height } = getDimensionsForAspectRatio(options.aspectRatio);

  return new Promise(async (resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');

      // Setup audio context & destination stream so audio is recorded together with video
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioDest = audioCtx.createMediaStreamDestination();

      // Check supported MIME type
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const canvasStream = canvas.captureStream(30);
      // Combine video track and audio track
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ]);

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 4000000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        try {
          audioCtx.close();
        } catch {}
        const finalBlob = new Blob(chunks, { type: mimeType });
        resolve(finalBlob);
      };

      recorder.start();

      // Preload scene images
      const loadedImages: HTMLImageElement[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = s.visualUrl || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1280&q=80';
        await new Promise((res) => {
          img.onload = () => res(true);
          img.onerror = () => res(true);
        });
        loadedImages.push(img);
      }

      // Play audio chunks through audio context as scenes progress
      let currentSceneIndex = 0;
      const fps = 30;

      for (let sIdx = 0; sIdx < scenes.length; sIdx++) {
        currentSceneIndex = sIdx;
        const scene = scenes[sIdx];
        const img = loadedImages[sIdx];
        const duration = scene.durationSeconds || 8;
        const totalFrames = duration * fps;

        options.onProgress?.(
          Math.round((sIdx / scenes.length) * 100),
          `سین ${sIdx + 1} آف ${scenes.length} رینڈر ہو رہا ہے...`
        );

        // If audio exists, play it into audio context
        if (scene.audioBase64) {
          try {
            const raw = atob(scene.audioBase64);
            const rawBytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) rawBytes[i] = raw.charCodeAt(i);
            const audioBuffer = await audioCtx.decodeAudioData(rawBytes.buffer);
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioDest);
            source.start();
          } catch (audioErr) {
            console.warn('Could not decode scene audio for video merge:', audioErr);
          }
        }

        // Render frames for this scene
        for (let f = 0; f < totalFrames; f++) {
          const t = f / totalFrames;
          const scale = 1.04 + t * 0.12;
          const panX = (t - 0.5) * (width * 0.04);
          const panY = (t - 0.5) * (height * 0.03);

          ctx.save();
          ctx.fillStyle = '#020617';
          ctx.fillRect(0, 0, width, height);

          ctx.translate(width / 2 + panX, height / 2 + panY);
          ctx.scale(scale, scale);

          const imgRatio = img.width / img.height;
          const canvasRatio = width / height;
          let drawW = width;
          let drawH = height;
          if (imgRatio > canvasRatio) drawW = height * imgRatio;
          else drawH = width / imgRatio;

          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();

          // Subtle vignette
          const maxDim = Math.max(width, height);
          const grad = ctx.createRadialGradient(
            width / 2,
            height / 2,
            maxDim * 0.25,
            width / 2,
            height / 2,
            maxDim * 0.65
          );
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, 'rgba(0,0,0,0.5)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);

          // Brand Watermark
          if (options.brandName) {
            ctx.save();
            ctx.font = 'bold 16px "Noto Nastaliq Urdu", sans-serif';
            ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
            const bWidth = ctx.measureText(options.brandName).width + 28;
            ctx.beginPath();
            ctx.roundRect(20, 20, bWidth, 32, 6);
            ctx.fill();
            ctx.fillStyle = options.primaryColor || '#f59e0b';
            ctx.fillText(options.brandName, 34, 42);
            ctx.restore();
          }

          // Subtitles burned-in
          if (options.burnSubtitles && scene.captionText) {
            ctx.save();
            const fontSize = options.aspectRatio === '9:16' ? 24 : 28;
            ctx.font = `bold ${fontSize}px "Noto Nastaliq Urdu", "Segoe UI", sans-serif`;
            ctx.textAlign = 'center';
            const bW = width * 0.86;
            const bH = 50;
            const bX = (width - bW) / 2;
            const bY = height - (options.aspectRatio === '9:16' ? 140 : 85);

            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.beginPath();
            ctx.roundRect(bX, bY, bW, bH, 10);
            ctx.fill();

            ctx.fillStyle = '#fef08a';
            ctx.fillText(scene.captionText, width / 2, bY + 34);
            ctx.restore();
          }

          // Frame pacing
          await new Promise((r) => setTimeout(r, 1000 / fps));
        }
      }

      options.onProgress?.(100, 'فائنلائز ہو رہا ہے...');
      setTimeout(() => {
        recorder.stop();
      }, 500);
    } catch (err) {
      reject(err);
    }
  });
}
