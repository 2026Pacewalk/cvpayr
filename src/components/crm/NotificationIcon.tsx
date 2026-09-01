import {
  Bell, UserPlus, Users, Clock3, AlarmClock, CarFront, Handshake, Target,
  ShieldAlert, FileWarning, Tag, Share2, Settings, TrendingDown, Building2,
} from "lucide-react";
import { typeMeta, type IconKey } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const ICONS: Record<IconKey, typeof Bell> = {
  bell: Bell,
  userPlus: UserPlus,
  users: Users,
  clock: Clock3,
  alarm: AlarmClock,
  car: CarFront,
  handshake: Handshake,
  target: Target,
  shieldAlert: ShieldAlert,
  fileWarning: FileWarning,
  tag: Tag,
  share: Share2,
  settings: Settings,
  trendingDown: TrendingDown,
  building: Building2,
};

/** Priority drives the colour, so urgency reads at a glance without labels. */
const PRIORITY_TONE: Record<string, string> = {
  critical: "bg-danger-50 text-danger-600 ring-danger-100",
  high: "bg-warning-50 text-warning-600 ring-warning-100",
  medium: "bg-brand-50 text-brand-600 ring-brand-100",
  low: "bg-ink-100 text-ink-500 ring-ink-200",
};

export function NotificationIcon({
  type,
  priority = "medium",
  size = "md",
  className,
}: {
  type: string;
  priority?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = ICONS[typeMeta(type).icon] ?? Bell;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[9px] ring-1 ring-inset",
        size === "sm" ? "size-8" : "size-9",
        PRIORITY_TONE[priority] ?? PRIORITY_TONE.medium,
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-4" : "size-[18px]"} />
    </span>
  );
}
