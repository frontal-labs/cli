import { pageEnvelopeSchema } from "@/lib/ontology/backend.js";
import { MAX_PAGES } from "@/lib/ontology/constants.js";
import {
  malformedResponse,
  pageFailed,
  pageLimit,
} from "@/lib/ontology/errors.js";

/**
 * The structural part of the SDK's `PageResult` that paging needs. Tests can
 * supply fake pages without a network.
 */
export interface PageSource {
  readonly data: readonly unknown[];
  readonly nextPage: () => Promise<PageSource | null>;
  readonly pagination: unknown;
}

interface PageEnvelope {
  data: unknown[];
  hasMore: boolean;
}

/** Validates the envelope of one page at the boundary. */
function readEnvelope(page: PageSource, pageNumber: number): PageEnvelope {
  const parsed = pageEnvelopeSchema.safeParse({
    data: page.data,
    pagination: page.pagination,
  });
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const where =
      issue && issue.path.length > 0
        ? issue.path.map(String).join(".")
        : "page";
    throw malformedResponse(
      `Object-type page ${pageNumber} is malformed at ${where}: ${issue?.message ?? "invalid"}.`
    );
  }
  return { data: parsed.data.data, hasMore: parsed.data.pagination.hasMore };
}

/**
 * Requests the page after `page`. Any failure is reported as a partial read:
 * no file has been written when this runs, so the message says so.
 */
async function requestNext(
  page: PageSource,
  pageNumber: number
): Promise<PageSource> {
  let next: PageSource | null;
  try {
    next = await page.nextPage();
  } catch (err) {
    throw pageFailed(pageNumber + 1, err);
  }
  if (next === null) {
    throw malformedResponse(
      `Object-type page ${pageNumber} reports more pages, but Frontal returned none.`
    );
  }
  return next;
}

/**
 * Reads every page in sequence (each cursor depends on the previous page).
 * Bounded by MAX_PAGES so a server that never reports the end cannot loop.
 */
export async function collectPages(
  first: PageSource,
  maxPages: number = MAX_PAGES
): Promise<unknown[]> {
  const items: unknown[] = [];
  await readFrom(first, 1, maxPages, items);
  return items;
}

/** Reads page `pageNumber`, then recurses into the next page while the envelope says more follow. */
async function readFrom(
  page: PageSource,
  pageNumber: number,
  maxPages: number,
  items: unknown[]
): Promise<void> {
  if (pageNumber > maxPages) {
    throw pageLimit(maxPages);
  }
  const envelope = readEnvelope(page, pageNumber);
  for (const item of envelope.data) {
    items.push(item);
  }
  if (envelope.hasMore) {
    await readFrom(
      await requestNext(page, pageNumber),
      pageNumber + 1,
      maxPages,
      items
    );
  }
}
