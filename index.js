import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { mkdir, readdir, unlink } from "fs/promises";
import { join } from "path";
import router from "./router/router.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT;
const UPLOADS_DIR = "uploads";
const CLEANUP_INTERVAL = 1000 * 60 * 60; // Clean every hour

// Function to clean up old files in uploads directory
async function cleanupUploadsDirectory() {
  try {
    const files = await readdir(UPLOADS_DIR);
    for (const file of files) {
      try {
        await unlink(join(UPLOADS_DIR, file));
        console.log(`Cleaned up old file: ${file}`);
      } catch (err) {
        console.error(`Error deleting file ${file}:`, err);
      }
    }
  } catch (err) {
    console.error("Error reading uploads directory:", err);
  }
}

// Create uploads directory if it doesn't exist
try {
  await mkdir(UPLOADS_DIR, { recursive: true });
  // Clean up any existing files on startup
  await cleanupUploadsDirectory();
} catch (err) {
  if (err.code !== "EEXIST") {
    console.error("Error creating uploads directory:", err);
  }
}

// Set up periodic cleanup
setInterval(cleanupUploadsDirectory, CLEANUP_INTERVAL);

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Add the router
app.use("/api/v1", router);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
