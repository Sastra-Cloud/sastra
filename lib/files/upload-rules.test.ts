import { expect, it } from "vitest";

import { uploadContentType, validateUpload } from "./upload-rules";

const check = (name: string, type: string) =>
  validateUpload(uploadContentType({ name, type }), 661);

it("accepts allowed files that browsers report with no type or their own name for it", () => {
  // A calendar invite was refused in chat and left empty failed messages.
  expect(check("invite.ics", "text/calendar")).toBeNull();
  expect(check("INVITE.ICS", "")).toBeNull();
  expect(check("layout.idml", "")).toBeNull();
  expect(uploadContentType({ name: "files.zip", type: "application/x-zip-compressed" })).toBe("application/zip");
  // A type the browser reports and the server allows is kept as it is.
  expect(uploadContentType({ name: "voice.bin", type: "audio/webm;codecs=opus" })).toBe("audio/webm;codecs=opus");
});

it("still refuses files that are not on the list, whatever they are named", () => {
  expect(check("page.html", "text/html")).toContain("can't be uploaded");
  expect(check("setup.exe", "")).toContain("can't be uploaded");
  expect(check("script.pdf.js", "text/javascript")).toContain("can't be uploaded");
});
