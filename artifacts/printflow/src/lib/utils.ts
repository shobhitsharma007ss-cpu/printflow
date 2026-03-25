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
      return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'maintenance':
    case 'on-hold':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

export function getStatusDotColor(status: string) {
  switch (status.toLowerCase()) {
    case 'running':
      return 'bg-[#22c55e] shadow-[0_0_10px_rgba(34,197,94,0.7)]';
    case 'completed':
    case 'in-progress':
      return 'bg-[#22c55e]';
    case 'idle':
    case 'pending':
      return 'bg-gray-400';
    case 'maintenance':
    case 'on-hold':
      return 'bg-[#ef4444] shadow-[0_0_10px_rgba(239,68,68,0.7)]';
    default:
      return 'bg-gray-400';
  }
}

export function isAnimatedStatus(status: string) {
  return status.toLowerCase() === 'running';
}
