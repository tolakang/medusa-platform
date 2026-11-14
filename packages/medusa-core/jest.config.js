// Unit tests of the core (BUILD_PLAN.md §4.5). Same transform as the backends;
// HTTP and module tests stay in the apps, which test how each app wires a feature.
module.exports = {
  transform: {
    "^.+\\.[jt]s$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
        },
      },
    ],
  },
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts", "json"],
  modulePathIgnorePatterns: ["dist/", "<rootDir>/.medusa/"],
  testMatch: ["**/src/**/__tests__/**/*.unit.spec.[jt]s"],
}
