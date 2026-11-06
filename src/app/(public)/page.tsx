import { Hero } from "@/components/site/hero";
import { WelcomeCard } from "@/components/site/welcome-card";
import { Initiatives } from "@/components/site/initiatives";
import { MessMapSection } from "@/components/site/mess-map-section";
import { MessSections } from "@/components/site/mess-sections";
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
    </>
  );
}
