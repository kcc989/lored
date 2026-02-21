export interface BulkIngestItem {
  type: 'google_doc' | 'github' | 'linear' | 'text';
  documentUrl?: string;
  contentUrl?: string;
  resourceUrl?: string;
  text?: string;
  title?: string;
  displayTitle: string;
  provider: string;
}

export interface DiscoveryItem {
  id: string;
  title: string;
  url: string;
  provider: 'google' | 'github' | 'linear';
  type: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface DiscoveryResult {
  items: DiscoveryItem[];
  nextPageToken?: string;
}

export interface TopicHierarchyNode {
  topicId: string;
  name: string;
  description: string;
  factCount: number;
  coverageScore: number;
  summary: string;
  keyInsights: string[];
  children: TopicHierarchyNode[];
}
