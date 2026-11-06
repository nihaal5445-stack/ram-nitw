import { Bell, CalendarHeart, CircleOff, Clock, MessageSquareWarning, ShoppingBag, Soup, Star, UserRound, type LucideIcon } from "lucide-react";

export const CATEGORIES = ["menu_change", "timings", "closure", "special_meal", "addon", "complaint_update", "feedback_request", "admin_message", "general"] as const;
export type Category = (typeof CATEGORIES)[number];
/** Staff can post these (complaint updates and feedback requests are automatic only). */
export const ANNOUNCE_CATEGORIES: Category[] = ["menu_change", "timings", "closure", "special_meal", "addon", "admin_message", "general"];
/** Categories that may appear on the public Updates page. */
export const PUBLIC_CATEGORIES: Category[] = ["closure", "special_meal", "timings"];
export const UNMUTABLE: Category[] = ["complaint_update", "admin_message"];

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  menu_change: Soup, timings: Clock, closure: CircleOff, special_meal: CalendarHeart, addon: ShoppingBag,
  complaint_update: MessageSquareWarning, feedback_request: Star, admin_message: UserRound, general: Bell,
};

export interface NotificationRow {
  id: number; category: Category; title: string; body: string | null; link: string | null;
  pinned: boolean; created_at: string; read_at: string | null; expires_at: string | null;
}
export const NOTIFICATIONS_EVENT = "ram:notifications-changed";
/** fired by the inbox after read / mute changes so the bell recounts (and by the bell when something new arrived, for the inbox) */
export const NOTIFICATIONS_LOCAL_EVENT = "ram:notifications-changed:local";
