export const fixtures = [
  {
    name: "reports a direct OpenAI import outside lib/ai",
    seed: {
      "src/chat.ts": "import OpenAI from 'openai';\n\nexport const client = new OpenAI();\n",
    },
    expected: [{ file: "src/chat.ts", line: 1 }],
  },
  {
    name: "reports a multiline Anthropic SDK subpath import",
    seed: {
      "src/messages.ts": "import {\n  Messages\n} from \"@anthropic-ai/sdk/resources/messages\";\n\nexport { Messages };\n",
    },
    expected: [{ file: "src/messages.ts", line: 1 }],
  },
  {
    name: "allows SDK imports inside lib/ai",
    seed: {
      "src/lib/ai/client.ts": "import Anthropic from '@anthropic-ai/sdk';\n\nexport const client = new Anthropic();\n",
    },
    expected: [],
  },
  {
    name: "ignores a string that resembles a direct import",
    seed: {
      "src/example.ts": "const example = \"import OpenAI from 'openai'\";\n\nexport { example };\n",
    },
    expected: [],
  },
  {
    name: "ignores an unrelated package with an OpenAI-like name",
    seed: {
      "src/example.ts": "import client from 'openai-compatible-client';\n\nexport { client };\n",
    },
    expected: [],
  },
];
