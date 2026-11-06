import {
  BookOpenText, Megaphone, Building2, CalendarDays, CalendarHeart, Clock, Compass, Eye, FileBarChart,
  HandHelping, Leaf, LifeBuoy, Map, MessageSquareText, Recycle, Soup, Sprout, TrendingUp, UtensilsCrossed, Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavLink { key: string; href: string; icon: LucideIcon }
export interface NavGroup { key: string; links: NavLink[] }

/** Labels live in messages/*.json under Public.nav.<group>.<...>. Hrefs are in-page anchors on / . */
export const navGroups: NavGroup[] = [
  { key: "about", links: [
    { key: "welcome", href: "/#welcome", icon: BookOpenText },
    { key: "initiatives", href: "/#initiatives", icon: Sprout },
    { key: "audiences", href: "/#audiences", icon: Compass },
  ]},
  { key: "messes", links: [
    { key: "map", href: "/#map", icon: Map },
    { key: "directory", href: "/#messes", icon: Building2 },
    { key: "crowd", href: "/#hero", icon: UtensilsCrossed },
  ]},
  { key: "menus", links: [
    { key: "today", href: "/#hero", icon: Soup },
    { key: "timings", href: "/#timings", icon: Clock },
  ]},
  { key: "transparency", links: [
    { key: "progress", href: "/#progress", icon: TrendingUp },
    { key: "updates", href: "/updates", icon: Megaphone },
    { key: "fees", href: "/fees", icon: Wallet },
    { key: "stats", href: "/#stats", icon: FileBarChart },
    { key: "open", href: "/#initiatives", icon: Eye },
  ]},
  { key: "sustainability", links: [
    { key: "waste", href: "/#initiatives", icon: Recycle },
    { key: "paper", href: "/#initiatives", icon: Leaf },
  ]},
  { key: "calendar", links: [
    { key: "special", href: "/#calendar", icon: CalendarHeart },
    { key: "closures", href: "/#calendar", icon: CalendarDays },
  ]},
  { key: "help", links: [
    { key: "contact", href: "/#footer", icon: MessageSquareText },
    { key: "support", href: "/#footer", icon: LifeBuoy },
    { key: "signin", href: "/login", icon: HandHelping },
  ]},
];
