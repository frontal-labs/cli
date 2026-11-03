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
  await frontal.ontology.Customer.create({ email: 42, status: "active" });

  await frontal.ontology.Customer.create({
    email: "a@example.com",
    // @ts-expect-error status must be one of the enum values
    status: "archived",
  });

  // @ts-expect-error create generates the id; an explicit id goes through put(id, input)
  frontal.ontology.Customer.create("x", {
    email: "a@example.com",
    status: "active",
  });

  // @ts-expect-error unknown entity
  frontal.ontology.Ghost.get("1");

  // @ts-expect-error a relation resolves to an entity, not a string
  const company: string = await customer.company();

  // @ts-expect-error hasOne is skipped by the generator, so no accessor exists
  await customer.primaryAddress();

  // @ts-expect-error hasMany is skipped by the generator, so no accessor exists
  await customer.orders();

  await frontal.ontology.Customer.create({
    // @ts-expect-error auto fields are read-only, so they are not accepted on create
    createdAt: "now",
    email: "a",
    status: "active",
  });

  // @ts-expect-error computed fields are read-only, so they are not accepted on update
  await frontal.ontology.Customer.update("x", { displayName: "n" });

  // @ts-expect-error put expects the same input as create, with an explicit id
  await frontal.ontology.Customer.put("x", { email: 1, status: "active" });

  // @ts-expect-error a required field cannot be patched to null
  await frontal.ontology.Customer.update("x", { email: null });

  console.log(age, company);
}
