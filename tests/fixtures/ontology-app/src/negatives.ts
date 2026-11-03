// Every @ts-expect-error below must fail for the intended reason. If one stops
// producing an error, tsc reports "Unused @ts-expect-error directive".
import { createFrontal } from "../.frontal/client";

const frontal = createFrontal({ apiKey: "test" });

export async function negatives(): Promise<void> {
  const customer = await frontal.ontology.Customer.get("123");

  // @ts-expect-error age is a number, not a string
  const age: string = customer.age;

  // @ts-expect-error unknown property
  console.log(customer.unknownProperty);

  // @ts-expect-error email must be a string
  await frontal.ontology.Customer.create("x", { email: 42, status: "active" });

  await frontal.ontology.Customer.create("x", {
    email: "a@example.com",
    // @ts-expect-error status must be one of the enum values
    status: "archived",
  });

  // @ts-expect-error list is not part of the typed slice (no backend type filter)
  frontal.ontology.Customer.list();

  // @ts-expect-error unknown entity
  frontal.ontology.Ghost.get("1");

  // @ts-expect-error a relation resolves to an entity, not a string
  const company: string = await customer.company();

  console.log(age, company);
}
