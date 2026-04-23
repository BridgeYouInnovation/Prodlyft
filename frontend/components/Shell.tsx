"use client";
import { ReactNode, useState } from "react";
import { Sidebar, type NavId } from "./Sidebar";
import { Topbar } from "./Topbar";

export function Shell({
  active,
  crumbs,
  right,
  children,
}: {
  active: NavId;
  crumbs: string[];
  right?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex">
      <Sidebar active={active} open={open} onClose={() => setOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar crumbs={crumbs} right={right} onMenuClick={() => setOpen(true)} />
        {children}
      </div>
    </div>
  );
}
