const mineflayer = require('mineflayer')
const { Vec3 } = require('vec3')
const { Buffer } = require('buffer')

// Environment variables with defaults
const HOST = process.env.HOST || '127.0.0.1'
const PORT = parseInt(process.env.PORT) || 25565
const VERSION = process.env.VERSION || '1.20.4'
const USERNAME = process.env.USERNAME || 'builder'
const DELAY = parseInt(process.env.DELAY) || 250
const STRUCTURE_NAME = process.env.STRUCTURE_NAME || `structure_${new Date().toISOString().replace(/[:.]/g, '-')}`

// Replace this from prompt response
async function buildCreation(startX, startY, startZ){

}

// Coordinate tracking system
class CoordinateTracker {
  constructor() {
    this.coordinates = []
    this.boundingBox = null
  }

  addCoordinate(x, y, z) {
    this.coordinates.push({ x, y, z })
    this.updateBoundingBox()
  }

  updateBoundingBox() {
    if (this.coordinates.length === 0) return

    const xs = this.coordinates.map(c => c.x)
    const ys = this.coordinates.map(c => c.y)
    const zs = this.coordinates.map(c => c.z)

    this.boundingBox = {
      min: {
        x: Math.min(...xs),
        y: Math.min(...ys),
        z: Math.min(...zs)
      },
      max: {
        x: Math.max(...xs),
        y: Math.max(...ys),
        z: Math.max(...zs)
      }
    }
  }

  getBoundingBox() {
    return this.boundingBox
  }

  getDimensions() {
    if (!this.boundingBox) return null
    return {
      width: this.boundingBox.max.x - this.boundingBox.min.x + 1,
      height: this.boundingBox.max.y - this.boundingBox.min.y + 1,
      depth: this.boundingBox.max.z - this.boundingBox.min.z + 1
    }
  }
}

// Command queue system
class CommandQueue {
  constructor(delay = DELAY) {
    this.queue = []
    this.isProcessing = false
    this.DELAY = delay
  }

  async add(command) {
    return new Promise((resolve, reject) => {
      this.queue.push({ command, resolve, reject })
      if (!this.isProcessing) {
        this.processQueue()
      }
    })
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return

    this.isProcessing = true

    while (this.queue.length > 0) {
      const { command, resolve, reject } = this.queue.shift()

      try {
        await bot.chat(command)
        resolve()
      } catch (err) {
        reject(err)
      }

      await new Promise(resolve => setTimeout(resolve, this.DELAY))
    }

    this.isProcessing = false
  }
}

async function placeStructureBlock(name) {
    const boundingBox = coordinateTracker.getBoundingBox();
    const dimensions = coordinateTracker.getDimensions();

    if (!boundingBox || !dimensions) {
        console.error('No blocks placed yet to create structure');
        return;
    }

    // Calculate position for structure block - 2 blocks away from min X and Z
    const structureBlockPos = {
        x: boundingBox.min.x - 2,
        y: boundingBox.min.y,
        z: boundingBox.min.z - 2
    };

    // Calculate bot position - 1 block away from structure block
    const botPos = {
        x: structureBlockPos.x - 1,
        y: structureBlockPos.y,
        z: structureBlockPos.z
    };

    // Calculate relative offset from structure block to structure
    const offset = {
        x: boundingBox.min.x - structureBlockPos.x,
        y: boundingBox.min.y - structureBlockPos.y,
        z: boundingBox.min.z - structureBlockPos.z
    };

    // Clear space around structure block (3x3x3 area)
    await safeFill(
        structureBlockPos.x - 1,
        structureBlockPos.y - 1,
        structureBlockPos.z - 1,
        structureBlockPos.x + 1,
        structureBlockPos.y + 1,
        structureBlockPos.z + 1,
        'air'
    );

    // Place structure block
    await commandQueue.add(`/setblock ${structureBlockPos.x} ${structureBlockPos.y} ${structureBlockPos.z} structure_block`);

    // Configure structure block
    const nbtData = {
        mode: '"SAVE"',
        name: `"${name}"`,
        posX: offset.x,
        posY: offset.y,
        posZ: offset.z,
        sizeX: dimensions.width,
        sizeY: dimensions.height,
        sizeZ: dimensions.depth,
        rotation: '"NONE"',
        mirror: '"NONE"',
        ignoreEntities: 0,
        powered: 0,
        seed: 0,
        author: `"${bot.username}"`,
        metadata: '""',
        showair: 0,
        showboundingbox: 1
    };

    // Convert NBT data to command format
    const nbtString = Object.entries(nbtData)
        .map(([key, value]) => `${key}:${value}`)
        .join(',');

    // Update structure block data
    await commandQueue.add(
        `/data merge block ${structureBlockPos.x} ${structureBlockPos.y} ${structureBlockPos.z} {${nbtString}}`
    );

    // Teleport bot to position
    await commandQueue.add(
        `/tp ${bot.username} ${botPos.x} ${botPos.y} ${botPos.z} -90 0`
    );

    // Return all necessary data for packet sending
    return {
        structureBlockPos,
        botPos,
        offset,
        dimensions,
        name
    };
}

