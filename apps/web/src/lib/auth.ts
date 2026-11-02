"use client";

import { useEffect, useState } from "react";

type User = {
  id?: string;
  username?: string;
  roles?: string[];
  role?: string;
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("dms_user") : null;
      if (raw) {
        setUser(JSON.parse(raw));
      }
    } catch {}
    setIsLoading(false);
  }, []);

  return { user, isLoading, setUser };
}
