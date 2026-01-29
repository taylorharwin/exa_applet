export type EventItem = {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  location: string;
  targetAudience: string;
  summary: string;
  sourceUrl: string;
  relevance?: number; // 1-10, personalized to userProfile if provided
};

export type EventsResponse = {
  state: string;
  fetchedAt: string; // ISO date-time
  events: EventItem[];
  debug?: {
    query: string;
    searchResults: number;
    extracted: number;
    kept: number;
  };
};
