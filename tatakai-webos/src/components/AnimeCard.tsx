import React from 'react';
import { Card, CardBody, Image, Button, Chip } from '@heroui/react';
import { PlayIcon } from '@heroicons/react/24/solid';

type Props = {
  title: string;
  imgSrc: string;
  onSelect: () => void;
  meta?: string;
};

export default function AnimeCard({ title, imgSrc, onSelect, meta }: Props) {
  return (
    <Card 
      className="w-40 aspect-[2/3] bg-content1/80 backdrop-blur-md border border-white/10 hover:border-primary/50 transition-all duration-300 focusable overflow-hidden group cursor-pointer"
      isPressable
      onPress={onSelect}
      shadow="lg"
    >
      <CardBody className="p-0 relative">
        <Image
          src={imgSrc}
          alt={title}
          className="w-full h-full object-cover"
          removeWrapper
          loading="lazy"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = '/placeholder-anime.png';
          }}
        />
        
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        
        {/* Title and meta at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
          <h3 className="text-sm font-semibold line-clamp-2 mb-1">
            {title}
          </h3>
          {meta && (
            <p className="text-xs text-white/70 line-clamp-1">
              {meta}
            </p>
          )}
        </div>

        {/* Play overlay - appears on hover/focus */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-300">
          <Button
            color="primary"
            variant="shadow"
            startContent={<PlayIcon className="w-5 h-5" />}
            className="font-semibold"
            size="lg"
          >
            Play
          </Button>
        </div>

        {/* Premium badge if applicable */}
        {meta?.includes('Premium') && (
          <Chip
            color="warning"
            variant="solid"
            size="sm"
            className="absolute top-2 right-2 font-semibold"
          >
            Premium
          </Chip>
        )}
      </CardBody>
    </Card>
  );
}