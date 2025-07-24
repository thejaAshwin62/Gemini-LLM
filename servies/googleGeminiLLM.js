import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import * as fs from "fs/promises";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  console.error(
    "Error: API key is missing. Please set the GOOGLE_API_KEY environment variable."
  );
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

async function initializeModel() {
  try {
    const model = await genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig,
    });
    return model;
  } catch (error) {
    console.error("Error fetching generative model:", error);
    throw error;
  }
}

async function fileToGenerativePart(path, mimeType) {
  try {
    const data = await fs.readFile(path);
    return {
      inlineData: {
        data: Buffer.from(data).toString("base64"),
        mimeType,
      },
    };
  } catch (error) {
    console.error("Error reading file:", error);
    throw error;
  }
}

async function cleanupFile(filePath) {
  try {
    await fs.unlink(filePath);
    console.log(`Cleaned up temporary file: ${filePath}`);
  } catch (error) {
    console.error(`Error cleaning up file ${filePath}:`, error);
  }
}

export async function generateContentFromImageAndText(imagePath, prompt) {
  try {
    const model = await initializeModel();
    const imagePart = await fileToGenerativePart(imagePath, "image/jpeg");

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;

    // Clean up the image file after processing
    await cleanupFile(imagePath);

    return response.text();
  } catch (error) {
    // Attempt to clean up even if processing failed
    await cleanupFile(imagePath);
    console.error("Error in generateContentFromImageAndText:", error);
    throw error;
  }
}
