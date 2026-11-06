import { Hero } from "@/components/site/hero";
import { WelcomeCard } from "@/components/site/welcome-card";
import { Initiatives } from "@/components/site/initiatives";
import { MessMapSection } from "@/components/site/mess-map-section";
import { MessSections } from "@/components/site/mess-sections";
import { MealTimings } from "@/components/site/meal-timings";
import { StatCounters } from "@/components/site/stat-counters";
import { ProgressBoard } from "@/components/site/progress-board";
import { CalendarSection } from "@/components/site/calendar-section";
import { UpdatesSection } from "@/components/site/updates-section";
import { AudienceTiles } from "@/components/site/audience-tiles";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <Hero />
      <AudienceTiles />
      <WelcomeCard />
      <Initiatives />
      <UpdatesSection />
      <MessMapSection />
      <MessSections />
      <MealTimings />
      <StatCounters />
      <ProgressBoard />
      <CalendarSection />
    </>
  );
}
