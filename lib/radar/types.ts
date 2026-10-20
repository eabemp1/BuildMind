export type RadarKind = "hackathon" | "competition" | "grant" | "accelerator" | "conference" | "workshop" | "webinar" | "meetup" | "meeting" | "person";
export type RadarType = "event" | "program" | "meeting" | "person";
export type PersonRole = "customer" | "mentor" | "investor" | "cofounder" | "collaborator" | "other";
export type RadarStatus = "new" | "saved" | "applied" | "attending" | "done" | "dismissed";

export const KIND_LABEL: Record<RadarKind, string> = {
  hackathon: "Hackathon", competition: "Competition", grant: "Grant", accelerator: "Accelerator", conference: "Conference",
  workshop: "Workshop", webinar: "Webinar", meetup: "Meetup", meeting: "Meeting", person: "Person",
};

/** An event is attended at a start time; a program is applied to before a deadline. */
export function typeOfKind(k: RadarKind): RadarType {
  if (k === "person") return "person";
  if (k === "meeting") return "meeting";
  if (k === "grant" || k === "accelerator" || k === "competition") return "program";
  return "event";
}

export interface RadarItem {
  id: string;
  type: RadarType;
  kind: RadarKind;
  kind_confirmed: boolean;
  title: string;
  organizer: string | null;
  url: string | null;
  location: string | null;
  is_virtual: boolean;
  meeting_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  deadline_at: string | null;
  eligibility: string | null;
  cost: string | null;
  role: PersonRole | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  status: RadarStatus;
  fit_score: number | null;
  fit_reasons: { reasons: string[]; cautions: string[]; band: "act" | "consider" | "skip" } | null;
  prep: RadarPrep | null;
  source?: "manual" | "discovered";
  source_text?: string | null;
}

export interface RadarPrep {
  why_it_fits: string;
  questions: string[];
  intro: string;
  ask: string;
}
