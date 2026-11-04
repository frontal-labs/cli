// The pinned (optional) client: runtime metadata comes from .frontal/client.ts,
// so no object-types request is made. Kept compiled so that path stays covered.
import { createFrontal } from "../.frontal/client";

const pinned = createFrontal({ apiKey: "test" });

export async function pinnedEmail(id: string): Promise<string> {
  const customer = await pinned.ontology.Customer.get(id);
  return customer.email;
}
