import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-slate-900 text-slate-50",
        secondary:
          "border-transparent bg-slate-100 text-slate-900",
        destructive:
          "border-red-200 bg-red-50 text-red-700",
        outline: "text-slate-950",
        draft: "border-slate-300 bg-slate-100 text-slate-700",
        uploaded: "border-blue-200 bg-blue-50 text-blue-700",
        extracted: "border-amber-200 bg-amber-50 text-amber-700",
        confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
        exported: "border-purple-200 bg-purple-50 text-purple-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
