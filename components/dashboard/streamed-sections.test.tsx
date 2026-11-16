import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ManagerReviewItem } from "@/lib/dashboard/attention";
import { StreamedManagerReview } from "./streamed-sections";

const item: ManagerReviewItem = {
  id: "review-1",
  source: "project_update",
  title: "Review the Genesis update",
  detail: null,
  project: null,
  priority: "medium",
  href: "/projects/genesis",
  actionLabel: "Review project",
  createdAt: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function readAll(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value, { stream: true });
  }
}

describe("dashboard secondary sections", () => {
  // Protects the reason these sections exist: ready tasks must not wait for
  // the manager review query, and the late result must still arrive.
  it("sends the page and a placeholder before review items resolve, then the items", async () => {
    const review = deferred<ManagerReviewItem[]>();
    const stream = await renderToReadableStream(
      <main>
        <ul><li>Task that is ready now</li></ul>
        <StreamedManagerReview items={review.promise} limit={3} />
      </main>
    );
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    // The shell is complete while the review promise is still pending.
    const first = decoder.decode((await reader.read()).value);
    expect(first).toContain("Task that is ready now");
    expect(first).toContain("Loading items to review");
    expect(first).not.toContain("Review the Genesis update");

    review.resolve([item]);
    const rest = await readAll(reader);
    expect(rest).toContain("Review the Genesis update");
  });

  it("renders nothing for an empty review list instead of an empty box", async () => {
    const stream = await renderToReadableStream(
      <StreamedManagerReview items={Promise.resolve([])} limit={3} />
    );
    await stream.allReady;
    const html = await readAll(stream.getReader());
    expect(html).not.toContain("Review");
    expect(html).not.toContain("role=\"alert\"");
  });
});
