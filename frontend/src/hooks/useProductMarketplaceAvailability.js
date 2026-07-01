import { useEffect, useState } from "react";
import { getMarketplaceFeatures } from "../api/productsApi.js";

export default function useProductMarketplaceAvailability(active = true) {
  const [state, setState] = useState({ loading: Boolean(active), enabled: false, checked: false });

  useEffect(() => {
    let cancelled = false;
    if (!active) {
      setState({ loading: false, enabled: false, checked: false });
      return undefined;
    }
    setState((current) => ({ ...current, loading: true }));
    getMarketplaceFeatures()
      .then((data) => {
        if (cancelled) return;
        setState({
          loading: false,
          enabled: Boolean(data?.features?.productMarketplaceEnabled),
          checked: true,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, enabled: false, checked: true });
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  return state;
}
