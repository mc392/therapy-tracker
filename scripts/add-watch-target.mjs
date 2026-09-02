/* Adds the watchOS app to the Xcode project.

   Same job, and the same reasoning, as add-native-plugin.mjs: `npx cap add ios` regenerates
   ios/ from Capacitor's template, which knows nothing about anything we wrote ourselves. The
   difference is that this one adds a whole target rather than a file, so the failure it
   guards against is bigger — a regenerated project would build and ship an iPhone app with
   no watch app inside it, and nothing about that looks wrong until someone goes looking for
   the app on their wrist.

   Idempotent. Wired into `npm run sync`, asserted by `npm run check`. */
import xcode from "xcode";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJ = resolve("ios/App/App.xcodeproj/project.pbxproj");
const TARGET = "GroundWorkWatch";
const DIR = "GroundWorkWatch";
const HOST_BUNDLE_ID = "uk.co.charlottebloortherapy.groundwork";
/* Apple requires exactly this shape for a watch app embedded in an iOS app. */
const BUNDLE_ID = `${HOST_BUNDLE_ID}.watchkitapp`;
const TEAM = "L8B6623MNM";

const SOURCES = [
  "GroundWorkWatchApp.swift",
  "SessionTimer.swift",
  "TimerView.swift",
  "SettingsView.swift"
].map((f) => `${DIR}/${f}`);
const RESOURCES = [`${DIR}/Assets.xcassets`];

const proj = xcode.project(PROJ);
proj.parseSync();

const targets = proj.pbxNativeTargetSection();
const already = Object.entries(targets).some(
  ([key, t]) => !key.endsWith("_comment") && t && String(t.name).replace(/"/g, "") === TARGET
);

if (already) {
  console.log(`  ${TARGET} already in the Xcode project`);
  process.exit(0);
}

/* addTarget() hangs the "Embed Watch Content" phase and the build dependency off whatever
   getFirstTarget() returns, so it had better be the iPhone app. */
const host = proj.getFirstTarget();
if (!host || String(host.firstTarget.name).replace(/"/g, "") !== "App")
  throw new Error("The first Xcode target is not App — refusing to embed the watch app in it");

/* watch2_app is the target type that gets the right embed phase — a PBXCopyFilesBuildPhase
   into $(CONTENTS_FOLDER_PATH)/Watch. Its product type is the old watchOS 2 one, though, and
   this is a single-target watch app (no WatchKit extension bundle, WKApplication in the
   Info.plist), so the product type is corrected to a plain application below. */
/* addTarget() wants to register the build dependency itself, but it does so only if the
   PBXTargetDependency and PBXContainerItemProxy sections already exist — and a project with
   a single target has neither. Without them the call is a silent no-op, the watch app is
   embedded without ever being built first, and the failure is a build-order one that will
   not reproduce on a clean machine. So the sections are seeded, and the result asserted. */
const objects = proj.hash.project.objects;
objects.PBXTargetDependency = objects.PBXTargetDependency || {};
objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

const target = proj.addTarget(TARGET, "watch2_app", DIR, BUNDLE_ID);
target.pbxNativeTarget.productType = '"com.apple.product-type.application"';

if (!host.firstTarget.dependencies.some((d) => d.comment === "PBXTargetDependency"))
  throw new Error("App does not depend on the watch target — it would be embedded unbuilt");

proj.addBuildPhase(SOURCES, "PBXSourcesBuildPhase", "Sources", target.uuid);
proj.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);
proj.addBuildPhase(RESOURCES, "PBXResourcesBuildPhase", "Resources", target.uuid);

/* A navigator group with a name but no path, so its children keep the project-relative
   paths the build phases above already registered them under. Giving the group a path
   instead would make Xcode resolve them as GroundWorkWatch/GroundWorkWatch/… */
const group = proj.addPbxGroup([...SOURCES, ...RESOURCES, `${DIR}/Info.plist`], TARGET);
delete group.pbxGroup.path;
proj.getPBXGroupByKey(proj.getFirstProject().firstProject.mainGroup).children.push({
  value: group.uuid,
  comment: TARGET
});

/* The build settings the template cannot guess. Two are load-bearing beyond the obvious:

   CURRENT_PROJECT_VERSION / MARKETING_VERSION are written out literally rather than left to
   inherit, because scripts/release-ios.mjs bumps them with a global regex over this file —
   a watch app whose build number has drifted from its host app is rejected at upload, and
   inheriting would have left nothing here for the bump to find.

   CODE_SIGN_IDENTITY is set because the project-level Release config says "iPhone Developer",
   which is not a thing a watchOS target can be signed with. */
const SETTINGS = {
  ASSETCATALOG_COMPILER_APPICON_NAME: "AppIcon",
  ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: "AccentColor",
  CODE_SIGN_IDENTITY: '"Apple Development"',
  CODE_SIGN_STYLE: "Automatic",
  CURRENT_PROJECT_VERSION: "1",
  DEVELOPMENT_TEAM: TEAM,
  GENERATE_INFOPLIST_FILE: "NO",
  INFOPLIST_FILE: `${DIR}/Info.plist`,
  LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks"',
  MARKETING_VERSION: "1.0",
  PRODUCT_BUNDLE_IDENTIFIER: BUNDLE_ID,
  PRODUCT_NAME: '"$(TARGET_NAME)"',
  SDKROOT: "watchos",
  SKIP_INSTALL: "YES",
  SUPPORTED_PLATFORMS: '"watchos watchsimulator"',
  SWIFT_VERSION: "5.0",
  TARGETED_DEVICE_FAMILY: "4",
  WATCHOS_DEPLOYMENT_TARGET: "9.0"
};

const configs = proj.pbxXCBuildConfigurationSection();
const listKey = target.pbxNativeTarget.buildConfigurationList;
const list = proj.pbxXCConfigurationList()[listKey];
for (const { value } of list.buildConfigurations) {
  const settings = configs[value].buildSettings;
  /* The lib seeds an INFOPLIST_FILE of its own naming and an iOS-shaped runpath; both are
     replaced rather than merged. */
  delete settings.IPHONEOS_DEPLOYMENT_TARGET;
  Object.assign(settings, SETTINGS);
}

writeFileSync(PROJ, proj.writeSync());
console.log(`  added the ${TARGET} target, embedded in App`);
