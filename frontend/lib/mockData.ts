export type Metric = {
  label: string;
  value: string;
  hint: string;
};

export type Task = {
  id: string;
  title: string;
  milestone: string;
  due: string;
  status: "active" | "completed";
};

export type Milestone = {
  id: string;
  title: string;
  week: number;
  tasks: Task[];
};

export const metrics: Metric[] = [
  { label: "Execution Score", value: "72", hint: "+5 this week" },
  { label: "Projects", value: "3", hint: "1 active sprint" },
  { label: "Milestones", value: "8", hint: "5 in progress" },
  { label: "Tasks", value: "24", hint: "14 completed" },
  { label: "Consistency", value: "81%", hint: "4-week avg" }
];

export const milestones: Milestone[] = [
  {
    id: "m1",
    title: "Research & Validation",
    week: 1,
    tasks: [
      { id: "t1", title: "Interview 5 target users", milestone: "Week 1", due: "Tue", status: "completed" },
      { id: "t2", title: "Define problem statement", milestone: "Week 1", due: "Wed", status: "active" },
      { id: "t3", title: "Create validation brief", milestone: "Week 1", due: "Fri", status: "active" }
    ]
  },
  {
    id: "m2",
    title: "MVP Design",
    week: 2,
    tasks: [
      { id: "t4", title: "Draft MVP scope", milestone: "Week 2", due: "Mon", status: "active" },
      { id: "t5", title: "Wireframe core flow", milestone: "Week 2", due: "Thu", status: "active" },
      { id: "t6", title: "Define launch metrics", milestone: "Week 2", due: "Fri", status: "active" }
    ]
  }
];

export const activeTasks: Task[] = milestones.flatMap((milestone) => milestone.tasks).filter((task) => task.status === "active");

export const scoreHistory = [
  { week: "W1", score: 52 },
  { week: "W2", score: 58 },
  { week: "W3", score: 64 },
  { week: "W4", score: 72 }
];
