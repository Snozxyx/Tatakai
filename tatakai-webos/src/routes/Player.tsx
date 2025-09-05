import React, { useState } from 'react';
import HlsPlayer from '../components/HlsPlayer';

interface VideoSource {
  url: string;
  quality: string;
  isM3U8?: boolean;
}

export default function Player() {
  const [showPlayer, setShowPlayer] = useState(true);

  // Mock video sources for demonstration
  const videoSources: VideoSource[] = [
    {
      url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
      quality: '1080p',
      isM3U8: true
    },
    {
      url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
      quality: '720p',
      isM3U8: true
    },
    {
      url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
      quality: '480p',
      isM3U8: true
    }
  ];

  const subtitles = [
    {
      url: '/subtitles/english.vtt',
      label: 'English',
      language: 'en'
    },
    {
      url: '/subtitles/japanese.vtt',
      label: 'Japanese',
      language: 'ja'
    }
  ];

  const handleClose = () => {
    setShowPlayer(false);
    // In a real app, this would navigate back to the previous screen
    console.log('Player closed');
  };

  if (!showPlayer) {
    return (
      <div className="min-h-screen bg-tvbg flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-white">Player Closed</h2>
          <p className="text-gray-400">In a real app, this would navigate back to the previous screen</p>
          <button 
            className="focusable px-6 py-3 bg-tatakai-purple text-white rounded-lg"
            onClick={() => setShowPlayer(true)}
          >
            Reopen Player
          </button>
        </div>
      </div>
    );
  }

  return (
    <HlsPlayer
      sources={videoSources}
      subtitles={subtitles}
      onClose={handleClose}
      autoPlay={true}
    />
  );
}