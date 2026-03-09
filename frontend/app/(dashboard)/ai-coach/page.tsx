"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAICoachAdvice, getProjectsForCurrentUser } from "@/lib/buildmind";

export default function AICoachPage() {
  const [advice, setAdvice] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const projects = await getProjectsForCurrentUser();
        if (!projects.length) {
          setAdvice(["Create your first project to receive AI coaching guidance."]);
          return;
        }
        const generated = await getAICoachAdvice(projects[0].id);
        setAdvice(generated.length ? generated : ["You should interview potential users before building."]);
      } catch {
        setAdvice(["Unable to load AI guidance right now."]);
      }
    };
    void load();
  }, []);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">AI Coach</h2>
        <p className="mt-1 text-sm text-slate-600">Guidance generated from your current startup execution progress.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recommended Focus</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-slate-700">
            {advice.map((line, idx) => (
              <li key={idx} className="rounded-lg border border-slate-200 px-3 py-2">
                {line}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
