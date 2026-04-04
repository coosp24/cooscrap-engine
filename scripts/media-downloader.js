import { getImages } from "../api/image.js";
import { getStories } from "../api/story.js";
import { printLine } from "../util/helpers.js";
import fs from "fs";
import path from "path";

/* ===================== SHARED ===================== */

async function downloadFile(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
}

async function download(url, folder, modelId, extension) {
  const filename = path.basename(new URL(url).pathname + extension);
  const destPath = path.join("data", folder, String(modelId), filename);

  if (fs.existsSync(destPath)) {
    console.log(
      `🐦  Skipped ${extension === ".png" ? "image" : "story"} for model ${modelId} (already exists): ${filename}`,
    );
    return false;
  }

  await downloadFile(url, destPath);
  console.log(
    `✅ Downloaded ${extension === ".png" ? "image" : "story"} for model ${modelId}: ${filename}`,
  );
  return true;
}

/* ===================== IMAGES ===================== */

export async function downloadImages() {
  printLine();
  const images = await getImages();
  let downloaded = 0;
  for (const image of images) {
    try {
      const saved = await download(
        image.image_url,
        "images",
        image.model_id,
        ".png",
      );
      if (saved) downloaded++;
    } catch (error) {
      console.warn(
        `⚠️ Failed to download image for model: ${image.model_id}: ${error.message}`,
      );
    }
    printLine();
  }
  console.log(`📦 Done. ${downloaded} / ${images.length} images downloaded.`);
}

/* ===================== STORIES ===================== */

export async function downloadStories() {
  printLine();
  const stories = await getStories();
  let downloaded = 0;
  for (const story of stories) {
    try {
      const saved = await download(
        story.story_url,
        "stories",
        story.model_id,
        "",
      );
      if (saved) downloaded++;
    } catch (error) {
      console.warn(
        `⚠️ Failed to download story for model: ${story.model_id}: ${error.message}`,
      );
    }
    printLine();
  }
  console.log(`📦 Done. ${downloaded} / ${stories.length} stories downloaded.`);
}
