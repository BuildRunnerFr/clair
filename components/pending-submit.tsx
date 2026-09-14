"use client";
import { useFormStatus } from "react-dom";
export function PendingSubmit({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} aria-busy={pending}>{children}{pending ? " …" : ""}</button>;
}
