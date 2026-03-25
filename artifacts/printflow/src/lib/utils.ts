import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'running':
    case 'completed':
    case 'in-progress':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'idle':
    case 'pending':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'maintenance':
    case 'on-hold':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function getStatusDotColor(status: string) {
  switch (status.toLowerCase()) {
    case 'running':
    case 'completed':
    case 'in-progress':
      return 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]';
    case 'idle':
    case 'pending':
      return 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]';
    case 'maintenance':
    case 'on-hold':
      return 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]';
    default:
      return 'bg-gray-400';
  }
}
