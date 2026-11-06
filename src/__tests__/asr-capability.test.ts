import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM helper without type declarations
import { parseFilters } from "../../skills/metrix-video-assembly/scripts/media/asr.mjs";

// Injected `ffmpeg -filters` text, so the result is the same on CI (apt ffmpeg, no whisper
// filter) and locally (gyan.dev 9.0.1 full build, whisper filter present).
const gyan901 = `Filters:
  T.. = Timeline support
  .S. = Slice threading
  A = Audio input/output
 ..  silencedetect     A->A       Detect silence.
 ..  whisper           A->A       Transcribe audio using whisper.cpp.
 ..  scdet             V->V       Detect video scene change
 ..  scdet_vulkan      V->V       Detect video scene change
 ..  freezedetect      V->V       Detects frozen video input.
`;

const apt61 = `Filters:
  T.. = Timeline support
 ... silencedetect     A->A       Detect silence.
 ... scdet             V->V       Detect video scene change
 T.. freezedetect      V->V       Detects frozen video input.
 TSC whisperish        A->A       Not the whisper filter.
`;

describe("ffmpeg filter capability", () => {
  it("sees the whisper filter in a build that has it", () => {
    expect(parseFilters(gyan901)).toEqual({ whisper_filter: true, silencedetect: true, scdet: true, freezedetect: true });
  });

  it("reports no whisper filter in a build without it, and does not match a longer name", () => {
    expect(parseFilters(apt61)).toEqual({ whisper_filter: false, silencedetect: true, scdet: true, freezedetect: true });
  });

  it("does not count scdet_vulkan as scdet", () => {
    expect(parseFilters(" ..  scdet_vulkan      V->V       Detect video scene change\n").scdet).toBe(false);
  });

  it("reports nothing for empty output", () => {
    expect(parseFilters("")).toEqual({ whisper_filter: false, silencedetect: false, scdet: false, freezedetect: false });
  });
});
