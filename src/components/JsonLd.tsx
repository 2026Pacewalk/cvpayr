import { graph } from "@/lib/seo";

/**
 * Emits one JSON-LD block for a page.
 *
 * Everything goes into a single @graph rather than several script tags so the
 * nodes can reference each other by @id — a car listing that points at its
 * dealer, a dealer that points at the platform.
 */
export function JsonLd({ nodes }: { nodes: (Record<string, unknown> | null | undefined)[] }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: graph(...nodes) }} />
  );
}
