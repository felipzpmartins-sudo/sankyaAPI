import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function QueryState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: Error | null;
  retry: () => void;
}) {
  if (loading) {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-xl" />)}</div>;
  }
  if (error) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-2xl border border-danger/30 bg-surface p-8 text-center">
        <div>
          <AlertCircle className="mx-auto h-8 w-8 text-danger" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Falha ao carregar dados</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
          <Button className="mt-5" onClick={retry}>Tentar novamente</Button>
        </div>
      </div>
    );
  }
  return null;
}
