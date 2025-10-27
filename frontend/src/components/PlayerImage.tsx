import { useState } from 'react';

interface PlayerImageProps {
  src: string | undefined;
  alt: string;
  className?: string;
  fallbackInitial?: string;
}

export default function PlayerImage({ src, alt, className = '', fallbackInitial }: PlayerImageProps) {
  const [imageUrl, setImageUrl] = useState(src);
  const [failedNba, setFailedNba] = useState(false);

  const handleError = () => {
    if (!failedNba && imageUrl && imageUrl.includes('/nba/')) {
      // First failure: try college basketball fallback
      const collegeUrl = imageUrl.replace('/nba/', '/mens-college-basketball/');
      setImageUrl(collegeUrl);
      setFailedNba(true);
    } else {
      // Second failure or no URL: show placeholder
      setImageUrl(undefined);
    }
  };

  if (!imageUrl) {
    // Show initial fallback
    const initial = fallbackInitial || alt.charAt(0);
    return (
      <div className={`bg-slate-700 flex items-center justify-center font-bold ${className}`}>
        {initial}
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      onError={handleError}
    />
  );
}
