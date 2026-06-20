// PLACEHOLDER — DO NOT DELETE.
// This file must exist in the repository (committed to git) so that Vercel's
// pre-build validation of the `functions` pattern in vercel.json succeeds.
// During the actual build, `script/build.ts` overwrites this file with the
// real esbuild-bundled serverless function (built from api/index.ts).
// NOTE: must stay .cjs (not .js) because package.json has "type": "module" —
// a .js file would be parsed as an ES module and crash on `module.exports`.
module.exports = async function handler(req, res) {
  res.statusCode = 500;
  res.end("Build did not run — placeholder handler.cjs was not overwritten.");
};
