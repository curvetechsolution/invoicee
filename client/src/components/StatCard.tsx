import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  className?: string;
  delay?: string;
  onClick?: () => void;
}

export function StatCard({ title, value, icon: Icon, className, delay = "delay-0", onClick }: StatCardProps) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-card p-6 rounded-2xl border border-border/50 shadow-sm transition-all duration-300 animate-in opacity-0 fill-mode-forwards",
        onClick ? "cursor-pointer hover:shadow-md hover:border-primary/50" : "hover:shadow-md",
        delay,
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
        <div className="p-2 bg-primary/10 rounded-full text-primary">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold font-display text-foreground">{value}</span>
      </div>
    </div>
  );
}
