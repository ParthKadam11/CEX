import axios from "axios";
import { useEffect, useState } from "react";

export type ActivityItem = {
  signature: string;
  shortSignature: string;
  blockTime: number | null;
  status: "success" | "failed";
  direction: "in" | "out" | "unknown";
  amount: number | null;
  symbol: string;
  explorerUrl: string;
};

export function useActivity(address: string, enabled: boolean) {
  const [activities, setActivities] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !enabled) return;

    const key = `${address}:${enabled}`;
    let cancelled = false;

    axios
      .get<{ activities: ActivityItem[] }>(`/api/activity?address=${address}`)
      .then((res) => {
        if (cancelled) return;
        setActivities(res.data.activities);
        setError(null);
        setRequestKey(key);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          axios.isAxiosError(e) && e.response?.data?.error
            ? String(e.response.data.error)
            : e instanceof Error
              ? e.message
              : "Failed to load activity",
        );
        setRequestKey(key);
      });

    return () => {
      cancelled = true;
    };
  }, [address, enabled]);

  const ready = requestKey === `${address}:true` && enabled;

  return {
    loading: Boolean(address && enabled && !ready),
    activities: ready ? activities : null,
    error: ready ? error : null,
  };
}
