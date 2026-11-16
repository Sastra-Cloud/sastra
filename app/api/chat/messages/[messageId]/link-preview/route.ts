import { and, eq, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth/guards";
import { canAccessMessage } from "@/lib/chat/access";
import { firstMessageLink } from "@/lib/chat/message-links";
import { getLinkPreview, getLinkPreviewImage } from "@/lib/chat/link-preview";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";

export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  const { messageId } = await params;
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(messageId) || !(await canAccessMessage(messageId, session.user.id))) {
    return new Response(null, { status: 404, headers: privateHeaders });
  }
  const [message] = await db.select({ content: chatMessages.content }).from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt), eq(chatMessages.status, "sent"))).limit(1);
  const query = new URL(request.url).searchParams;
  const url = message?.content ? firstMessageLink(message.content) : null;
  // Bind every request to the current saved message, including after edits/deletes.
  if (!url || query.get("url") !== url) return new Response(null, { status: 404, headers: privateHeaders });
  const preview = await getLinkPreview(url);
  if (query.get("image") === "1") {
    const image = preview?.image ? await getLinkPreviewImage(preview.image) : null;
    return image ? new Response(new Uint8Array(image), { headers: { ...privateHeaders, "Content-Type": "image/webp" } })
      : new Response(null, { status: 404, headers: privateHeaders });
  }
  return Response.json({ preview: preview ? { title: preview.title, description: preview.description, hasImage: !!preview.image } : null }, { headers: privateHeaders });
}
