import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold uppercase tracking-wider transition-all disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-[2px] active:translate-x-[2px]",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--button-fill)] text-[color:var(--button-text)] hover:bg-[color:var(--button-fill-hover)] border-2 border-[color:var(--button-border)] shadow-[4px_4px_0px_0px_var(--shadow-accent)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-accent)]",
        primary:
          "bg-[color:var(--button-fill)] text-[color:var(--button-text)] hover:bg-[color:var(--button-fill-hover)] border-2 border-[color:var(--button-border)] shadow-[4px_4px_0px_0px_var(--shadow-accent)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-accent)]",
        destructive:
          "bg-[#dc2626] text-white hover:bg-[#b91c1c] border-2 border-[#1a1a1a] shadow-[4px_4px_0px_0px_var(--shadow-accent)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-accent)]",
        outline:
          "bg-[color:var(--button-fill)] text-[color:var(--button-text)] hover:bg-[color:var(--button-fill-hover)] border-2 border-[color:var(--button-border)] shadow-[4px_4px_0px_0px_var(--shadow-accent)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-accent)]",
        secondary:
          "bg-[color:var(--button-fill)] text-[color:var(--button-text)] hover:bg-[color:var(--button-fill-hover)] border-2 border-[color:var(--button-border)] shadow-[4px_4px_0px_0px_var(--shadow-accent)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-accent)]",
        ghost:
          "text-[color:var(--button-text)] hover:bg-[color:var(--button-fill)] hover:text-[color:var(--button-text)] border-2 border-transparent hover:border-[color:var(--button-border)] hover:shadow-[4px_4px_0px_0px_var(--shadow-accent)] hover:-translate-y-[2px] hover:-translate-x-[2px]",
        link:
          "text-[color:var(--button-text)] underline underline-offset-4 hover:text-[color:var(--accent)]",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
