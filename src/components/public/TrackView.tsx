"use client";

import * as React from "react";
import { trackVehicleView } from "@/app/actions/enquiry";
import { useRecentlyViewed } from "@/lib/browser-store";

/**
 * Records a page view once per mount: increments the server-side counter that
 * powers the "popular cars" report, and adds the car to the visitor's
 * recently-viewed list.
 */
export function TrackView({ vehicleId }: { vehicleId: string }) {
  const { add } = useRecentlyViewed();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    add(vehicleId);
    void trackVehicleView(vehicleId);
  }, [vehicleId, add]);

  return null;
}
