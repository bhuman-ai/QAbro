function resolveEvidenceRequirements(options = {}) {
  const hasBrowserbaseEvidence = Boolean(options.hasBrowserbaseEvidence);
  const configuredRequiredScreenshots = hasBrowserbaseEvidence
    ? 0
    : Math.max(1, Number(options.requiredScreenshots) || 4);
  const requiredVideos = Math.max(0, Number(options.requiredVideos) || 1);
  const videoCount = Math.max(0, Number(options.videoCount) || 0);
  const hasRichVideoCoverage = videoCount >= Math.max(2, requiredVideos);
  const requiredScreenshots = hasRichVideoCoverage
    ? Math.min(configuredRequiredScreenshots, 2)
    : configuredRequiredScreenshots;

  return {
    configuredRequiredScreenshots,
    requiredScreenshots,
    requiredVideos,
    hasRichVideoCoverage
  };
}

module.exports = {
  resolveEvidenceRequirements
};
