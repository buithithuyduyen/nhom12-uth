import { ShipmentProvider } from "@/components/app/shipment-context";
import { Workspace } from "@/components/workspace/Workspace";

export default function Home() {
  return (
    <ShipmentProvider>
      <Workspace />
    </ShipmentProvider>
  );
}
