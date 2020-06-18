module.exports = {
    "roots": [
        "<rootDir>/src/tests"
    ],
    testMatch: [ '**/*.test.ts'],
    "transform": {
        "^.+\\.ts$": "ts-jest"
    },
    collectCoverage: true,
    collectCoverageFrom: [
        "**/*.{ts,js}",
        "!**/*.d.{ts,js}",
        "!**/*.test.{ts,js}",
        "!**/node_modules/**",
        "!**/vendor/**"
    ],
    coverageThreshold: {
        global: {
            statements: 0,
            branches: 0,
            functions: 0,
            lines: 0,
        }
    },
}
