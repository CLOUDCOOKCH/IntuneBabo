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
    <div className="flex flex-wrap gap-1 rounded-xl border border-white/70 bg-white/58 p-1 shadow-inner shadow-slate-200/80 backdrop-blur-xl">
      {items.map((item) => (
        <button
          className={cn(
            'rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-all duration-200 ease-out hover:bg-white/70 hover:text-slate-950',
            value === item.value && 'bg-white text-slate-950 shadow-sm ring-1 ring-sky-500/20',
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
