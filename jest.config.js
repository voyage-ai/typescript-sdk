/** @type {import('jest').Config} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
    coverageThreshold: {
      "global": {
        "branches": 70,
        "functions": 80,
        "lines": 85,
        "statements": 85,
      }
    }
};
