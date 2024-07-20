/** @type {import('jest').Config} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    coverageThreshold: {
      "global": {
        "branches": 75,
        "functions": 85,
        "lines": 90,
        "statements": 90
      }
    }
};
