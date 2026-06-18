import type { ReactNode } from 'react';
import { CardContent } from '../ui/card';

export function SummaryCard({ label, value, icon }: { label: string; value: number | string; icon: ReactNode }) {
  return (
    <div className="metric-card">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
        <div className="rounded-xl border border-sky-200/70 bg-white/70 p-3 text-primary shadow-sm">{icon}</div>
      </CardContent>
    </div>
  );
}
