export type ServiceRow = {
  id: string; order_id: string; order_number: string; order_status: "draft" | "confirmed" | "cancelled";
  revision: number; position: number; client_name: string; description: string;
  quantity: string; unit: string; fulfillment: "pending" | "partial" | "complete";
  commitment_date: string | null; completed_date: string | null;
};
export type ServiceList = { rows: ServiceRow[]; count: number };
