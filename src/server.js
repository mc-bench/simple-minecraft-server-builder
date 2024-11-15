import express from "express";
import { parse } from "prismarine-nbt";
import { promises as fs } from "fs";
import { join } from "path";
const app = express();
const port = 3005;

app.get("/structure", async (req, res) => {
  try {
    const structuresPath = join(
      __dirname,
      "../data/world/generated/minecraft/structures"
    );

    // Get all .nbt files from the directory
    const files = await fs.readdir(structuresPath);
    const nbtFiles = files.filter((file) => file.endsWith(".nbt"));
    console.log(`Found ${nbtFiles.length} NBT files to process...`);

    // Parse all NBT files
    const structures = await Promise.all(
      nbtFiles.map(async (filename) => {
        const nbtData = await fs.readFile(join(structuresPath, filename));
        const { parsed } = await parse(nbtData);
        console.log(`Processed: ${filename}`);
        return {
          name: filename,
          data: parsed,
        };
      })
    );

    console.log(`Successfully processed ${structures.length} NBT files`);
    res.json(structures);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
