export const fixtures = [
  {
    name: "reports JSON parsed from an OpenAI HTTP response body",
    seed: {
      "src/chat.ts": "const response = await fetch('https://api.openai.com/v1/chat/completions');\nconst body = await response.text();\nconst result = JSON.parse(body);\n",
    },
    expected: [{ file: "src/chat.ts", line: 3 }],
  },
  {
    name: "reports JSON parsed from an Anthropic SDK completion property",
    seed: {
      "src/chat.ts": "const message = await client.messages.create({ model: \"claude-sonnet\" });\nconst result = JSON.parse(message.content[0].text);\n",
    },
    expected: [{ file: "src/chat.ts", line: 2 }],
  },
  {
    name: "allows an LLM response parsed through a schema",
    seed: {
      "src/chat.ts": "const response = await fetch('https://api.openai.com/v1/responses');\nconst body = await response.text();\nconst result = ResultSchema.parse(JSON.parse(body));\n",
    },
    expected: [],
  },
  {
    name: "ignores JSON parsed from a non-LLM API response",
    seed: {
      "src/user.ts": "const response = await fetch(\"https://api.example.com/users\");\nconst body = await response.text();\nconst user = JSON.parse(body);\n",
    },
    expected: [],
  },
  {
    name: "ignores an OpenAI URL string unrelated to the parsed value",
    seed: {
      "src/example.ts": "const endpoint = 'https://api.openai.com/v1/responses';\nconst config = JSON.parse('{\"retries\": 3}');\n",
    },
    expected: [],
  },
];