async function sendSaveStructurePacket(saveStructureData) {
    try {
        if (!saveStructureData || !saveStructureData.structureBlockPos) {
            throw new Error('Invalid structure block data');
        }

        const { structureBlockPos, name, dimensions, offset } = saveStructureData;
        const structureName = name.includes(':') ? name : `minecraft:${name}`;
        const nameBuffer = Buffer.from(structureName);

        // Create exact-sized packet: 1 (id) + 8 (pos) + 2 (action) + 1 (name length) +
        // nameLength + 3 (offset) + 3 (size) + 3 (flags) + 4 (integrity) + 2 (final flags)
        const packet = Buffer.alloc(27 + nameBuffer.length);
        let ptr = 0;

        packet.writeUInt8(0x31, ptr++);

        const x = structureBlockPos.x & 0x3FFFFFF;
        const y = structureBlockPos.y & 0xFFF;
        const z = structureBlockPos.z & 0x3FFFFFF;
        const position = ((BigInt(x) << 38n) | (BigInt(z) << 12n) | BigInt(y));

        for (let i = 7; i >= 0; i--) {
            packet.writeUInt8(Number((position >> (BigInt(i) * 8n)) & 0xFFn), ptr++);
        }

        packet.writeUInt8(0x01, ptr++);
        packet.writeUInt8(0x00, ptr++);

        packet.writeUInt8(nameBuffer.length, ptr++);
        nameBuffer.copy(packet, ptr);
        ptr += nameBuffer.length;

        packet.writeUInt8(offset.x & 0xFF, ptr++);
        packet.writeUInt8(offset.y & 0xFF, ptr++);
        packet.writeUInt8(offset.z & 0xFF, ptr++);

        packet.writeUInt8(dimensions.width & 0xFF, ptr++);
        packet.writeUInt8(dimensions.height & 0xFF, ptr++);
        packet.writeUInt8(dimensions.depth & 0xFF, ptr++);

        packet.writeUInt8(0x00, ptr++);
        packet.writeUInt8(0x00, ptr++);
        packet.writeUInt8(0x00, ptr++);

        packet.writeFloatBE(1.0, ptr);
        ptr += 4;

        packet.writeUInt8(0x00, ptr++);
        packet.writeUInt8(0x04, ptr++);

        bot._client.writeRaw(packet);
        await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
        console.error('Error sending save packet:', error);
        throw error;
    }
}

/**
 * Places a block at specified coordinates for Minecraft Java 1.20.4
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} z - Z coordinate
 * @param {string} blockType - The block type to place (e.g. "stone", "oak_planks")
 * @param {Object} [options] - Additional options for block placement
 * @param {Object} [options.blockStates] - Block states as key-value pairs (e.g. { facing: "north", half: "top" })
 * @param {string} [options.mode="replace"] - Block placement mode: "replace", "destroy", or "keep"
 * @returns {Promise<void>}
 */
async function safeSetBlock(x, y, z, blockType, options = {}) {
    // Ensure coordinates are integers
    x = Math.floor(x)
    y = Math.floor(y)
    z = Math.floor(z)

    try {
        // Add minecraft: namespace if not present
        const fullBlockType = blockType.includes(':') ? blockType : `minecraft:${blockType}`
        let command = `/setblock ${x} ${y} ${z} ${fullBlockType}`

        // Add block states if provided
        if (options.blockStates && Object.keys(options.blockStates).length > 0) {
            const stateString = Object.entries(options.blockStates)
                .map(([key, value]) => `${key}:${value}`)
                .join(',')
            command += `{${stateString}}`
        }

        // Add placement mode if provided
        if (options.mode) {
            const validModes = ['replace', 'destroy', 'keep']
            if (!validModes.includes(options.mode)) {
                throw new Error(`Invalid placement mode: ${options.mode}. Must be one of: ${validModes.join(', ')}`)
            }
            command += ` ${options.mode}`
        }

        await commandQueue.add(command)
        coordinateTracker.addCoordinate(x, y, z)
    } catch (err) {
        console.error(`Error placing block at ${x} ${y} ${z}: ${err.message}`)
        throw err
    }
}

