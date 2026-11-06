import { Hero } from "@/components/site/hero";
import { WelcomeCard } from "@/components/site/welcome-card";
import { AudienceTiles } from "@/components/site/audience-tiles";

export default function Home() {
  return (
    <>
      <Hero />
      <AudienceTiles />
      <WelcomeCard />
    </>
  );
}
