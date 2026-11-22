// @ts-ignore
import lamejs from 'lamejs';

/**
 * Converts a raw PCM or WAV ArrayBuffer into a real MP3 Blob using LAME encoder
 */
export function wavToMp3Blob(
  wavOrPcmBuffer: ArrayBuffer,
  sampleRate = 24000,
  numChannels = 1,
  kbps = 128
): Blob {
  try {
    const view = new DataView(wavOrPcmBuffer);
    let pcmOffset = 0;

    // Check for 'RIFF' WAV container
    if (wavOrPcmBuffer.byteLength > 44) {
      const isRiff =
        view.getUint8(0) === 0x52 && // 'R'
        view.getUint8(1) === 0x49 && // 'I'
        view.getUint8(2) === 0x46 && // 'F'
        view.getUint8(3) === 0x46; // 'F'

      if (isRiff) {
        // Search for 'data' subchunk header
        for (let i = 12; i < Math.min(wavOrPcmBuffer.byteLength - 8, 200); i++) {
          if (
            view.getUint8(i) === 0x64 && // 'd'
            view.getUint8(i + 1) === 0x61 && // 'a'
            view.getUint8(i + 2) === 0x74 && // 't'
            view.getUint8(i + 3) === 0x61 // 'a'
          ) {
            pcmOffset = i + 8;
            break;
          }
        }
        if (pcmOffset === 0) pcmOffset = 44;
      }
    }

    const byteLen = wavOrPcmBuffer.byteLength - pcmOffset;
    // Align to 2-byte boundary
    const alignedByteLen = byteLen - (byteLen % 2);
    const pcmLength = alignedByteLen >> 1; // 16-bit samples

    const samples = new Int16Array(wavOrPcmBuffer, pcmOffset, pcmLength);

    const Mp3EncoderClass = lamejs.Mp3Encoder || (lamejs as any).Mp3Encoder;
    if (!Mp3EncoderClass) {
      throw new Error('Lamejs Mp3Encoder not available');
    }

    const mp3encoder = new Mp3EncoderClass(numChannels, sampleRate, kbps);
    const mp3Data: Uint8Array[] = [];

    const sampleBlockSize = 1152;
    for (let i = 0; i < samples.length; i += sampleBlockSize) {
      const sampleChunk = samples.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(new Uint8Array(mp3buf));
      }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }

    return new Blob(mp3Data as unknown as BlobPart[], { type: 'audio/mp3' });
  } catch (error) {
    console.warn('Lamejs MP3 encoding failed, falling back to audio blob:', error);
    return new Blob([wavOrPcmBuffer] as unknown as BlobPart[], { type: 'audio/mp3' });
  }
}

export function wavBase64ToMp3Blob(base64: string): Blob {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return wavToMp3Blob(bytes.buffer);
}
