import { useEffect, useState } from "react";
import { request } from "./api";
export function useApi(path) {
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: null,
  });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, data: null, error: null });
    request(path, { signal: controller.signal })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => {
        if (error.name !== "AbortError")
          setState({ loading: false, data: null, error });
      });
    return () => controller.abort();
  }, [path, version]);
  return { ...state, retry: () => setVersion((v) => v + 1) };
}
