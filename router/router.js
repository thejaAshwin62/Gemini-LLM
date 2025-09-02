import { Router } from "express";
import multer from "multer";
import {
  generateContentFromImageAndText,
  generateVideoFromPrompt,
  checkVeo3Credits,
} from "../servies/googleGeminiLLM.js";
import path from "path";

const router = Router();

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Endpoint to process image and text
router.post("/process", upload.single("image"), async (req, res) => {
  try {
    if (!req.file || !req.body.prompt) {
      return res
        .status(400)
        .json({ error: "Both image and prompt are required" });
    }

    const result = await generateContentFromImageAndText(
      req.file.path,
      req.body.prompt
    );

    res.json({ response: result });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Failed to process the request" });
  }
});

// Endpoint to generate video from text prompt using Veo 3.0
router.post("/generate-video", async (req, res) => {
  try {
    const { prompt, model, aspectRatio, watermark, imageUrls, filename } =
      req.body;

    if (!prompt) {
      return res
        .status(400)
        .json({ error: "Prompt is required for video generation" });
    }

    const options = {
      model: model || "veo3",
      aspectRatio: aspectRatio || "16:9",
      watermark: watermark || null,
      imageUrls: imageUrls || null,
      outputFilename: filename || `video_${Date.now()}.mp4`,
    };

    const result = await generateVideoFromPrompt(prompt, options);

    res.json(result);
  } catch (error) {
    console.error("Error generating video:", error);
    res.status(500).json({
      error: "Failed to generate video",
      details: error.message,
    });
  }
});

// Endpoint to check Veo3 API credits
router.get("/credits", async (req, res) => {
  try {
    const result = await checkVeo3Credits();
    res.json(result);
  } catch (error) {
    console.error("Error checking credits:", error);
    res.status(500).json({
      error: "Failed to check credits",
      details: error.message,
    });
  }
});

export default router;
