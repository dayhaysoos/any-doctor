export const fixtures = [
  {
    name: "reports an empty catch with an error binding",
    seed: {
      "src/handler.ts": "try {\n  work();\n} catch (error) {}\n",
    },
    expected: [{ file: "src/handler.ts", line: 1 }],
  },
  {
    name: "reports an empty catch without an error binding",
    seed: {
      "src/optional-binding.js": "try {\n  work();\n} catch {\n}\n",
    },
    expected: [{ file: "src/optional-binding.js", line: 3 }],
  },
  {
    name: "reports a comment-only catch block",
    seed: {
      "src/documented.ts": "try {\n  work();\n} catch (error) {\n  // Intentionally ignored.\n}\n",
    },
    expected: [{ file: "src/documented.ts", line: 1 }],
  },
  {
    name: "allows a catch block that handles the error",
    seed: {
      "src/reported.ts": "try {\n  work();\n} catch (error) {\n  console.error('work failed', error);\n}\n",
    },
    expected: [],
  },
];
