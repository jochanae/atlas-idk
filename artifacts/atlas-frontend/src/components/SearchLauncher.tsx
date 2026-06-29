// SearchLauncher — global mount that opens the SearchModal in response to
// `axiom:open-search`. Replaces the previous silent fallback that routed
// Search to Home.
import { useEffect, useState } from "react";
import { SearchModal } from "@/components/workspace/SearchModal";

export function SearchLauncher() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("axiom:open-search", onOpen);
    return () => window.removeEventListener("axiom:open-search", onOpen);
  }, []);
  return <SearchModal open={open} onClose={() => setOpen(false)} />;
}

export default SearchLauncher;
