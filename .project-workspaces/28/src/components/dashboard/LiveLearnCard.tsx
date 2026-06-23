import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, ChevronUp, ChevronDown, CalendarDays, ArrowRight, Bell, BellOff } from "lucide-react";
// Button import no longer needed for header
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFeaturedVideos, type LearningContent } from "@/hooks/useLearningContent";
import { useUpcomingEvents, useEventReminders, useToggleReminder } from "@/hooks/useEvents";
import FeaturedVideosCarousel from "./FeaturedVideosCarousel";
import VideoPlayerModal from "./VideoPlayerModal";
import { format } from "date-fns";
import { toast } from "sonner";

export default function LiveLearnCard() {
  const { data: videos = [] } = useFeaturedVideos();
  const { data: events = [] } = useUpcomingEvents();
  const { data: reminders = [] } = useEventReminders();
  const toggleReminder = useToggleReminder();
  const [expanded, setExpanded] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<LearningContent | null>(null);

  const handleToggleReminder = (eventId: string) => {
    const isSet = reminders.includes(eventId);
    toggleReminder.mutate(
      { eventId, isSet },
      {
        onSuccess: () => toast.success(isSet ? "Reminder removed" : "Reminder set!"),
      }
    );
  };

  const eventTypeColors: Record<string, string> = {
    webinar: "bg-blue-500/20 text-blue-400",
    workshop: "bg-emerald-500/20 text-emerald-400",
    seminar: "bg-purple-500/20 text-purple-400",
    meetup: "bg-amber-500/20 text-amber-400",
    livestream: "bg-rose-500/20 text-rose-400",
  };

  return (
    <>
      <Card className="overflow-hidden border-border bg-[hsl(var(--card))] dark:bg-gradient-to-br dark:from-[hsl(240,10%,8%)] dark:to-[hsl(240,10%,12%)]">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full p-4 text-left hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold text-base">Live & Learn</h3>
          </div>
          <div className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="p-4 space-y-4">
                {/* Video Carousel */}
                {videos.length > 0 ? (
                  <FeaturedVideosCarousel videos={videos} onPlayVideo={setPlayingVideo} />
                ) : (
                  <div className="aspect-video rounded-xl bg-secondary/50 flex flex-col items-center justify-center">
                    <Video className="w-8 h-8 text-muted-foreground/40 mb-2" />
                    <p className="text-xs text-muted-foreground">Videos coming soon</p>
                  </div>
                )}

                {/* Upcoming Events */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    <h4 className="font-display font-semibold text-sm">Upcoming Events</h4>
                  </div>

                  {events.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No upcoming events scheduled
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {events.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${eventTypeColors[event.event_type] || "bg-muted text-muted-foreground"}`}>
                                {event.event_type}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(event.starts_at), "MMM d · h:mm a")}
                              </span>
                            </div>
                            <p className="text-sm font-medium truncate">{event.title}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => handleToggleReminder(event.id)}
                            disabled={toggleReminder.isPending}
                          >
                            {reminders.includes(event.id) ? (
                              <Bell className="w-3.5 h-3.5 text-primary" fill="currentColor" />
                            ) : (
                              <BellOff className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Video Player Modal */}
      {playingVideo && (
        <VideoPlayerModal
          open={!!playingVideo}
          onOpenChange={(open) => !open && setPlayingVideo(null)}
          videoUrl={playingVideo.video_url}
          title={playingVideo.title}
        />
      )}
    </>
  );
}
