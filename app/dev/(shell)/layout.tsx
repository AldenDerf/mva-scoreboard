import { DevShell } from "@/components/dev-shell";

export default function PreviewShellLayout({ children }: { children: React.ReactNode }) {
  return <DevShell>{children}</DevShell>;
}
