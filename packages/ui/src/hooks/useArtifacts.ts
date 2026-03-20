"use client";

import { useCallback, useState } from "react";
import type { DetectedArtifact } from "../types/artifact";

export function useArtifacts() {
  const [artifacts, setArtifacts] = useState<DetectedArtifact[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

  const addArtifact = useCallback((artifact: DetectedArtifact) => {
    setArtifacts((prev) => {
      if (prev.some((a) => a.id === artifact.id)) return prev;
      return [...prev, artifact];
    });
  }, []);

  const selectArtifact = useCallback((id: string) => {
    setSelectedArtifactId(id);
  }, []);

  const clearArtifacts = useCallback(() => {
    setArtifacts([]);
    setSelectedArtifactId(null);
  }, []);

  const selectedArtifact = artifacts.find((a) => a.id === selectedArtifactId) ?? null;

  return {
    artifacts,
    selectedArtifactId,
    selectedArtifact,
    addArtifact,
    selectArtifact,
    clearArtifacts,
  };
}
