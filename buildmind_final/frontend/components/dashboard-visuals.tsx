"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DashboardVisualsProps = {
  execution: Array<{ name: string; progress: number }>;
  aiUsage: Array<{ name: string; usage: number }>;
};

export default function DashboardVisuals({ execution, aiUsage }: DashboardVisualsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="glass-panel panel-glow border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-base text-zinc-100">Execution Progress</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={execution}>
              <defs>
                <linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.65} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
              <XAxis dataKey="name" stroke="#71717a" tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" tickLine={false} axisLine={false} />
              <Tooltip />
              <Area type="monotone" dataKey="progress" stroke="#818cf8" strokeWidth={2.5} fill="url(#progressFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="glass-panel panel-glow border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-base text-zinc-100">AI Usage Trend</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={aiUsage}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
              <XAxis dataKey="name" stroke="#71717a" tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="usage" fill="#a855f7" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
