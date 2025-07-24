import { Router } from "express";
import multer from "multer";
import { generateContentFromImageAndText } from "../servies/googleGeminiLLM.js";
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

export default router;
