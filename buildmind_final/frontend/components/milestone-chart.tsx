"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import GlowCard from "@/components/ui/glow-card";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MilestoneChartProps = {
  data: Array<{ milestone: string; completion: number }>;
};

export default function MilestoneChart({ data }: MilestoneChartProps) {
  return (
    <GlowCard className="p-0">
      <CardHeader className="mb-6 px-6 pt-6">
        <CardTitle className="text-base text-zinc-100">Milestone Completion</CardTitle>
      </CardHeader>
      <CardContent className="h-64 px-6 pb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
            <XAxis dataKey="milestone" stroke="#71717a" tickLine={false} axisLine={false} />
            <YAxis stroke="#71717a" tickLine={false} axisLine={false} unit="%" />
            <Tooltip />
            <Bar dataKey="completion" fill="#818cf8" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </GlowCard>
  );
}
