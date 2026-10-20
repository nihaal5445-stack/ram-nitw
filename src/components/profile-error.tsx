import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export function ProfileError({ error }: { error?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <Card className="w-full max-w-md border-destructive/30 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <CardTitle className="text-xl font-heading text-destructive">
            Profile Not Found
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            We could not locate an active mess profile for your account. Please contact the warden to have your mess role and account provisioned.
          </p>
          {error && (
            <p className="text-xs font-mono bg-muted p-2 rounded text-muted-foreground break-words">
              Error details: {error}
            </p>
          )}
          <div className="pt-2 flex justify-center gap-3">
            <Link href="/login">
              <Button variant="outline">Back to Sign In</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
