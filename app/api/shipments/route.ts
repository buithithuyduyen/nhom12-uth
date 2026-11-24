import { getShipmentRepo } from "@/lib/storage";
import { createShipment } from "@/lib/pipeline";
import { errorMessage, jsonError, summarize } from "@/lib/api";

export async function GET(): Promise<Response> {
  try {
    const list = await getShipmentRepo().list();
    return Response.json({ shipments: list.map(summarize) });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { voyageName?: string };
    const shipment = await createShipment(body.voyageName);
    return Response.json({ shipment }, { status: 201 });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
