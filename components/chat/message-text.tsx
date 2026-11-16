import { MentionText } from "@/components/mentions/mention-text";
import { messageLinkSegments } from "@/lib/chat/message-links";

export function MessageText(props: React.ComponentProps<typeof MentionText>) {
  return messageLinkSegments(props.text).map((segment, index) => segment.type === "link" ? (
    <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer ugc"
      className="rounded-sm font-medium underline decoration-current underline-offset-2 [overflow-wrap:anywhere] hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
    >
      {segment.text}<span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : <MentionText key={index} {...props} text={segment.text} />);
}
