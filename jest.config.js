/** @type {import('jest').Config} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    coverageThreshold: {
      "global": {
        "branches": 80,
        "functions": 87,
        "lines": 93,
        "statements": 93
      }
    }
};
