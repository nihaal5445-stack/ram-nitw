import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  accent?: "primary" | "secondary" | "green" | "amber";
}

const accentClasses = {
  primary: "text-primary",
  secondary: "text-secondary",
  green: "text-green-600 dark:text-green-400",
  amber: "text-amber-600 dark:text-amber-400",
};

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  accent = "primary",
}: StatCardProps) {
  return (
    <Card className="border border-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${accentClasses[accent]}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accentClasses[accent]}`}>
          {value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
