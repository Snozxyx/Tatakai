import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SimpleCaptchaProps {
  onValidate: (isValid: boolean) => void;
}

export function SimpleCaptcha({ onValidate }: SimpleCaptchaProps) {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [isValid, setIsValid] = useState(false);

  const generateCaptcha = () => {
    const n1 = Math.floor(Math.random() * 10) + 1;
    const n2 = Math.floor(Math.random() * 10) + 1;
    setNum1(n1);
    setNum2(n2);
    setUserAnswer('');
    setIsValid(false);
    onValidate(false);
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  useEffect(() => {
    const correctAnswer = num1 + num2;
    const valid = parseInt(userAnswer) === correctAnswer;
    setIsValid(valid);
    onValidate(valid);
  }, [userAnswer, num1, num2]);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Verify you're human</label>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 border border-muted select-none">
          <span className="text-lg font-mono font-bold">
            {num1} + {num2} =
          </span>
        </div>
        <Input
          type="number"
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value)}
          placeholder="?"
          className={`w-20 text-center ${isValid ? 'border-green-500' : ''}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={generateCaptcha}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      {userAnswer && !isValid && (
        <p className="text-xs text-destructive">Incorrect answer</p>
      )}
      {isValid && (
        <p className="text-xs text-green-500">✓ Verified</p>
      )}
    </div>
  );
}
