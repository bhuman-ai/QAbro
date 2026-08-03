type CursorAwareVideoConstraints = MediaTrackConstraints & {
  cursor?: "always" | "motion" | "never";
};

function isUnsupportedCursorConstraint(error: unknown) {
  const name = error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name || "")
    : "";
  return name === "TypeError" || name === "OverconstrainedError";
}

export async function getDisplayMediaWithCursor(
  mediaDevices: Pick<MediaDevices, "getDisplayMedia"> = navigator.mediaDevices
) {
  try {
    return await mediaDevices.getDisplayMedia({
      video: { cursor: "always" } as CursorAwareVideoConstraints,
      audio: true
    });
  } catch (error) {
    if (!isUnsupportedCursorConstraint(error)) {
      throw error;
    }
    return mediaDevices.getDisplayMedia({ video: true, audio: true });
  }
}
