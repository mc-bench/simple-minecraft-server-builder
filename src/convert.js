import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import struct2schem from "struct2schem";

// Note - this script will not work with bun, use node instead

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STRUCTURES_PATH = path.join(
  __dirname,
  "../data/world/generated/minecraft/structures"
);
const SCHEMATICS_PATH = path.join(__dirname, "../schematics");

async function convertStructures() {
  try {
    console.log("Reading structure files...");

    await fs.mkdir(SCHEMATICS_PATH, { recursive: true });

    const files = await fs.readdir(STRUCTURES_PATH);
    const nbtFiles = files.filter((file) => file.endsWith(".nbt"));

    console.log(`Found ${nbtFiles.length} NBT files to process...`);

    for (const filename of nbtFiles) {
      try {
        console.log(`Converting ${filename}...`);

        const structureData = await fs.readFile(
          path.join(STRUCTURES_PATH, filename)
        );
        const schematicData = await struct2schem.default(structureData);
        const outputName = filename.replace(".nbt", ".schem");
        const outputPath = path.join(SCHEMATICS_PATH, outputName);
        await fs.writeFile(outputPath, schematicData);

        console.log(`Successfully converted ${filename} to ${outputName}`);
      } catch (error) {
        console.error(`Error converting ${filename}:`, error);
        continue;
      }
    }

    console.log("Conversion process completed!");
  } catch (error) {
    console.error("Error during conversion process:", error);
  }
}

convertStructures();
