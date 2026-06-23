import { Bell, Check, CheckCheck, Trash2, MessageSquare, UserPlus, Mic, Users, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead, useClearNotifications, type Notification } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, typeof Bell> = {
  comment: MessageSquare,
  invite: UserPlus,
  rehearsal: Mic,
  team: Users,
  info: Info,
};

function NotificationItem({ notification, onRead }: { notification: Notification; onRead: () => void }) {
  const navigate = useNavigate();
  const Icon = typeIcons[notification.type] || Bell;

  const handleClick = () => {
    if (!notification.is_read) onRead();
    if (notification.link) navigate(notification.link);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-secondary/60 transition-colors rounded-lg",
        !notification.is_read && "bg-primary/5"
      )}
    >
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
        !notification.is_read ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
      )}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-tight", !notification.is_read && "font-medium")}>{notification.title}</p>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </p>
      </div>
      {!notification.is_read && (
        <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
      )}
    </button>
  );
}

export default function NotificationCenter() {
  const { data: notifications = [] } = useNotifications();
  const unreadCount = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const clearAll = useClearNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full text-muted-foreground hover:text-foreground shrink-0 border border-border/80 shadow-sm bg-card/50 backdrop-blur-sm">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm">Notifications</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => markAllRead.mutate()}>
                <CheckCheck className="w-3 h-3" /> Read all
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => clearAll.mutate()}>
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="py-8 text-center">
              <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="p-1 space-y-0.5">
              {notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} onRead={() => markRead.mutate(n.id)} />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
