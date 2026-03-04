type TaskCardProps = {
  taskId: number;
  title: string;
  milestone: string;
  due: string;
  isCompleted?: boolean;
  isLoading?: boolean;
  showFeedback?: boolean;
  onComplete?: (taskId: number) => void;
  onFeedback?: (taskId: number, feedbackType: "positive" | "negative") => void;
};

export default function TaskCard({
  taskId,
  title,
  milestone,
  due,
  isCompleted = false,
  isLoading = false,
  showFeedback = false,
  onComplete,
  onFeedback,
}: TaskCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{milestone}</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">Due: {due}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onComplete?.(taskId)}
            disabled={isCompleted || isLoading}
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLoading ? "Saving..." : isCompleted ? "Completed" : "Complete"}
          </button>
          {showFeedback ? (
            <>
              <button
                onClick={() => onFeedback?.(taskId, "positive")}
                disabled={isLoading}
                className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                + Feedback
              </button>
              <button
                onClick={() => onFeedback?.(taskId, "negative")}
                disabled={isLoading}
                className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                - Feedback
              </button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
