import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type SnapshotContextValue = {
  snapshotAt: string | null;
  setSnapshotAt: (value: string | null) => void;
};

const SnapshotContext = createContext<SnapshotContextValue | null>(null);

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const value = useMemo(() => ({ snapshotAt, setSnapshotAt }), [snapshotAt]);
  return <SnapshotContext.Provider value={value}>{children}</SnapshotContext.Provider>;
}

function useSnapshotContext() {
  const context = useContext(SnapshotContext);
  if (!context) throw new Error("Snapshot context indisponível");
  return context;
}

export function usePageSnapshot(snapshotAt: string | null | undefined) {
  const { setSnapshotAt } = useSnapshotContext();
  useEffect(() => setSnapshotAt(snapshotAt ?? null), [setSnapshotAt, snapshotAt]);
}

export function useSnapshotAt() {
  return useSnapshotContext().snapshotAt;
}
