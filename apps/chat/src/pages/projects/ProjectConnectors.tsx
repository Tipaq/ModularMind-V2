"use client";

import { useOutletContext } from "react-router-dom";
import type {
  ProjectDetail,
  ProjectResourceCounts,
} from "@modularmind/api-client";
import { MyConnections } from "../MyConnections";

interface ProjectContext {
  project: ProjectDetail;
  resourceCounts: ProjectResourceCounts | null;
  reload: () => Promise<void>;
}

export function ProjectConnectors() {
  const { project } = useOutletContext<ProjectContext>();

  return <MyConnections projectId={project.id} />;
}

export default ProjectConnectors;
