// Every @ts-expect-error below must fail for the intended reason. If one stops
// producing an error, tsc reports "Unused @ts-expect-error directive".
import { Frontal } from "@frontal-labs/sdk";

const frontal = new Frontal({ apiKey: "test" });

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

  // @ts-expect-error hasOne resolves to an Address record or null, never a string
  const wrongOne: string = await customer.primaryAddress();

  // @ts-expect-error hasMany resolves to a list of Order records, never a list of strings
  const wrongMany: string[] = await customer.orders();

  // @ts-expect-error a relation that is not declared in the ontology has no accessor
  await customer.loyaltyTier();

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

  console.log(age, company, wrongOne, wrongMany);
}
