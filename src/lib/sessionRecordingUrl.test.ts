import { describe, expect, it } from "vitest";
import { parseSessionRecordingUrl } from "../../supabase/functions/_shared/session-recording-url";

const owner = "71000000-0000-4000-8000-000000000001";
const booking = "71000000-0000-4000-8000-000000000002";
const path = `/storage/v1/object/sign/session-recordings/${owner}/${booking}_1793200000000.webm`;
const publicUrl = `https://ajyalalmaerifa.com${path}?token=test-only`;

describe("private session recording URL validation", () => {
  it("accepts the public proxy when the server uses an internal Supabase address", () => {
    expect(parseSessionRecordingUrl(publicUrl, "http://kong:8000")).toEqual({
      url: publicUrl, ownerId: owner, bookingId: booking,
    });
  });
  it("accepts the canonical www proxy and configured HTTPS Supabase origin", () => {
    expect(parseSessionRecordingUrl(publicUrl.replace("://", "://www."), "http://kong:8000")).not.toBeNull();
    expect(parseSessionRecordingUrl(publicUrl.replace("ajyalalmaerifa.com", "project.supabase.co"), "https://project.supabase.co")).not.toBeNull();
  });
  it("allows URL-encoded query tokens without allowing encoded object paths", () => {
    expect(parseSessionRecordingUrl(publicUrl.replace("test-only", "test%2Donly"), "http://kong:8000")).not.toBeNull();
  });
  it.each([
    publicUrl.replace("https:", "http:"),
    publicUrl.replace("ajyalalmaerifa.com", "evil.invalid"),
    publicUrl.replace("ajyalalmaerifa.com", "ajyalalmaerifa.com.evil.invalid"),
    publicUrl.replace("ajyalalmaerifa.com", "ajyalalmaerifa.com:8443"),
    publicUrl.replace("https://", "https://user:password@"),
    publicUrl.replace("/object/sign/", "/object/public/"),
    publicUrl.replace("/session-recordings/", "/attachments/"),
    publicUrl.replace(`${owner}/`, `${owner}%2f`),
    publicUrl.replace(`${owner}/`, `${owner}/../${owner}/`),
    publicUrl.replace(".webm", ".html"),
    publicUrl.replace("?token=test-only", ""),
    `${publicUrl}#fragment`,
    "not-a-url",
    null,
  ])("rejects untrusted or malformed input %#", (value) => {
    expect(parseSessionRecordingUrl(value, "http://kong:8000")).toBeNull();
  });
});
