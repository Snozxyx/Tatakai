import React from 'react';
import { Skeleton, Card, CardBody } from '@heroui/react';

export default function SkeletonCard() {
  return (
    <Card className="w-40 aspect-[2/3] bg-content1/50 backdrop-blur-sm border border-white/10">
      <CardBody className="p-0 relative">
        <Skeleton className="w-full h-full rounded-lg">
          <div className="w-full h-full bg-content2"></div>
        </Skeleton>
        
        {/* Bottom overlay skeleton */}
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent p-3 flex items-end">
          <div className="w-full space-y-2">
            <Skeleton className="h-3 w-4/5 rounded">
              <div className="h-3 w-4/5 bg-content3 rounded"></div>
            </Skeleton>
            <Skeleton className="h-2 w-3/5 rounded">
              <div className="h-2 w-3/5 bg-content3 rounded"></div>
            </Skeleton>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}