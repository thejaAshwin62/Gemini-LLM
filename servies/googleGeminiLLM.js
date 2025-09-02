import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import * as fs from "fs/promises";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GOOGLE_API_KEY;
const veo3ApiKey = process.env.VEO3_API_KEY;

if (!apiKey) {
  console.error(
    "Error: API key is missing. Please set the GOOGLE_API_KEY environment variable."
  );
  process.exit(1);
}

if (!veo3ApiKey) {
  console.error(
    "Error: Veo3 API key is missing. Please set the VEO3_API_KEY environment variable."
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

export async function generateVideoFromPrompt(prompt, options = {}) {
  try {
    const {
      model = "veo3",
      aspectRatio = "16:9",
      watermark = null,
      imageUrls = null,
      outputFilename = `video_${Date.now()}.mp4`,
    } = options;

    console.log("Starting Veo3 video generation with prompt:", prompt);

    const requestBody = {
      prompt,
      model,
      aspectRatio,
    };

    if (watermark) {
      requestBody.watermark = watermark;
    }

    if (imageUrls && imageUrls.length > 0) {
      requestBody.imageUrls = imageUrls;
    }

    // Step 1: Start video generation
    const generateResponse = await fetch(
      "https://api.veo3api.ai/api/v1/veo/generate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${veo3ApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      throw new Error(
        `Video generation request failed: ${generateResponse.status} ${errorText}`
      );
    }

    const generateResult = await generateResponse.json();

    if (generateResult.code !== 200) {
      throw new Error(`Video generation failed: ${generateResult.msg}`);
    }

    const taskId = generateResult.data.taskId;
    console.log(`Video generation started. Task ID: ${taskId}`);

    // Step 2: Poll for completion
    const pollVideo = async () => {
      const statusResponse = await fetch(
        `https://api.veo3api.ai/api/v1/veo/record-info?taskId=${taskId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${veo3ApiKey}`,
          },
        }
      );

      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }

      const statusResult = await statusResponse.json();

      if (statusResult.code !== 200) {
        throw new Error(`Status check failed: ${statusResult.msg}`);
      }

      return statusResult.data;
    };

    // Poll until video is ready
    let status;
    const maxAttempts = 60; // 30 minutes max (30 seconds * 60)
    let attempts = 0;

    while (attempts < maxAttempts) {
      status = await pollVideo();

      if (status.successFlag === 1) {
        console.log("Video generation completed successfully!");

        const videoUrl = status.response.resultUrls[0];

        // Step 3: Download the video to uploads directory
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download video: ${videoResponse.status}`);
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        const downloadPath = `uploads/${outputFilename}`;

        await fs.writeFile(downloadPath, Buffer.from(videoBuffer));
        console.log(`Video downloaded and saved to ${downloadPath}`);

        // Step 4: Get 1080P version if available (for 16:9 videos)
        let hdVideoUrl = null;
        if (aspectRatio === "16:9") {
          try {
            const hdResponse = await fetch(
              `https://api.veo3api.ai/api/v1/veo/get-1080p-video?taskId=${taskId}&index=0`,
              {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${veo3ApiKey}`,
                },
              }
            );

            if (hdResponse.ok) {
              const hdResult = await hdResponse.json();
              if (hdResult.code === 200) {
                hdVideoUrl = hdResult.data.resultUrl;
                console.log("1080P version available");
              }
            }
          } catch (error) {
            console.log("1080P version not available or failed to fetch");
          }
        }

        return {
          success: true,
          taskId,
          videoPath: downloadPath,
          videoUrl,
          hdVideoUrl,
          message: `Video generated successfully and saved as ${outputFilename}`,
          completeTime: status.completeTime,
        };
      } else if (status.successFlag === 0) {
        console.log(
          `Still generating... (attempt ${attempts + 1}/${maxAttempts})`
        );
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds
      } else {
        throw new Error(
          `Video generation failed: ${status.errorMessage || "Unknown error"}`
        );
      }
    }

    throw new Error("Video generation timed out after 30 minutes");
  } catch (error) {
    console.error("Error in generateVideoFromPrompt:", error);
    throw error;
  }
}

// Function to check remaining credits
export async function checkVeo3Credits() {
  try {
    const response = await fetch(
      "https://api.veo3api.ai/api/v1/common/credit",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${veo3ApiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Credit check failed: ${response.status}`);
    }

    const result = await response.json();

    if (result.code !== 200) {
      throw new Error(`Credit check failed: ${result.msg}`);
    }

    return {
      success: true,
      credits: result.data,
      message: `Remaining credits: ${result.data}`,
    };
  } catch (error) {
    console.error("Error checking Veo3 credits:", error);
    throw error;
  }
}
