import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { cn } from "@modularmind/ui";
import { useKnowledgeStore } from "../../stores/knowledge";

interface Props {
  collectionId: string;
}

export function UploadZone({ collectionId }: Props) {
  const { uploadDocument, uploading } = useKnowledgeStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      await uploadDocument(collectionId, file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
        isDragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/40",
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      {uploading ? (
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
      ) : (
        <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
      )}
      <p className="text-sm text-muted-foreground mt-2">
        {uploading ? "Uploading..." : "Drop files or click to upload"}
      </p>
      <p className="text-xs text-muted-foreground/60 mt-1">
        PDF, DOCX, TXT, MD — max 50 MB
      </p>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.docx,.doc,.txt,.md,.markdown"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
