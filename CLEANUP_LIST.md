# Cleanup list (nothing here has been deleted)

Found by scanning every file in `components/` and `lib/` for an import of it from `app/`, `components/`, `lib/`, `scripts/` or `middleware.ts`. A file that is only loaded by a string path or a dynamic import could be missed, so treat these as "very likely unused".

**How to remove them safely:** delete 5 to 8 files, run `npx tsc --noEmit` and `npx vitest run`, and only continue if both pass. Commit each batch separately so one can be undone.

## Unused files (42 files, about 6,600 lines)
- `components/BreakMyStartup2.tsx` (360 lines)
- `components/CognitiveLoadCheckin.tsx` (150 lines)
- `components/ConsentLedgerCTA.tsx` (335 lines)
- `components/ExecutionScorecardModal.tsx` (110 lines)
- `components/FirstTaskNotificationPrompt.tsx` (295 lines)
- `components/FoundingMemberBadge.tsx` (63 lines)
- `components/MobileCheckin.tsx` (324 lines)
- `components/MorningBriefingCard.tsx` (145 lines)
- `components/QuickWinStrip.tsx` (126 lines)
- `components/ReflectSheet.tsx` (387 lines)
- `components/TaskQualityFeedback.tsx` (141 lines)
- `components/UpgradeCelebration.tsx` (164 lines)
- `components/UrgencyBanner.tsx` (165 lines)
- `components/WeeklyReportCard.tsx` (418 lines)
- `components/break/EvidencePanel.tsx` (380 lines)
- `components/dashboard-card.tsx` (96 lines)
- `components/dashboard-visuals.tsx` (55 lines)
- `components/landing/dashboard-preview.tsx` (179 lines)
- `components/layout/page-hero.tsx` (56 lines)
- `components/layout/responsive-layout.tsx` (13 lines)
- `components/milestone-card.tsx` (32 lines)
- `components/milestone-chart.tsx` (30 lines)
- `components/project-card.tsx` (108 lines)
- `components/project-table.tsx` (57 lines)
- `components/providers/IdleDetectionProvider.tsx` (75 lines)
- `components/startup-timeline.tsx` (81 lines)
- `components/tour/TourOverlay.tsx` (284 lines)
- `components/ui/AIVisualWidget.tsx` (240 lines)
- `components/ui/BuildMindLogo.tsx` (134 lines)
- `components/ui/Divider.tsx` (6 lines)
- `components/ui/ErrorState.tsx` (7 lines)
- `components/ui/IconButton.tsx` (7 lines)
- `components/ui/SectionHeader.tsx` (14 lines)
- `components/ui/StatCard.tsx` (61 lines)
- `components/ui/Tooltip.tsx` (7 lines)
- `lib/cofounder/index.ts` (20 lines)
- `lib/journeyCalls.ts` (180 lines)
- `lib/journeyPlacement.ts` (357 lines)
- `lib/reports.ts` (702 lines)
- `lib/server/contextCache.ts` (87 lines)
- `lib/server/errorReporter.ts` (120 lines)
- `lib/server/stageTransitionCache.ts` (66 lines)

## Used only by tests (keep unless you also delete the test)
- `components/today/DayRibbon.tsx`
- `lib/server/planGuard.ts`

## Look before deleting
- `components/CognitiveLoadCheckin.tsx` exists but nothing shows it. Either wire it into Today or delete it.
- `components/UpgradeCelebration.tsx` is unused today. It was edited in round 40, so it is safe to delete.
- `lib/reports.ts` (702 lines) has no importer. Check `app/reports` before deleting.
- `components/ReflectSheet.tsx` is the bottom sheet the nav comments describe, but it is unused. Keep it if you plan to merge `/reflect` into Today.

## Root clutter (safe to delete from the repo root)
- `BuildMind-improved.zip`
- `package.json.bak`
- `route.ts` (the stray file at the repo root, not the ones under `app/`)
- `merge-report.json`
- `zip-compare-report.csv`
- Duplicate schema files in `supabase/`: `schema-chunked.sql`, `schema-idempotent.sql`, `all_migrations_v8_combined.sql`. Keep `supabase/migrations/`.
