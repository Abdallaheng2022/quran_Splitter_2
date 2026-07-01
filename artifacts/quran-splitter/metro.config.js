const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const clerkExpoSegment = `${path.sep}@clerk${path.sep}expo${path.sep}`;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    (platform === "ios" || platform === "android") &&
    moduleName.endsWith("specs/NativeClerkModule") &&
    context.originModulePath.includes(clerkExpoSegment)
  ) {
    return context.resolveRequest(context, moduleName, "web");
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
