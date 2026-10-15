import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  useUiTranslation();
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-2xl group-[.toaster]:rounded-2xl group-[.toaster]:p-4",
          get description() { return uiI18n.t('app.group_toast_text_muted_foreground_group_toast_te_90cbcd54'); },
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-xl group-[.toast]:font-bold group-[.toast]:text-xs group-[.toast]:uppercase group-[.toast]:tracking-wider",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-foreground group-[.toast]:rounded-xl group-[.toast]:font-bold group-[.toast]:text-xs group-[.toast]:uppercase group-[.toast]:tracking-wider group-[.toast]:hover:bg-muted/80",
          success: "group-[.toaster]:bg-background group-[.toaster]:border-emerald-500/30 group-[.toaster]:text-foreground",
          error: "group-[.toaster]:bg-background group-[.toaster]:border-red-500/30 group-[.toaster]:text-foreground",
          warning: "group-[.toaster]:bg-background group-[.toaster]:border-amber-500/30 group-[.toaster]:text-foreground",
          info: "group-[.toaster]:bg-background group-[.toaster]:border-blue-500/30 group-[.toaster]:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
