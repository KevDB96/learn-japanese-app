import type { PronunciationManifest } from "./types.ts";

export interface PronunciationProvider {
  readonly id: string;
  canPlay(entry: PronunciationManifest["entries"][number]): boolean;
  play(entry: PronunciationManifest["entries"][number]): Promise<void>;
}

/** Logical IDs keep curriculum independent from bundled paths and provider implementation. */
export async function playPronunciation(audioId: string, manifest: PronunciationManifest, providers: readonly PronunciationProvider[]): Promise<boolean> {
  const entry = manifest.entries.find((item) => item.id === audioId);
  if (!entry) return false;
  const provider = providers.find((item) => item.id === entry.provider && item.canPlay(entry));
  if (!provider) return false;
  await provider.play(entry);
  return true;
}

/** Optional fallback; capability and browser support stay outside curriculum and scheduling logic. */
export function createSpeechSynthesisProvider(): PronunciationProvider {
  return {
    id: "browser-speech-synthesis",
    canPlay: (entry) => !!entry.text && typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined",
    async play(entry) {
      if (!this.canPlay(entry)) return;
      await new Promise<void>((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(entry.text!);
        utterance.lang = "ja-JP";
        utterance.onend = () => resolve();
        utterance.onerror = (event) => reject(new Error(`Speech synthesis failed: ${event.error}`));
        window.speechSynthesis.speak(utterance);
      });
    },
  };
}
