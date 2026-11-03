import { createFrontal } from "../.frontal/client";

const frontal = createFrontal({ apiKey: "test" });

export async function run(): Promise<void> {
  const customer = await frontal.ontology.Customer.get("123");

  const email: string = customer.email;
  const status: "active" | "closed" = customer.status;
  const score: number = customer.score;

  const company = await customer.company();
  const companyName: string | undefined = company?.name;

  await frontal.ontology.Customer.create("c-1", {
    email: "a@example.com",
    status: "active",
  });
  await frontal.ontology.Customer.update("c-1", { score: 3 });
  await frontal.ontology.Customer.delete("c-1");

  console.log(email, status, score, companyName);
}
