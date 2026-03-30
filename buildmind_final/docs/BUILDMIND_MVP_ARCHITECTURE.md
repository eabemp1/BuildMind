# BuildMind MVP Architecture

## 1) Recommended Folder Structure

```text
app/
  core/
  db/
    migrations/
  execution/
  models/
    models.py
  routes/
    auth.py
    projects.py
    tasks.py
    feedback.py
    dashboard.py
    activity.py
    notifications.py
    newsletter.py
    admin.py
  schemas/
    auth.py
    project.py
    feedback.py
    dashboard.py
    buildmind.py
  services/
    auth_service.py
    project_service.py
    task_service.py
    feedback_service.py
    dashboard_service.py
    buildmind_service.py
frontend/
  app/
    dashboard/
    projects/
    feedback/
    activity/
    notifications/
    profile/
    settings/
    admin/
      dashboard/
      users/
      projects/
      feedback/
      newsletter/
      activity/
      system-settings/
  components/
    AppShell.tsx
    Sidebar.tsx
    Topbar.tsx
    ExecutionScoreCard.tsx
    ExecutionStreakCard.tsx
    StartupJourney.tsx
    JourneyPhaseCard.tsx
    ActiveProjectsList.tsx
    RecentActivityFeed.tsx
    NextActionsPanel.tsx
    NotificationBell.tsx
    NotificationDropdown.tsx
    NotificationItem.tsx
    OnboardingTour.tsx
    TourStep.tsx
    AdminSidebar.tsx
  lib/
    api.ts
```

## 2) Database Schema

- `users`: `id`, `username`, `email`, `hashed_password`, `password_hash`, `bio`, `avatar_url`, `onboarding_completed`, `is_active`, `is_admin`, `created_at`
- `projects`: `id`, `user_id`, `title`, `description`, `problem`, `target_users`, `progress`, `roadmap_json`, `is_archived`, `archived_at`, `created_at`
- `milestones`: `id`, `project_id`, `title`, `status`, `order_index`, `completed_at`, `week_number`, `is_completed`
- `tasks`: `id`, `milestone_id`, `title`, `description`, `status`, `priority`, `due_date`, `is_completed`, `completed_at`
- `feedback`: `id`, `project_id`, `user_id`, `task_id`, `feedback_type`, `rating`, `category`, `comment`, `created_at`
- `activity_logs`: `id`, `user_id`, `activity_type`, `reference_id`, `created_at`
- `notifications`: `id`, `user_id`, `type`, `message`, `reference_id`, `is_read`, `created_at`
- `notification_preferences`: `id`, `user_id`, `feedback_received`, `milestone_completed`, `task_assigned`, `updated_at`
- `newsletter_subscribers`: `id`, `email`, `subscribed`, `created_at`
- Existing tables retained: `execution_score_history`, `app_state`, `reminder_preferences`, `user_profiles`

## 3) Backend Models

Implemented in `app/models/models.py` with SQLAlchemy `Mapped` models:

- `User`
- `Project`
- `Milestone`
- `Task`
- `Feedback`
- `ActivityLog`
- `Notification`
- `NotificationPreference`
- `NewsletterSubscriber`
- `ExecutionScoreHistory`
- `AppState`
- `ReminderPreference`
- `UserProfile`

## 4) API Endpoints

### Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/password-reset`
- `GET /api/v1/auth/me`
- `PATCH /api/v1/auth/me`
- `POST /api/v1/auth/change-password`
- `DELETE /api/v1/auth/me`

### Projects / Roadmaps / Milestones / Tasks
- `POST /api/v1/projects`
- `GET /api/v1/projects`
- `GET /api/v1/projects/{project_id}`
- `PATCH /api/v1/projects/{project_id}`
- `DELETE /api/v1/projects/{project_id}`
- `POST /api/v1/projects/{project_id}/archive`
- `POST /api/v1/projects/{project_id}/generate-roadmap`
- `PATCH /api/v1/milestones/{milestone_id}`
- `POST /api/v1/projects/{project_id}/milestones/reorder`
- `POST /api/v1/milestones/{milestone_id}/tasks`
- `PATCH /api/v1/tasks/{task_id}`
- `POST /api/v1/tasks/{task_id}/complete`
- `DELETE /api/v1/tasks/{task_id}`

