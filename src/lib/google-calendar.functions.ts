import { createServerFn } from "@tanstack/react-start";

type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  status?: string;
};

export type SyncedGoogleEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  htmlLink: string | null;
  all_day: boolean;
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

export const fetchGoogleCalendarDay = createServerFn({ method: "POST" })
  .inputValidator((data: { dayISO: string }) => data)
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const googleKey = process.env.GOOGLE_CALENDAR_API_KEY;
    if (!lovableKey || !googleKey) {
      return { events: [] as SyncedGoogleEvent[], error: "Google Calendar não está ligado." };
    }

    const day = new Date(data.dayISO);
    if (Number.isNaN(day.getTime())) {
      return { events: [] as SyncedGoogleEvent[], error: "Data inválida" };
    }
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const params = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50",
    });

    try {
      const res = await fetch(`${GATEWAY_URL}/calendars/primary/events?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": googleKey,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          events: [] as SyncedGoogleEvent[],
          error: `Google Calendar: ${res.status} ${text.slice(0, 120)}`,
        };
      }
      const json = (await res.json()) as { items?: GoogleEvent[] };
      const items = json.items ?? [];
      const events: SyncedGoogleEvent[] = items
        .filter((e) => e.status !== "cancelled")
        .map((e) => {
          const allDay = !!e.start?.date && !e.start?.dateTime;
          const starts_at = e.start?.dateTime ?? `${e.start?.date}T00:00:00Z`;
          const ends_at = e.end?.dateTime ?? `${e.end?.date}T00:00:00Z`;
          return {
            id: e.id,
            title: e.summary || "(sem título)",
            description: e.description ?? null,
            location: e.location ?? null,
            starts_at,
            ends_at,
            htmlLink: e.htmlLink ?? null,
            all_day: allDay,
          };
        });
      return { events, error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { events: [] as SyncedGoogleEvent[], error: `Falha na sincronização: ${message}` };
    }
  });
