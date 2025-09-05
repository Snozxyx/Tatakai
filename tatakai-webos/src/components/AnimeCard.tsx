import React from 'react';
import { Card, CardBody, CardFooter, Image, Button } from '@heroui/react';
import { PlayIcon } from '@heroicons/react/24/solid';

type Props = {
  title: string;
  imgSrc: string;
  onSelect: () => void;
  meta?: string;
};

export default function AnimeCard({ title, imgSrc, onSelect, meta }: Props) {
  const cardStyle = {
    width: '160px',
    aspectRatio: '2/3',
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    border: 'none'
  };

  const overlayStyle = {
    position: 'absolute' as const,
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    opacity: '0',
    transition: 'opacity 0.2s ease',
    zIndex: 10
  };

  const gradientStyle = {
    position: 'absolute' as const,
    bottom: '0',
    left: '0',
    right: '0',
    height: '33%',
    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent)',
    padding: '0.75rem',
    display: 'flex',
    alignItems: 'flex-end'
  };

  return (
    <div 
      className="focusable" 
      style={{ position: 'relative', cursor: 'pointer' }}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <Card style={cardStyle} className="overflow-hidden">
        <CardBody style={{ padding: '0', position: 'relative' }}>
          <Image
            src={imgSrc}
            alt={title}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'cover'
            }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/placeholder-anime.png';
            }}
          />
          
          {/* Lower scrim gradient */}
          <div style={gradientStyle}>
            <div>
              <div style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                lineHeight: '1.2',
                color: '#ffffff',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}>
                {title}
              </div>
              {meta && (
                <div style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginTop: '0.25rem'
                }}>
                  {meta}
                </div>
              )}
            </div>
          </div>

          {/* Action overlay - visible when focused */}
          <div 
            style={overlayStyle} 
            className="focus-overlay"
          >
            <Button
              variant="flat"
              color="primary"
              startContent={<PlayIcon className="w-5 h-5" />}
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(4px)',
                color: '#ffffff'
              }}
            >
              Play
            </Button>
          </div>
        </CardBody>
      </Card>

      <style jsx>{`
        .focusable:focus .focus-overlay,
        .focusable:hover .focus-overlay {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}