### Feedback
- `POST /api/v1/feedback`
- `GET /api/v1/projects/{project_id}/feedback`

### Dashboard / Activity / Notifications
- `GET /api/v1/dashboard`
- `GET /api/v1/dashboard/buildmind`
- `GET /api/v1/activity`
- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/{id}/read`
- `GET /api/v1/notifications/preferences`
- `POST /api/v1/notifications/preferences`

### Newsletter
- `POST /api/v1/newsletter/subscribe`
- `POST /api/v1/newsletter/unsubscribe`

### Admin
- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/{id}/suspend`
- `DELETE /api/v1/admin/users/{id}`
- `GET /api/v1/admin/users/{id}/activity`
- `GET /api/v1/admin/projects`
- `GET /api/v1/admin/projects/{id}`
- `GET /api/v1/admin/feedback`
- `DELETE /api/v1/admin/feedback/{id}`
- `GET /api/v1/admin/newsletter`
- `GET /api/v1/admin/newsletter/export`
- `GET /api/v1/admin/activity`
- `GET /api/v1/admin/system-settings`
- `POST /api/v1/admin/system-settings`

## 5) Frontend Pages

- `/dashboard`
- `/projects`
- `/feedback`
- `/activity`
- `/notifications`
- `/profile`
- `/settings`
- `/admin/dashboard`
- `/admin/users`
- `/admin/projects`
- `/admin/feedback`
- `/admin/newsletter`
- `/admin/activity`
- `/admin/system-settings`

## 6) React Components

- `ExecutionScoreCard`
- `ExecutionStreakCard`
- `StartupJourney`
- `JourneyPhaseCard`
- `ActiveProjectsList`
- `RecentActivityFeed`
- `NextActionsPanel`
- `NotificationBell`
- `NotificationDropdown`
- `NotificationItem`
- `OnboardingTour`
- `TourStep`
- `AdminSidebar`

## 7) Admin Dashboard UI

- Sidebar-driven admin workspace under `/admin/*`
- KPI blocks for totals and DAU
- Dedicated pages for users, projects, feedback, newsletter, activity logs, and system settings
- Controls for suspend/delete users and moderate feedback

## 8) Example API Responses

### `GET /api/v1/dashboard/buildmind`
```json
{
  "success": true,
  "data": {
    "execution_score": 62.5,
    "execution_streak": 4,
    "journey_progress": 33.33,
    "active_projects": [
      {"id": 12, "title": "BuildMind MVP", "progress": 40, "stage": "Prototype"}
    ],
    "recent_activity": [
      {"id": 41, "activity_type": "task_completed", "reference_id": 133, "created_at": "2026-03-09T10:30:00Z"}
    ],
    "notifications": [
      {"id": 9, "type": "feedback_received", "message": "Your project received new feedback.", "reference_id": 55, "is_read": false, "created_at": "2026-03-09T10:40:00Z"}
    ],
    "next_actions": [
      {"task_id": 141, "title": "Interview 10 users", "priority": "high", "due_date": null}
    ],
    "weekly_progress": {"tasks_completed": 8, "milestones_completed": 1}
  }
}
```

### `POST /api/v1/projects/12/generate-roadmap`
```json
{
  "success": true,
  "data": {
    "id": 12,
    "user_id": 3,
    "title": "BuildMind MVP",
    "progress": 0,
    "milestones": [
      {"id": 1, "title": "Idea", "status": "pending", "order_index": 0, "tasks": []}
    ]
  }
}
```

### `GET /api/v1/admin/dashboard`
```json
{
  "success": true,
  "data": {
    "total_users": 128,
    "total_projects": 91,
    "total_milestones": 522,
    "total_tasks": 2044,
    "daily_active_users": 37,
    "user_growth": [],
    "project_creation_trends": [],
    "task_completion_rates": [{"label": "completed", "rate": 41.2}]
  }
}
```
