export type AdPlacement = 'pre-roll' | 'mid-roll' | 'post-roll';

export type AdBreak = {
  tagUrl: string;
  placement: AdPlacement;
};

export interface AdPlaybackAdapter {
  prepare(titleId: string, placement: AdPlacement): Promise<AdBreak | null>;
  recordEvent(sessionToken: string, eventType: string): Promise<void>;
}