/**
 * Fills a region with blocks in Minecraft Java 1.20.4
 * @param {number} x1 - First corner X coordinate
 * @param {number} y1 - First corner Y coordinate
 * @param {number} z1 - First corner Z coordinate
 * @param {number} x2 - Second corner X coordinate
 * @param {number} y2 - Second corner Y coordinate
 * @param {number} z2 - Second corner Z coordinate
 * @param {string} blockType - The block type to fill with (e.g. "stone", "oak_planks")
 * @param {Object} [options] - Additional options for fill operation
 * @param {string} [options.mode] - Fill mode: "destroy", "hollow", "keep", "outline", "replace"
 * @param {Object} [options.blockStates] - Block states as key-value pairs (e.g. { facing: "north" })
 * @param {string} [options.replaceFilter] - Block to replace when using "replace" mode
 * @param {Object} [options.replaceFilterStates] - Block states for replace filter
 * @returns {Promise<void>}
 */
async function safeFill(x1, y1, z1, x2, y2, z2, blockType, options = {}) {
    // Ensure coordinates are integers
    x1 = Math.floor(x1)
    y1 = Math.floor(y1)
    z1 = Math.floor(z1)
    x2 = Math.floor(x2)
    y2 = Math.floor(y2)
    z2 = Math.floor(z2)

    try {
        // Add minecraft: namespace if not present
        const fullBlockType = blockType.includes(':') ? blockType : `minecraft:${blockType}`
        let command = `/fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${fullBlockType}`

        // Add block states if provided
        if (options.blockStates && Object.keys(options.blockStates).length > 0) {
            const stateString = Object.entries(options.blockStates)
                .map(([key, value]) => `${key}:${value}`)
                .join(',')
            command += `{${stateString}}`
        }

        // Handle fill modes and replace filter
        if (options.mode) {
            const validModes = ['destroy', 'hollow', 'keep', 'outline', 'replace']
            if (!validModes.includes(options.mode)) {
                throw new Error(`Invalid fill mode: ${options.mode}. Must be one of: ${validModes.join(', ')}`)
            }

            command += ` ${options.mode}`

            // Handle replace filter if specified
            if (options.mode === 'replace' && options.replaceFilter) {
                const fullReplaceFilter = options.replaceFilter.includes(':') ?
                    options.replaceFilter : `minecraft:${options.replaceFilter}`
                command += ` ${fullReplaceFilter}`

                // Add replace filter block states if provided
                if (options.replaceFilterStates && Object.keys(options.replaceFilterStates).length > 0) {
                    const filterStateString = Object.entries(options.replaceFilterStates)
                        .map(([key, value]) => `${key}:${value}`)
                        .join(',')
                    command += `{${filterStateString}}`
                }
            }
        }

        await commandQueue.add(command)

        // Track corners of the filled region
        // Note: This is a simplified tracking. Consider if you need to track all blocks in the region
        for (let x of [x1, x2]) {
            for (let y of [y1, y2]) {
                for (let z of [z1, z2]) {
                    coordinateTracker.addCoordinate(x, y, z)
                }
            }
        }
    } catch (err) {
        console.error(`Error filling from (${x1},${y1},${z1}) to (${x2},${y2},${z2}): ${err.message}`)
        throw err
    }
}

const bot = mineflayer.createBot({
  host: HOST,
  port: PORT,
  version: VERSION,
  username: USERNAME,
})

const commandQueue = new CommandQueue()
const coordinateTracker = new CoordinateTracker()

// Update the spawn handler
bot.once('spawn', async () => {
    try {
        const startPos = bot.entity.position.offset(0, -1, 0);

        await buildCreation(
            Math.floor(startPos.x),
            Math.floor(startPos.y),
            Math.floor(startPos.z)
        );

        const structureBlockData = await placeStructureBlock(STRUCTURE_NAME);
        await sendSaveStructurePacket(structureBlockData);

        // Wait a bit before exiting to ensure packet is processed
        console.log('Waiting for packet to be processed...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        // console.log('Done! Exiting...');
        // process.exit(0);
    } catch (error) {
        console.error('Error in spawn handler:', error);
        process.exit(1);
    }
});

bot.on('error', (err) => {
  console.error('Bot error:', err)
})

bot.on('kicked', (reason) => {
  console.error('Bot was kicked:', reason)
})