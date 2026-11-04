import { Frontal } from "@frontal-labs/sdk";

const frontal = new Frontal({ apiKey: "test" });

export async function run(): Promise<void> {
  const customer = await frontal.ontology.Customer.get("123");

  const email: string = customer.email;
  const status: "active" | "closed" = customer.status;
  const score: number = customer.score;
  const displayName: string | null | undefined = customer.displayName;

  const company = await customer.company();
  const companyName: string | undefined = company?.name;

  const order = await frontal.ontology.Order.get("o-1");
  const orderCustomer = await order.customer();
  const orderEmail: string | undefined = orderCustomer?.email;

  // score has a backend default, so it may be omitted on create.
  const created = await frontal.ontology.Customer.create({
    email: "a@example.com",
    status: "active",
  });
  // put writes under an explicit id.
  await frontal.ontology.Customer.put("c-2", {
    email: "b@example.com",
    status: "closed",
  });
  await frontal.ontology.Customer.update(created.id, { score: 3 });
  const everyone: { id: string }[] = await frontal.ontology.Customer.list();
  console.log(everyone.length);
  await frontal.ontology.Customer.delete(created.id);

  const legacy = await frontal.ontology["legacy-account"].get("L-1");
  const code: string = legacy.code;

  console.log(email, status, score, displayName, companyName, orderEmail, code);
}
