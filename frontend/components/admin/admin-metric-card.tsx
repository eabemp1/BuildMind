import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AdminMetricCardProps = {
  title: string;
  value: string;
  helper?: string;
};

export default function AdminMetricCard({ title, value, helper }: AdminMetricCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs uppercase tracking-[0.12em] text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-slate-900">{value}</p>
        {helper ? <p className="mt-1 text-sm text-slate-500">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
