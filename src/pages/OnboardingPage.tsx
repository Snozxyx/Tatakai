import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, BookOpen, Users, Shield, Heart, Sparkles, ArrowRight, PlayCircle, Globe, AlertCircle, MessageSquare, Eye, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Tatakai',
    description: 'The Next Generation Anime Experience',
    icon: <Sparkles className="w-10 h-10 text-pink-500" />,
    content: (
      <div className="text-center space-y-8">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="relative w-32 h-32 mx-auto"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 rounded-full blur-2xl opacity-40 animate-pulse" />
          <div className="relative w-full h-full bg-card/40 backdrop-blur-xl rounded-full border border-white/10 flex items-center justify-center shadow-2xl overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/10 to-transparent" />
            <PlayCircle className="w-16 h-16 text-white drop-shadow-glow group-hover:scale-110 transition-transform" />
          </div>
        </motion.div>

        <div className="space-y-4">
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter bg-gradient-to-b from-white via-white to-white/20 bg-clip-text text-transparent">
            YOUR ANIME<br />JOURNEY STARTS NOW
          </h2>
          <p className="text-lg text-muted-foreground max-w-sm mx-auto font-medium">
            Immersive streaming, community interaction, and personalized AI recommendations.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 'purpose',
    title: 'Project Purpose',
    description: 'Educational & Student Project',
    icon: <BookOpen className="w-10 h-10 text-blue-400" />,
    content: (
      <div className="space-y-8">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 bg-blue-500 blur-xl opacity-30" />
            <div className="relative w-full h-full bg-blue-500/20 backdrop-blur-md rounded-2xl border border-blue-500/30 flex items-center justify-center rotate-12">
              <Shield className="w-10 h-10 text-blue-400 -rotate-12" />
            </div>
          </div>
          <h3 className="text-3xl font-black tracking-tight mb-3">Student Project Notice</h3>
          <p className="text-muted-foreground font-medium leading-relaxed">
            Tatakai is built as a portfolio project for educational purposes.
            We do not host files on our servers.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="group p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Globe className="w-5 h-5 text-orange-400" />
              </div>
              <h4 className="font-bold text-lg">Data Sourcing</h4>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We act as a gateway that aggregates and scrapes publicly available data from 3rd party providers.
              The content visibility is subject to the source availability.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-500 font-bold uppercase tracking-widest">For Educational Display Only</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'rules',
    title: 'The Rules',
    description: 'Help us maintain the atmosphere',
    icon: <Shield className="w-10 h-10 text-emerald-400" />,
    content: (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { title: "Resurrect Respect", desc: "No hate speech or toxic behavior.", icon: <Heart className="w-4 h-4" /> },
            { title: "No Spoilers", desc: "Respect the first-watch experience.", icon: <Eye className="w-4 h-4" /> },
            { title: "Quality Talk", desc: "Engage in meaningful discussions.", icon: <MessageSquare className="w-4 h-4" /> },
            { title: "Stay Safe", desc: "Don't share sensitive personal info.", icon: <Lock className="w-4 h-4" /> }
          ].map((rule, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-5 rounded-3xl bg-white/5 border border-white/5 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-3 mb-2 text-primary font-bold">
                {rule.icon}
                <span className="text-sm tracking-tight">{rule.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">{rule.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },
];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const navigate = useNavigate();

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setIsComplete(true);
    localStorage.setItem('tatakai_onboarding_complete', 'true');
    setTimeout(() => {
      navigate('/');
    }, 1000);
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (isComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Background />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-6"
        >
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/30">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold">Welcome aboard!</h2>
          <p className="text-muted-foreground">Taking you to Tatakai...</p>
        </motion.div>
      </div>
    );
  }

  const currentStepData = onboardingSteps[currentStep];

  return (
    <div className="min-h-screen bg-background">
      <Background />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 md:p-10 relative z-20">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/20 rotate-3">
              <PlayCircle className="w-6 h-6 text-white" />
            </div>
            <span className="font-black text-2xl tracking-tighter bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent italic">TATAKAI</span>
          </motion.div>
          <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground/60 hover:text-white hover:bg-white/5 rounded-full px-6">
            Skip Intro
          </Button>
        </div>

        {/* Progress Indicator */}
        <div className="px-6 mb-8">
          <div className="flex items-center justify-center gap-2">
            {onboardingSteps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${index === currentStep
                    ? 'bg-primary w-8'
                    : index < currentStep
                      ? 'bg-primary'
                      : 'bg-muted-foreground/30'
                  }`}
              />
            ))}
          </div>
          <div className="text-center mt-4">
            <p className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {onboardingSteps.length}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 pb-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-2xl mx-auto"
            >
              {/* Step Header */}
              <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                  {currentStepData.icon}
                </div>
                <h1 className="text-2xl md:text-3xl font-bold mb-2">
                  {currentStepData.title}
                </h1>
                <p className="text-muted-foreground">
                  {currentStepData.description}
                </p>
              </div>

              {/* Step Content */}
              <div className="mb-8">
                {currentStepData.content}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-background/80 backdrop-blur-md border-t border-white/10">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className="px-8 rounded-full text-muted-foreground hover:text-white transition-all"
            >
              Back
            </Button>

            <Button
              onClick={handleNext}
              className="px-10 py-6 rounded-full bg-white text-black font-black text-lg hover:bg-white/90 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 gap-3"
            >
              {currentStep === onboardingSteps.length - 1 ? 'START TATAKAI' : 'CONTINUE'}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}