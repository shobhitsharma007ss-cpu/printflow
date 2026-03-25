import { Card, Button } from "@/components/ui-elements";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center">
      <Card className="w-full max-w-md p-8 text-center shadow-xl">
        <AlertCircle className="mx-auto h-16 w-16 text-muted-foreground mb-6" strokeWidth={1.5} />
        <h1 className="text-2xl font-black text-foreground mb-2 tracking-tight">404 - Page Not Found</h1>
        <p className="text-muted-foreground mb-8">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button size="lg" className="w-full">
            Return to Dashboard
          </Button>
        </Link>
      </Card>
    </div>
  );
}
