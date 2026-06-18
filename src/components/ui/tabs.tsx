import { cn } from '../../lib/utils';

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  value: T;
  items: TabItem<T>[];
  onChange: (value: T) => void;
}

export function Tabs<T extends string>({ value, items, onChange }: TabsProps<T>) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-fuchsia-400/40 bg-background/50 p-1 shadow-inner shadow-fuchsia-950/40">
      {items.map((item) => (
        <button
          className={cn(
            'rounded-md px-3 py-2 text-sm font-bold text-muted-foreground transition',
            value === item.value &&
              'bg-[linear-gradient(110deg,#39ff14,#00f5ff,#ff00c8)] text-black shadow-[0_0_20px_rgba(57,255,20,0.28)]',
          )}
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
