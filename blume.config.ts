import { defineConfig } from "blume";

export default defineConfig({
  title: "数理・情報科学課程",
  description: "龍谷大学 先端理工学部 数理・情報科学課程",
  logo: "/images/zero.png",
  feedback: false,
  theme: {
    accent: "#f50000",
    radius: "sm",
    fonts: {
      display: "lora",
      body: "inter",
      mono: "ibm-plex-mono",
    },
  },
  deployment: {
    output: "server",
    adapter: "node",
  },
  ai: {
    ask: {
      enabled: true,
      provider: "openai-compatible",
      baseUrl: "http://slab-llm.math.ryukoku.ac.jp:11434/v1",
      apiKeyEnv: "OLLAMA_API_KEY",
      model: "gemma4:e4b",
      suggestions: [
        { label: "数理・情報科学課程にはどんな教員がいますか？", icon: "users" },
        { label: "オープンキャンパスではどんな体験ができますか？", icon: "flask-conical" },
        { label: "入学後の進路にはどんなものがありますか？", icon: "graduation-cap" },
      ],
    },
  },
});
