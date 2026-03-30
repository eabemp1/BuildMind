import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AdminMetricCardProps = {
  title: string;
  value: string;
  helper?: string;
};

export default function AdminMetricCard({ title, value, helper }: AdminMetricCardProps) {
  return (
    <Card className="glass-panel panel-glow">
      <CardHeader>
        <CardTitle className="text-xs uppercase tracking-[0.12em] text-zinc-400">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-zinc-100">{value}</p>
        {helper ? <p className="mt-1 text-sm text-zinc-400">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
