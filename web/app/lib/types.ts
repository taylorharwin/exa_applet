export type EventItem = {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  location: string;
  targetAudience: string;
  summary: string;
  sourceUrl: string;
  imageUrl?: string;
};

export type EventsResponse = {
  state: string;
  fetchedAt: string; // ISO date-time
  events: EventItem[];
  debug?: {
    [key: string]: unknown;
  };
};
