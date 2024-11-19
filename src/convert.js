import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import struct2schem from "struct2schem";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STRUCTURES_PATH = join(
  __dirname,
  "../data/world/generated/minecraft/structures"
);
const SCHEMATICS_PATH = join(__dirname, "../schematics");

async function convertStructures() {
  try {
    console.log("Reading structure files...");

    await mkdir(SCHEMATICS_PATH, { recursive: true });

    const files = await readdir(STRUCTURES_PATH);
    const nbtFiles = files.filter((file) => file.endsWith(".nbt"));

    console.log(`Found ${nbtFiles.length} NBT files to process...`);

    for (const filename of nbtFiles) {
      try {
        console.log(`Converting ${filename}...`);

        const structureData = await readFile(join(STRUCTURES_PATH, filename));
        const schematicData = await struct2schem.default(structureData);
        const outputName = filename.replace(".nbt", ".schem");
        const outputPath = join(SCHEMATICS_PATH, outputName);
        await writeFile(outputPath, schematicData);

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
