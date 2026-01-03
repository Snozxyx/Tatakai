import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Mail, Lock, User, Play, ArrowLeft } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

// Random video backgrounds
const VIDEO_SOURCES = [
  'https://xkbzamfyupjafugqeaby.supabase.co/storage/v1/object/public/Public/bg/3.mp4',
  'https://xkbzamfyupjafugqeaby.supabase.co/storage/v1/object/public/Public/bg/2.webm',
  'https://xkbzamfyupjafugqeaby.supabase.co/storage/v1/object/public/Public/bg/1.mp4',
];

// Random text variations
const TEXT_VARIATIONS = [
  {
    title: "Your Gateway to Anime",
    desc: "Stream thousands of anime titles, track your progress, and join a community of passionate fans."
  },
  {
    title: "Discover Anime Paradise",
    desc: "Explore endless anime worlds, keep up with your favorites, and connect with fellow enthusiasts."
  },
  {
    title: "Unleash Your Anime Journey",
    desc: "Dive into a vast library of anime, monitor your watching habits, and engage with a vibrant fanbase."
  },
  {
    title: "Anime Adventures Await",
    desc: "Access countless anime series, follow your watchlist, and share experiences with like-minded viewers."
  },
  {
    title: "Enter the Anime Realm",
    desc: "Browse an extensive collection of anime, track episodes, and become part of an active community."
  }
];

export default function AuthPage() {
  const navigate = useNavigate();
  const { signIn, signUp, user } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // Pick a random video on mount
  const randomVideoSrc = useMemo(() => {
    return VIDEO_SOURCES[Math.floor(Math.random() * VIDEO_SOURCES.length)];
  }, []);

  // Redirect if already logged in
  if (user) {
    navigate('/');
    return null;
  }

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }
    
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Invalid email or password');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Welcome back!');
          navigate('/');
        }
      } else {
        const { error } = await signUp(email, password, displayName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('This email is already registered');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Account created! You can now sign in.');
          navigate('/');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Side - Form with opaque background */}
      <div className="w-full lg:w-1/2 min-h-screen bg-background flex flex-col justify-center items-center p-6 lg:p-12 relative">
        {/* Back button */}
        <button 
          onClick={() => navigate('/')} 
          className="absolute top-6 left-6 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">Back to Home</span>
        </button>

        <div className="w-full max-w-md">
          {/* Logo/Brand */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg overflow-hidden">
                <img 
                  src="/logo-transparent-small.png" 
                  alt="Tatakai Logo" 
                  className="w-10 h-10 object-contain"
                />
              </div>
              <h1 className="font-display text-3xl font-bold gradient-text">Tatakai</h1>
            </div>
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
              {isLogin ? 'Welcome back!' : 'Create your account'}
            </h2>
            <p className="text-muted-foreground">
              {isLogin 
                ? 'Enter your credentials to access your account.' 
                : 'Join thousands of anime lovers today.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-foreground font-medium">
                  Display Name
                </Label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                    className="h-12 pl-12 bg-muted/30 border-border hover:border-primary/50 focus:border-primary transition-colors"
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrors(prev => ({ ...prev, email: undefined }));
                  }}
                  placeholder="you@example.com"
                  className={`h-12 pl-12 bg-muted/30 border-border hover:border-primary/50 focus:border-primary transition-colors ${errors.email ? 'border-destructive' : ''}`}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors(prev => ({ ...prev, password: undefined }));
                  }}
                  placeholder="••••••••"
                  className={`h-12 pl-12 pr-12 bg-muted/30 border-border hover:border-primary/50 focus:border-primary transition-colors ${errors.password ? 'border-destructive' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>
            
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-semibold text-lg shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : isLogin ? (
                'Sign In'
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-muted-foreground">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setErrors({});
                }}
                className="ml-2 text-primary hover:underline font-semibold"
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>

          {/* Decorative element */}
          <div className="mt-12 pt-8 border-t border-border/50">
            <p className="text-xs text-muted-foreground text-center">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Video with overlay */}
      <div className="hidden lg:block w-1/2 h-screen relative overflow-hidden">
        {/* Video Background */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src={randomVideoSrc} type={randomVideoSrc.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
        </video>
        
        {/* 30% Dark Overlay */}
        <div className="absolute inset-0 bg-black/30" />
        
        {/* Content over video */}
        <div className="absolute inset-0 flex flex-col justify-end p-12">
          <div className="max-w-md">
            <h3 className="text-3xl font-bold text-white mb-4 drop-shadow-lg">
              Your Gateway to Anime
            </h3>
            <p className="text-white/80 text-lg drop-shadow-md">
              Stream thousands of anime titles, track your progress, and join a community of passionate fans.
            </p>
          </div>
        </div>

        {/* Gradient fade at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/50 to-transparent" />
      </div>
    </div>
  );
}
