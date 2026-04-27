import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateAIImage(prompt: string, aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "1:1") {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio,
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Image generation error:", error);
    throw error;
  }
}

export async function editAIImage(base64Image: string, prompt: string) {
  try {
    // Remove data:image/png;base64, prefix if present
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: "image/png",
            },
          },
          {
            text: prompt,
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Image edit error:", error);
    throw error;
  }
}

export async function optimizePrompt(rawPrompt: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Transform this simple prompt into a detailed, high-quality AI image generation prompt for an artistic and cinematic look. Keep it concise but descriptive. Prompt: "${rawPrompt}"`,
    });
    return response.text?.trim() || rawPrompt;
  } catch (error) {
    return rawPrompt;
  }
}
