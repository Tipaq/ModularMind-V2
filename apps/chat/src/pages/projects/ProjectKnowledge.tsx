import { useRef, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { Search, Upload } from "lucide-react";
import { Button, Input } from "@modularmind/ui";
import type { ProjectDetail } from "@modularmind/api-client";
import { useKnowledgeHub } from "../../hooks/useKnowledgeHub";
import { DocumentsSection } from "./DocumentsSection";
import { RepositoriesSection } from "./RepositoriesSection";

interface ProjectContext {
  project: ProjectDetail;
  reload: () => void;
}

export function ProjectKnowledge() {
  const { project, reload } = useOutletContext<ProjectContext>();

  const {
    documents, totalDocuments, loading, uploading,
    search, setSearch, handleUpload, handleDelete,
  } = useKnowledgeHub({ projectId: project.id });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFilesSelected = useCallback(
    (files: FileList | null) => { if (files) handleUpload(files); },
    [handleUpload],
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Knowledge</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Documents and code sources for this project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? "Uploading..." : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => onFilesSelected(e.target.files)}
          />
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <DocumentsSection
        documents={documents}
        totalDocuments={totalDocuments}
        loading={loading}
        uploading={uploading}
        onUpload={handleUpload}
        onDelete={handleDelete}
      />

      <RepositoriesSection
        projectId={project.id}
        onRepoChange={reload}
      />
    </div>
  );
}

export default ProjectKnowledge;
