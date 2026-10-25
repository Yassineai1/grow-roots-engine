import type { ReactNode } from "react";
import { DashboardShell } from "@/components/DashboardShell";

export function DashboardNav({ children }: { children?: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
