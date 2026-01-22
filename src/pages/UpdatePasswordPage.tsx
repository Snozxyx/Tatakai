import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Lock, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';

const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export default function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  useEffect(() => {
    // Check if user arrived here via reset link
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the reset link and is ready to update password
      } else if (event === 'SIGNED_IN') {
        // Redirect if already signed in without password recovery
        navigate('/');
      }
    });
  }, [navigate]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate password
    try {
      passwordSchema.parse(password);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        return;
      }
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      setPasswordUpdated(true);
      toast.success('Password updated successfully!');
      
      // Redirect to home after 2 seconds
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (error: any) {
      console.error('Update password error:', error);
      toast.error(error.message || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Background />
      <main className="min-h-screen relative z-10 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Back Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/auth')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Button>

          {/* Logo */}
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-display font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
              Tatakai
            </h1>
            <p className="text-muted-foreground">Create a new password</p>
          </div>

          {/* Update Password Form */}
          <GlassPanel className="p-6 md:p-8">
            {!passwordUpdated ? (
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-semibold">Set New Password</h2>
                  <p className="text-sm text-muted-foreground">
                    Enter your new password below.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Must be at least 6 characters
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !password || !confirmPassword}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Update Password
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-display font-semibold">Password Updated!</h2>
                  <p className="text-sm text-muted-foreground">
                    Your password has been successfully updated. Redirecting to home...
                  </p>
                </div>
              </div>
            )}
          </GlassPanel>
        </div>
      </main>
    </>
  );
}
