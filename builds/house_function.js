/*
 * Example Building Function
 *
 * This file demonstrates how to implement a building function that can be used with
 * the template.js system. It shows the standard structure and common patterns for:
 * - Taking the starting coordinates (startX, startY, startZ)
 * - Using the safe* building functions (safeFill, safeSetBlock)
 * - Organizing the build into logical sections (foundation, walls, roof, etc.)
 *
 * This function is designed to be generated and modified by AI language models,
 * serving as a reference for the expected structure and patterns when creating
 * new building functions programmatically.
 */

async function buildCreation(startX, startY, startZ) {
  // House dimensions
  const width = 15;
  const length = 20;
  const height = 8;
  const wallHeight = 5;

  // Build foundation
  await safeFill(
    startX,
    startY,
    startZ,
    startX + width,
    startY,
    startZ + length,
    "stone_bricks"
  );

  // Build walls
  // Front and back walls
  await safeFill(
    startX,
    startY + 1,
    startZ,
    startX + width,
    startY + wallHeight,
    startZ,
    "oak_planks"
  );
  await safeFill(
    startX,
    startY + 1,
    startZ + length,
    startX + width,
    startY + wallHeight,
    startZ + length,
    "oak_planks"
  );

  // Side walls
  await safeFill(
    startX,
    startY + 1,
    startZ + 1,
    startX,
    startY + wallHeight,
    startZ + length - 1,
    "oak_planks"
  );
  await safeFill(
    startX + width,
    startY + 1,
    startZ + 1,
    startX + width,
    startY + wallHeight,
    startZ + length - 1,
    "oak_planks"
  );

  // Build roof
  for (let i = 0; i <= Math.floor(width / 2); i++) {
    await safeFill(
      startX + i,
      startY + wallHeight + i,
      startZ - 1,
      startX + i,
      startY + wallHeight + i,
      startZ + length + 1,
      "dark_oak_stairs",
      { blockStates: { facing: "east" } }
    );
    await safeFill(
      startX + width - i,
      startY + wallHeight + i,
      startZ - 1,
      startX + width - i,
      startY + wallHeight + i,
      startZ + length + 1,
      "dark_oak_stairs",
      { blockStates: { facing: "west" } }
    );
  }

  // Add windows
  const windowPositions = [
    { x: startX, z: startZ + 5 },
    { x: startX, z: startZ + length - 5 },
    { x: startX + width, z: startZ + 5 },
    { x: startX + width, z: startZ + length - 5 },
  ];

  for (const pos of windowPositions) {
    await safeFill(
      pos.x,
      startY + 2,
      pos.z,
      pos.x,
      startY + 3,
      pos.z + 2,
      "glass_pane"
    );
  }

  // Add door
  await safeSetBlock(
    startX + Math.floor(width / 2),
    startY + 1,
    startZ,
    "oak_door",
    { blockStates: { facing: "south", half: "lower" } }
  );
  await safeSetBlock(
    startX + Math.floor(width / 2),
    startY + 2,
    startZ,
    "oak_door",
    { blockStates: { facing: "south", half: "upper" } }
  );

  // Add some interior features
  // Bed
  await safeSetBlock(startX + 2, startY + 1, startZ + length - 2, "red_bed", {
    blockStates: { facing: "south", part: "head" },
  });
  await safeSetBlock(startX + 2, startY + 1, startZ + length - 3, "red_bed", {
    blockStates: { facing: "south", part: "foot" },
  });

  // Crafting table
  await safeSetBlock(
    startX + width - 2,
    startY + 1,
    startZ + 2,
    "crafting_table"
  );

  // Furnace
  await safeSetBlock(startX + width - 2, startY + 1, startZ + 3, "furnace", {
    blockStates: { facing: "west" },
  });

  // Add some lighting
  for (let x = 3; x < width; x += 4) {
    for (let z = 3; z < length; z += 4) {
      await safeSetBlock(
        startX + x,
        startY + wallHeight - 1,
        startZ + z,
        "lantern",
        { blockStates: { hanging: "true" } }
      );
    }
  }
}
