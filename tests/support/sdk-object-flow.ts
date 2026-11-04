/**
 * Consumer code for tests/ontology-sdk-flow.test.ts. It is copied into a temp
 * project and run with `bun`, using `new Frontal()` from @frontal-labs/sdk the
 * way an application would.
 *
 * It prints one JSON line with what it observed; the test asserts on that.
 */
import { Frontal } from "@frontal-labs/sdk";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} must be set`);
  }
  return value;
}

// No runtime argument: the SDK reads the object types once, on first use.
const frontal = new Frontal({
  apiKey: requiredEnv("FRONTAL_API_KEY"),
  baseUrl: requiredEnv("FRONTAL_API_URL"),
});

// Company has no required id: the SDK generates one for create(input).
const company = await frontal.ontology.Company.create({ name: "Acme" });

// Customer is written under an explicit id with put(id, input).
await frontal.ontology.Customer.put("c-flow-1", {
  companyId: company.id,
  email: "flow@example.com",
  status: "active",
});

const read = await frontal.ontology.Customer.get("c-flow-1");
const parent = await read.company();

const updated = await frontal.ontology.Customer.update("c-flow-1", {
  score: 5,
});

const customers = await frontal.ontology.Customer.list();

await frontal.ontology.Customer.delete("c-flow-1");

let deletedIsGone = false;
try {
  await frontal.ontology.Customer.get("c-flow-1");
} catch {
  deletedIsGone = true;
}

const observed = {
  companyName: company.name,
  customerEmail: read.email,
  deletedIsGone,
  listedCustomerIds: customers.map((customer) => customer.id),
  parentName: parent?.name ?? null,
  updatedScore: updated.score,
};

console.log(JSON.stringify(observed));
