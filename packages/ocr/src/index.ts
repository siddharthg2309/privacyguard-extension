export const OCR_STAGES = ["initializing", "loading_language", "recognizing"] as const;
export type OcrStage = (typeof OCR_STAGES)[number];

export type OcrProgress = {
  stage: OcrStage;
  progress: number;
};

export type OcrInput = {
  data: ArrayBuffer;
  mediaType?: string;
  language: "eng";
};

export type OcrRuntime = {
  recognize(
    input: OcrInput,
    signal: AbortSignal,
    onProgress: (progress: OcrProgress) => void,
  ): Promise<string>;
  dispose(): Promise<void>;
};

export function normalizeOcrProgress(stage: string, progress: number): OcrProgress | undefined {
  if (!OCR_STAGES.includes(stage as OcrStage)) return undefined;
  return {
    stage: stage as OcrStage,
    progress: Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)),
  };
}
