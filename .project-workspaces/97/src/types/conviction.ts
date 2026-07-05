// src/types/conviction.ts
// Conviction Engine — Core Graph Schema

export type EdgeType = "invalidates" | "supersedes" | "supports";

export type Layer = "conviction" | "principle" | "execution";

export interface ConvictionNode {
  id: string;
  layer: Layer;
  content: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  metadata?: Record<string, unknown>;
}

export interface ConvictionEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: EdgeType;
  rationale: string;
  createdAt: string;
  humanReviewed: boolean;
}

export interface ConvictionGraph {
  nodes: ConvictionNode[];
  edges: ConvictionEdge[];
}

export interface ConvictionChangeEvent {
  nodeId: string;
  previousContent: string;
  updatedContent: string;
  triggeredBy: string;
  timestamp: string;
  humanAnnotated: boolean;
  annotation?: string;
}
