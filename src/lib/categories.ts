import {
  Droplet, Zap, Wifi, Building2, Home, Landmark, Car, ShieldCheck,
  Phone, ShoppingCart, Fuel, Receipt, MoreHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type CategoryKey =
  | "agua" | "luz" | "internet" | "condominio" | "aluguel" | "iptu"
  | "ipva" | "carro" | "seguro" | "telefone" | "mercado" | "combustivel"
  | "boleto" | "outros";

export interface Category {
  key: CategoryKey;
  label: string;
  icon: LucideIcon;
  color: string; // tailwind text class
  bg: string;    // tailwind bg class
}

export const CATEGORIES: Category[] = [
  { key: "agua",        label: "Água",         icon: Droplet,         color: "text-sky-600",     bg: "bg-sky-100" },
  { key: "luz",         label: "Luz",          icon: Zap,             color: "text-amber-600",   bg: "bg-amber-100" },
  { key: "internet",    label: "Internet",     icon: Wifi,            color: "text-indigo-600",  bg: "bg-indigo-100" },
  { key: "condominio",  label: "Condomínio",   icon: Building2,       color: "text-slate-600",   bg: "bg-slate-100" },
  { key: "aluguel",     label: "Aluguel",      icon: Home,            color: "text-rose-600",    bg: "bg-rose-100" },
  { key: "iptu",        label: "IPTU",         icon: Landmark,        color: "text-emerald-600", bg: "bg-emerald-100" },
  { key: "ipva",        label: "IPVA",         icon: Car,             color: "text-violet-600",  bg: "bg-violet-100" },
  { key: "carro",       label: "Prest. carro", icon: Car,             color: "text-purple-600",  bg: "bg-purple-100" },
  { key: "seguro",      label: "Seguros",      icon: ShieldCheck,     color: "text-teal-600",    bg: "bg-teal-100" },
  { key: "telefone",    label: "Telefone",     icon: Phone,           color: "text-blue-600",    bg: "bg-blue-100" },
  { key: "mercado",     label: "Mercado",      icon: ShoppingCart,    color: "text-green-600",   bg: "bg-green-100" },
  { key: "combustivel", label: "Combustível",  icon: Fuel,            color: "text-orange-600",  bg: "bg-orange-100" },
  { key: "boleto",      label: "Boleto",       icon: Receipt,         color: "text-cyan-600",    bg: "bg-cyan-100" },
  { key: "outros",      label: "Outros",       icon: MoreHorizontal,  color: "text-gray-600",    bg: "bg-gray-100" },
];

export function getCategory(key: string): Category {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}