import { expect, it } from "vitest";
import { describeInvoiceWork } from "./invoice-description";
it("describes the signing milestone and both source works without repeating the amount", () => {
 const text = describeInvoiceWork({trigger:"on_signing",agreement:"Memorandum of Understanding",works:["52 Khmer article translations with audio production","52 Khmer talking-head videos"],fallback:"$6,094.69 upon signing"});
 expect(text).toContain("Signing installment under Memorandum of Understanding.");
 expect(text).toContain("- 52 Khmer article translations with audio production");
 expect(text).toContain("- 52 Khmer talking-head videos");
 expect(text).not.toContain("$6,094.69");
});
it("keeps completion terms distinct and removes duplicate titles", () => {
 expect(describeInvoiceWork({trigger:"on_completion",agreement:"MoU",works:["Videos","Videos"]})).toBe("Completion and delivery installment under MoU.\n\nCovered work:\n- Videos");
});
it("preserves a custom trigger description", () => {
 expect(describeInvoiceWork({trigger:"custom",agreement:"MoU",works:["Articles"],fallback:"Publication of the first 52 episodes"})).toContain("Publication of the first 52 episodes");
});
