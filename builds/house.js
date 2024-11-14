const mineflayer = require("mineflayer");
const { promisify } = require("util");

const sleep = promisify(setTimeout);

const DELAY = process.env.DELAY ? parseInt(process.env.DELAY) : 50;
const STRUCTURE_NAME = process.env.STRUCTURE_NAME || "my_house";

/**
 * Fills a region with blocks in Minecraft Java 1.20.4
 * @param {number} x1 - First corner X coordinate
 * @param {number} y1 - First corner Y coordinate
 * @param {number} z1 - First corner Z coordinate
 * @param {number} x2 - Second corner X coordinate
 * @param {number} y2 - Second corner Y coordinate
 * @param {number} z2 - Second corner Z coordinate
 * @param {string} blockType - The block type to fill with
 * @param {Object} [options] - Additional options for fill operation
 */
async function safeFill(x1, y1, z1, x2, y2, z2, blockType, options = {}) {
  const { mode, blockStates, replaceFilter, replaceFilterStates } = options;
  let command = `/fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${blockType}`;

  if (mode) command += ` ${mode}`;
  if (blockStates) {
    const stateStr = Object.entries(blockStates)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    command += `[${stateStr}]`;
  }
  if (replaceFilter) {
    command += ` ${replaceFilter}`;
    if (replaceFilterStates) {
      const filterStateStr = Object.entries(replaceFilterStates)
        .map(([k, v]) => `${k}=${v}`)
        .join(",");
      command += `[${filterStateStr}]`;
    }
  }

  bot.chat(command);
  await sleep(DELAY);
}

/**
 * Places a block at specified coordinates
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @param {string} blockType - The block type to place
 * @param {Object} [options] - Additional options for block placement
 */
async function safeSetBlock(x, y, z, blockType, options = {}) {
  const { blockStates, mode = "replace" } = options;
  let command = `/setblock ${x} ${y} ${z} ${blockType}`;

  if (blockStates) {
    const stateStr = Object.entries(blockStates)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    command += `[${stateStr}]`;
  }
  command += ` ${mode}`;

  bot.chat(command);
  await sleep(DELAY);
}

/**
 * Builds a house structure
 * @param {number} startX - Starting X coordinate
 * @param {number} startY - Starting Y coordinate
 * @param {number} startZ - Starting Z coordinate
 */
async function buildCreation(startX, startY, startZ) {
  // Example: Build a simple house
  // Floor
  await safeFill(
    startX,
    startY,
    startZ,
    startX + 5,
    startY,
    startZ + 5,
    "oak_planks"
  );

  // Walls
  await safeFill(
    startX,
    startY + 1,
    startZ,
    startX + 5,
    startY + 3,
    startZ,
    "oak_planks"
  );
  await safeFill(
    startX,
    startY + 1,
    startZ + 5,
    startX + 5,
    startY + 3,
    startZ + 5,
    "oak_planks"
  );
  await safeFill(
    startX,
    startY + 1,
    startZ,
    startX,
    startY + 3,
    startZ + 5,
    "oak_planks"
  );
  await safeFill(
    startX + 5,
    startY + 1,
    startZ,
    startX + 5,
    startY + 3,
    startZ + 5,
    "oak_planks"
  );

  // Roof
  await safeFill(
    startX,
    startY + 4,
    startZ,
    startX + 5,
    startY + 4,
    startZ + 5,
    "oak_planks"
  );

  // Door
  await safeSetBlock(startX + 2, startY + 1, startZ, "oak_door", {
    blockStates: { half: "lower", facing: "south" },
  });
  await safeSetBlock(startX + 2, startY + 2, startZ, "oak_door", {
    blockStates: { half: "upper", facing: "south" },
  });
}

// Create bot instance
const bot = mineflayer.createBot({
  host: "localhost",
  port: 25565,
  username: "Builder",
});

// Handle bot spawn
bot.once("spawn", async () => {
  try {
    // Wait a bit after spawn
    await sleep(1000);

    // Build at spawn location, but at y=-21 for superflat
    await buildCreation(0, -21, 0);

    // Save the structure (adjusted coordinates for new height)
    bot.chat(`/structure save ${STRUCTURE_NAME} 0 -21 0 5 -17 5`);
    await sleep(1000);

    // Disconnect the bot
    bot.quit();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    bot.quit();
    process.exit(1);
  }
});

// Handle errors
bot.on("error", (err) => {
  console.error("Bot error:", err);
  process.exit(1);
});
