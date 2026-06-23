import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LearningContent } from "@/hooks/useLearningContent";

interface FeaturedVideosCarouselProps {
  videos: LearningContent[];
  onPlayVideo: (video: LearningContent) => void;
}

function getYouTubeThumbnail(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function FeaturedVideosCarousel({ videos, onPlayVideo }: FeaturedVideosCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setCurrent((c) => (c + 1) % videos.length), [videos.length]);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + videos.length) % videos.length), [videos.length]);

  useEffect(() => {
    if (paused || videos.length <= 1) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [paused, next, videos.length]);

  if (videos.length === 0) return null;
  const video = videos[current];
  const thumb = video.thumbnail_url || getYouTubeThumbnail(video.video_url);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Video thumbnail */}
      <div
        className="relative aspect-video rounded-xl overflow-hidden cursor-pointer group"
        onClick={() => onPlayVideo(video)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0"
          >
            {thumb ? (
              <img
                src={thumb}
                alt={video.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`w-full h-full bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center ${thumb ? 'hidden' : ''}`}>
              <Play className="w-10 h-10 text-muted-foreground" />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-xl"
          >
            <Play className="w-6 h-6 text-primary-foreground ml-0.5" fill="currentColor" />
          </motion.div>
        </div>

        {/* Duration badge */}
        {video.duration_seconds > 0 && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs font-medium px-2 py-0.5 rounded">
            {formatDuration(video.duration_seconds)}
          </div>
        )}
      </div>

      {/* Nav arrows */}
      {videos.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </>
      )}

      {/* Dots */}
      {videos.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {videos.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === current ? "bg-primary w-5" : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      )}

      {/* Featured title */}
      <p className="text-sm text-muted-foreground mt-2 truncate">
        <span className="text-foreground font-medium">Featured:</span> {video.title}
      </p>
    </div>
  );
}
