import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MessageText } from "./message-text";

it("renders untrusted chat text safely while keeping links and real mentions usable", () => {
  const html = renderToStaticMarkup(<MessageText
    text={'@Alex @channel\nhttps://example.org/@channel?q=1&x=2 <img src=x onerror=alert(1)> javascript:alert(1)'}
    members={[{ id: "alex", name: "Alex" }]} currentUserId="alex"
    channelMentions
  />);
  expect(html).toContain('data-mention-self=""');
  expect(html.match(/data-mention-self/g)).toHaveLength(2);
  expect(html.match(/data-mention-channel/g)).toHaveLength(1);
  expect(html).toContain('href="https://example.org/@channel?q=1&amp;x=2"');
  expect(html).toContain('target="_blank" rel="noopener noreferrer ugc"');
  expect(html).toContain("&lt;img");
  expect(html).not.toContain("<img");
  expect(html).not.toContain('href="javascript:');
});
