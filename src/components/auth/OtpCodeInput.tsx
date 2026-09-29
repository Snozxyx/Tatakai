import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { cn } from '@/lib/utils';

interface OtpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired when all 6 digits are entered. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Brand-styled 6-digit code entry, shared by the login/signup and
 * password-reset flows. Wraps the shadcn `InputOTP` with larger, glassy slots
 * so the code UI is consistent everywhere.
 */
export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  className,
}: OtpCodeInputProps) {
  return (
    <InputOTP
      maxLength={6}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus={autoFocus}
      containerClassName={cn('justify-center gap-2 sm:gap-3', className)}
      inputMode="numeric"
    >
      <InputOTPGroup className="gap-2 sm:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <InputOTPSlot
            key={i}
            index={i}
            className={cn(
              'h-12 w-11 sm:h-14 sm:w-12 rounded-lg border text-xl font-semibold',
              'bg-muted/30 border-border first:rounded-lg last:rounded-lg',
              'data-[active=true]:border-primary transition-colors',
            )}
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

export default OtpCodeInput;
