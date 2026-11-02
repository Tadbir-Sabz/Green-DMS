"use client";

import { createApiClient } from '@dms/api-client';
import { useQuery } from '@tanstack/react-query';

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000") + "/api/v1";

export const TOKEN_KEY = 'dms.access_token';
export const USERNAME_KEY = 'dms.username';
export const REFRESH_KEY = 'dms.refresh_token';
export const EXPIRES_KEY = 'dms.expires_at';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USERNAME_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setSession(
  token: string,
  username: string,
  refreshToken?: string | null,
  expiresInSeconds?: number,
): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  else localStorage.removeItem(REFRESH_KEY);
  if (typeof expiresInSeconds === 'number') {
    localStorage.setItem(EXPIRES_KEY, String(Date.now() + expiresInSeconds * 1000));
  } else {
    localStorage.removeItem(EXPIRES_KEY);
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

export function errorMessage(error: unknown): string {
  const e = error as { message_fa?: string; message?: string } | undefined;
  return e?.message_fa ?? (typeof e?.message === 'string' ? e.message : 'خطای ناشناخته‌ای رخ داد.');
}

export const api = createApiClient({
  baseUrl: BASE_URL,
  getToken,
});

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const res = await api.GET("/customers" as any, {});
      return (res as any).data;
    },
  });
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const res = await api.GET("/orders" as any, {});
      return (res as any).data;
    },
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const res = await api.GET("/invoices" as any, {});
      return (res as any).data;
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await api.GET("/products" as any, {});
      return (res as any).data;
    },
  });
}
