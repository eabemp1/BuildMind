/**
 * lib/journeyAccess.ts — token-based student access for the Developer Journey
 *
 * SERVER-SIDE ONLY. Mirrors app/api/promote/create/route.ts and
 * app/api/promote/[token]/route.ts: an unguessable token in a shareable URL
 * stands in for a login. The student never creates a BuildMind account.
 *
 * Security model: journey_students has RLS enabled with zero policies, so
 * the anon/authenticated Postgrest client can never read it under any
 * circumstances. Every function here uses createAdminClient() (service
 * role) and is only ever called after a route has independently confirmed
 * either (a) the caller is the mentor (isAdminUser), for createStudentLink,
 * or (b) the caller supplied a token that matches a row, for
 * getStudentByToken. There is no other way in.
 */

import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";

export interface JourneyStudent {
  id: string;
  name: string;
  access_token: string;
  created_at: string;
}

/** Mentor-only. Generates a new unguessable link for a named student. */
export async function createStudentLink(mentorUserId: string, name: string): Promise<{ token: string; url: string; student: JourneyStudent }> {
  const trimmedName = name.trim().slice(0, 60);
  if (!trimmedName) throw new Error("Name is required");

  const token = crypto.randomBytes(24).toString("base64url");
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("journey_students")
    .insert({ name: trimmedName, access_token: token, created_by: mentorUserId })
    .select("*")
    .single();

  if (error || !data) {
    logError("journeyAccess.createStudentLink", error);
    throw new Error("Failed to create student link");
  }

  return { token, url: `/journey/s/${token}`, student: data as JourneyStudent };
}

/**
 * Resolves a token to a student row, or null if it doesn't match anything.
 * Every /api/journey/s/[token]/* route must call this first and return 404
 * (not 401/403 — don't reveal whether a token almost matched) on null.
 */
export async function getStudentByToken(token: string): Promise<JourneyStudent | null> {
  if (!token || token.length < 10) return null; // cheap guard against obviously-wrong input

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("journey_students")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();

  if (error) {
    logError("journeyAccess.getStudentByToken", error);
    return null;
  }
  if (!data) return null;

  // Best-effort activity ping — don't fail the request if this write fails.
  admin
    .from("journey_students")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(({ error: touchErr }) => {
      if (touchErr) logError("journeyAccess.touchLastActive", touchErr);
    });

  return data as JourneyStudent;
}

/** Mentor-only. Lists existing student links (for the "create link" panel). */
export async function listStudentLinks(): Promise<JourneyStudent[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("journey_students")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    logError("journeyAccess.listStudentLinks", error);
    throw new Error("Failed to load student links");
  }
  return (data ?? []) as JourneyStudent[];
}
