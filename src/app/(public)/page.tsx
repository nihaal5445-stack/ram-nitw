import { Hero } from "@/components/site/hero";
import { WelcomeCard } from "@/components/site/welcome-card";
import { Initiatives } from "@/components/site/initiatives";
import { MessMapSection } from "@/components/site/mess-map-section";
import { MessSections } from "@/components/site/mess-sections";
import { MealTimings } from "@/components/site/meal-timings";
import { StatCounters } from "@/components/site/stat-counters";
import { ProgressBoard } from "@/components/site/progress-board";
import { AudienceTiles } from "@/components/site/audience-tiles";

export default function Home() {
  return (
    <>
      <Hero />
      <AudienceTiles />
      <WelcomeCard />
      <Initiatives />
      <MessMapSection />
      <MessSections />
      <MealTimings />
      <StatCounters />
      <ProgressBoard />
    </>
  );
}
