import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-background text-foreground">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex flex-col gap-8">
        <h1 className="text-4xl font-heading text-primary font-bold text-center">
          RAM: Random Access Meals
        </h1>
        <p className="text-lg text-center max-w-2xl text-muted-foreground">
          National Institute of Technology Warangal's modern, zero-internet mess management platform.
        </p>
        <div className="flex gap-4">
          <Link href="/login">
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
              Sign In to Portal
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
