import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background/80 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border-white/10 group-[.toaster]:shadow-2xl group-[.toaster]:rounded-2xl group-[.toaster]:p-4",
          description: "group-[.toast]:text-foreground/70 group-[.toast]:text-xs",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-xl group-[.toast]:font-bold group-[.toast]:text-xs group-[.toast]:uppercase group-[.toast]:tracking-wider",
          cancelButton: "group-[.toast]:bg-white/10 group-[.toast]:text-foreground group-[.toast]:rounded-xl group-[.toast]:font-bold group-[.toast]:text-xs group-[.toast]:uppercase group-[.toast]:tracking-wider group-[.toast]:hover:bg-white/20",
          success: "group-[.toaster]:bg-emerald-500/20 group-[.toaster]:border-emerald-500/30 group-[.toaster]:text-emerald-100",
          error: "group-[.toaster]:bg-red-500/20 group-[.toaster]:border-red-500/30 group-[.toaster]:text-red-100",
          warning: "group-[.toaster]:bg-amber-500/20 group-[.toaster]:border-amber-500/30 group-[.toaster]:text-amber-100",
          info: "group-[.toaster]:bg-blue-500/20 group-[.toaster]:border-blue-500/30 group-[.toaster]:text-blue-100",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
