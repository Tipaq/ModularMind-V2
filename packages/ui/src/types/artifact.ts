export type ArtifactType = "code" | "file" | "html";

export interface DetectedArtifact {
  id: string;
  type: ArtifactType;
  title: string;
  language: string;
  content: string;
  lineCount: number;
  sourceMessageId: string;
}
