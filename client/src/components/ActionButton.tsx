import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  variant?: "primary" | "secondary";
}

export function ActionButton({ children, icon, variant = "primary", className, ...props }: ActionButtonProps) {
  return (
    <button
      className={cn(
        "group relative overflow-hidden px-8 py-6 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all duration-300",
        variant === "primary"
          ? "bg-white border-2 border-primary/10 hover:border-primary/30 shadow-sm hover:shadow-xl hover:-translate-y-1"
          : "bg-secondary hover:bg-secondary/80 text-secondary-foreground",
        className
      )}
      {...props}
    >
      <div className="p-4 rounded-full bg-primary/5 text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
        {icon}
      </div>
      <span className="text-lg font-bold font-display text-foreground group-hover:text-primary transition-colors">{children}</span>
    </button>
  );
}
