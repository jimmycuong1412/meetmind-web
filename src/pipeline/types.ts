export interface TranscriptSegment {
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface Insight {
  title: string;
  summary: string;
  actionItems: string[];
  createdAt: number;
}
