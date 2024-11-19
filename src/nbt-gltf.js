import * as THREE from 'three'
import { createCanvas, ImageData } from 'canvas'
import { loadImage } from 'node-canvas-webgl/lib/index.js'
import gl from 'gl'
import { promises as fs } from 'fs'
import { Vec3 } from 'vec3'
import prismarineViewer from 'prismarine-viewer'
import { parse, simplify } from 'prismarine-nbt'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import prismarineBlock from 'prismarine-block'
import mcAssets from 'minecraft-assets'
import path from 'path'
import { fileURLToPath } from 'url'
import { Blob, FileReader } from 'vblob'
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

// Polyfills for GLTF export and canvas
global.Blob = Blob
global.FileReader = FileReader
global.ImageData = ImageData
global.Image = loadImage
global.performance = { now: () => Date.now() }

const { viewer: PrismarineViewer } = prismarineViewer
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const VERSION = '1.20.1'
const VIEWPORT = {
  width: 1024,
  height: 1024,
  viewDistance: 8,
  center: new Vec3(0, 0, 0),
}

// Mock implementations
const createMockCanvas = (width, height) => {
  const canvas = createCanvas(width, height)
  canvas.addEventListener = () => {}
  canvas.removeEventListener = () => {}
  canvas.clientWidth = width
  canvas.clientHeight = height
  canvas.setAttribute = () => {}
  canvas.getAttribute = () => null
  canvas.style = { width: `${width}px`, height: `${height}px` }
  canvas.getBoundingClientRect = () => ({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height
  })
  canvas.parentElement = {
    appendChild: () => {},
    removeChild: () => {},
    style: {}
  }
  canvas.ownerDocument = {
    defaultView: {
      innerWidth: width,
      innerHeight: height,
      devicePixelRatio: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
      navigator: { userAgent: 'node' },
      getComputedStyle: () => ({
        getPropertyValue: () => ''
      }),
      requestAnimationFrame: (callback) => setTimeout(callback, 16),
      cancelAnimationFrame: (id) => clearTimeout(id),
      location: { href: '' }
    }
  }
  
  // Add WebGL context methods
  const context = canvas.getContext('webgl2')
  canvas.getContext = (type) => {
    if (type === 'webgl2' || type === 'webgl') {
      return context
    }
    return null
  }
  
  return canvas
}

class EnhancedMockWorker {
  constructor(scene, mcData) {
    this.scene = scene
    this.mcData = mcData
    this.meshes = new Map()
    this.atlas = null
    this.uvMapping = {}
    
    // Remove bind and directly define postMessage
    this.postMessage = (data) => {
      this.handleMessage(data)
    }
  }

  handleMessage(data) {
    if (data.type === 'add_mesh') {
      this.addMesh(data)
    }
  }

  setAtlas(atlas, uvMapping = {}) {
    this.atlas = atlas
    this.uvMapping = uvMapping
  }

  getBlockState(blockId) {
    const block = this.mcData.blocks[blockId]
    if (!block) return null

    const blockState = this.mcData.blockStates[blockId]
    if (!blockState) {
      return {
        name: block.name,
        variants: {
          "normal": {
            model: {
              textures: {
                all: `block/${block.name}`
              }
            }
          }
        }
      }
    }
    return blockState
  }

  createMaterial(blockId) {
    const blockState = this.getBlockState(blockId)
    if (!blockState || !this.atlas) {
      console.warn(`No block state or atlas for block ${blockId}`)
      return new THREE.MeshStandardMaterial({ color: 0x808080 })
    }

    // Get the block name and textures
    const block = this.mcData.blocks[blockId]
    if (!block) {
      console.warn(`No block data for id ${blockId}`)
      return new THREE.MeshStandardMaterial({ color: 0x808080 })
    }

    // Special case texture mappings
    const textureMapping = {
      // Wood variants
      'oak_stairs': 'oak_planks',
      'dark_oak_stairs': 'dark_oak_planks',
      'birch_stairs': 'birch_planks',
      'spruce_stairs': 'spruce_planks',
      'jungle_stairs': 'jungle_planks',
      'acacia_stairs': 'acacia_planks',
      
      // Grass and dirt
      'grass_block': ['grass_block_side', 'grass_block_top', 'dirt'],
      'dirt_path': ['dirt_path_side', 'dirt_path_top'],
      
      // Beds
      'red_bed': ['red_bed_head_side', 'red_bed_head_top'],
      'black_bed': ['black_bed_head_side', 'black_bed_head_top'],
      'blue_bed': ['blue_bed_head_side', 'blue_bed_head_top'],
      'brown_bed': ['brown_bed_head_side', 'brown_bed_head_top'],
      'cyan_bed': ['cyan_bed_head_side', 'cyan_bed_head_top'],
      'gray_bed': ['gray_bed_head_side', 'gray_bed_head_top'],
      'green_bed': ['green_bed_head_side', 'green_bed_head_top'],
      'light_blue_bed': ['light_blue_bed_head_side', 'light_blue_bed_head_top'],
      'light_gray_bed': ['light_gray_bed_head_side', 'light_gray_bed_head_top'],
      'lime_bed': ['lime_bed_head_side', 'lime_bed_head_top'],
      'magenta_bed': ['magenta_bed_head_side', 'magenta_bed_head_top'],
      'orange_bed': ['orange_bed_head_side', 'orange_bed_head_top'],
      'pink_bed': ['pink_bed_head_side', 'pink_bed_head_top'],
      'purple_bed': ['purple_bed_head_side', 'purple_bed_head_top'],
      'white_bed': ['white_bed_head_side', 'white_bed_head_top'],
      'yellow_bed': ['yellow_bed_head_side', 'yellow_bed_head_top'],

      // Stone variants
      'stone_stairs': 'stone',
      'cobblestone_stairs': 'cobblestone',
      'mossy_cobblestone_stairs': 'mossy_cobblestone',
      'stone_brick_stairs': 'stone_bricks',
      'mossy_stone_brick_stairs': 'mossy_stone_bricks',
      
      // Other materials
      'sandstone_stairs': ['sandstone_top', 'sandstone_side'],
      'smooth_sandstone_stairs': 'sandstone_top',
      'brick_stairs': 'bricks',
      'nether_brick_stairs': 'nether_bricks',
      'quartz_stairs': ['quartz_block_top', 'quartz_block_side'],
      'prismarine_stairs': 'prismarine',
      'prismarine_brick_stairs': 'prismarine_bricks'
    }

    // Get all possible texture names for this block
    let possibleTextures = textureMapping[block.name] || [block.name];
    if (!Array.isArray(possibleTextures)) {
      possibleTextures = [possibleTextures];
    }

    // Try to find a valid texture from the possible options
    let uvs = null;
    let usedTexture = null;

    for (const textureName of possibleTextures) {
      // Try different variations of the texture name
      const variations = [
        textureName,
        `${textureName}_side`,
        `${textureName}_top`,
        `${textureName}_bottom`,
        textureName.replace('block_', '')  // Try without 'block_' prefix
      ];

      for (const variant of variations) {
        if (this.uvMapping[variant]) {
          uvs = this.uvMapping[variant];
          usedTexture = variant;
          break;
        }
      }

      if (uvs) break;
    }

    console.log(`Looking for texture: ${block.name}`, {
      blockName: block.name,
      possibleTextures,
      foundTexture: usedTexture,
      hasMapping: !!uvs,
      availableMappings: Object.keys(this.uvMapping).slice(0, 5)
    });

    if (!uvs) {
      console.warn(`No UV mapping found for ${block.name} with textures:`, possibleTextures);
      return new THREE.MeshStandardMaterial({ color: 0xcccccc });
    }

    // Create material with texture
    const material = new THREE.MeshStandardMaterial({
      map: this.atlas.clone(),
      roughness: 1.0,
      metalness: 0.0,
      transparent: false,
      side: THREE.FrontSide
    });

    material.map.repeat.set(uvs.width, uvs.height);
    material.map.offset.set(uvs.x, uvs.y);
    material.map.needsUpdate = true;

    console.log(`Created material for ${block.name}`, {
      usedTexture,
      hasTexture: !!material.map,
      uvs: uvs
    });

    return material;
}

addMesh(data) {
    const { x, z, blocks } = data
    
    // Group blocks by type for batch processing
    const blocksByType = new Map()
    for (const block of blocks) {
      if (!block || !block.position || block.type === 0) continue
      
      if (!blocksByType.has(block.type)) {
        blocksByType.set(block.type, [])
      }
      blocksByType.get(block.type).push(block)
    }

    // Process each block type
    for (const [blockType, typeBlocks] of blocksByType) {
      const blockName = this.mcData.blocks[blockType]?.name
      if (!blockName) continue

      console.log(`Creating mesh for block type: ${blockName}`)

      // Create geometry with proper face orientation
      const geometry = new THREE.BoxGeometry(1, 1, 1)
      
      const material = this.createMaterial(blockType)

      // Create instanced mesh for better performance
      const instancedMesh = new THREE.InstancedMesh(
        geometry,
        material,
        typeBlocks.length
      )

      // Set positions for each instance
      const matrix = new THREE.Matrix4()
      typeBlocks.forEach((block, index) => {
        matrix.setPosition(
          x * 16 + block.position[0],
          block.position[1],
          z * 16 + block.position[2]
        )
        instancedMesh.setMatrixAt(index, matrix)
      })

      instancedMesh.castShadow = true
      instancedMesh.receiveShadow = true
      
      // Store the mesh for cleanup
      const meshId = `${x},${z},${blockType}`
      if (this.meshes.has(meshId)) {
        const oldMesh = this.meshes.get(meshId)
        this.scene.remove(oldMesh)
        oldMesh.geometry.dispose()
        oldMesh.material.dispose()
      }
      
      this.meshes.set(meshId, instancedMesh)
      this.scene.add(instancedMesh)
    }
  }
}

// Setup global environment
const setupGlobalEnv = () => {
  global.Worker = EnhancedMockWorker
  global.THREE = THREE
  
  // Basic window mock
  global.window = {
    innerWidth: VIEWPORT.width,
    innerHeight: VIEWPORT.height,
    devicePixelRatio: 1
  }
  
  // Basic document mock for canvas
  global.document = {
    createElement: (type) => {
      if (type === 'canvas') return createCanvas(VIEWPORT.width, VIEWPORT.height)
      throw new Error(`Cannot create node ${type}`)
    }
  }
}

// Enhanced world view implementation
class EnhancedWorldView {
  constructor(world, viewDistance, center, scene, mcData) {
    this.world = world
    this.viewDistance = viewDistance
    this.center = center
    this.scene = scene
    this.mcData = mcData
    this.worker = new EnhancedMockWorker(scene, mcData)
    this.isStarted = false
  }

  async init(pos) {
    this.center = pos
    return true
  }

  updatePosition(pos) {
    this.center = pos
  }

  async generateMeshes() {
    const promises = []
    try {
      const blocks = []
      const scanRange = 32
      
      for (let x = -scanRange; x <= scanRange; x++) {
        for (let y = 0; y < 256; y++) {
          for (let z = -scanRange; z <= scanRange; z++) {
            const worldX = this.center.x + x
            const worldY = y
            const worldZ = this.center.z + z
            
            try {
              const block = await this.world.getBlock(new Vec3(worldX, worldY, worldZ))
              if (block && block.type !== 0) {
                const localChunkX = Math.floor(worldX / 16)
                const localChunkZ = Math.floor(worldZ / 16)
                const localX = worldX - (localChunkX * 16)
                const localZ = worldZ - (localChunkZ * 16)
                
                blocks.push({
                  chunkX: localChunkX,
                  chunkZ: localChunkZ,
                  type: block.type,
                  position: [parseInt(localX), parseInt(worldY), parseInt(localZ)]
                })
              }
            } catch (e) {
              continue
            }
          }
        }
      }

      // Group blocks by chunk
      const chunkBlocks = new Map()
      for (const block of blocks) {
        const key = `${block.chunkX},${block.chunkZ}`
        if (!chunkBlocks.has(key)) {
          chunkBlocks.set(key, [])
        }
        chunkBlocks.get(key).push(block)
      }

      // Create meshes for each chunk
      for (const [key, chunkBlockList] of chunkBlocks) {
        const [chunkX, chunkZ] = key.split(',').map(Number)
        
        promises.push(
          new Promise((resolve) => {
            this.worker.postMessage({
              type: 'add_mesh',
              x: chunkX,
              z: chunkZ,
              blocks: chunkBlockList
            })
            resolve()
          })
        )
      }

    } catch (e) {
      console.warn(`Failed to process chunks:`, e)
    }
    
    await Promise.all(promises)
    return promises.length
  }
}

// Initialize renderer
const initRenderer = () => {
  const canvas = createMockCanvas(VIEWPORT.width, VIEWPORT.height)
  const glContext = gl(VIEWPORT.width, VIEWPORT.height, {
    preserveDrawingBuffer: true,
    antialias: true,
  })

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: glContext,
    antialias: true,
    preserveDrawingBuffer: true,
  })

  renderer.setSize(VIEWPORT.width, VIEWPORT.height)
  renderer.setPixelRatio(1)
  renderer.shadowMap.enabled = true
  renderer.outputColorSpace = THREE.SRGBColorSpace
  return renderer
}

// Setup scene
const setupScene = (viewer, size) => {
  viewer.scene.background = new THREE.Color('#87CEEB')
  
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  viewer.scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(size.x, size.y * 1.5, size.z)
  directionalLight.castShadow = true
  
  directionalLight.shadow.mapSize.width = 2048
  directionalLight.shadow.mapSize.height = 2048
  directionalLight.shadow.camera.near = 0.1
  directionalLight.shadow.camera.far = 500
  
  viewer.scene.add(directionalLight)

  const maxDimension = Math.max(size.x, size.y, size.z)
  const cameraDistance = maxDimension * 2
  viewer.camera.position.set(
    size.x / 2 + cameraDistance,
    size.y / 2 + cameraDistance / 2,
    size.z / 2 + cameraDistance
  )
  viewer.camera.lookAt(size.x / 2, size.y / 2, size.z / 2)

  return viewer
}

// Export GLTF
const exportGLTF = (scene, fileName) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('GLTF export timed out after 30 seconds'))
    }, 30000)

    try {
      const exporter = new GLTFExporter()
      
      exporter.parse(scene, async (result) => {
        clearTimeout(timeout)
        await fs.mkdir('./gltf_out', { recursive: true })
        await fs.writeFile(
          path.join('./gltf_out', fileName), 
          JSON.stringify(result)
        )
        resolve(fileName)
      }, 
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
      {
        binary: false,
        onlyVisible: true,
        includeCustomExtensions: true
      })
    } catch (error) {
      clearTimeout(timeout)
      reject(error)
    }
  })
}


// Initialize Minecraft modules
const initMinecraftModules = async () => {
  const [worldModule, chunkModule, blockModule, mcDataModule] = await Promise.all([
    import('prismarine-world'),
    import('prismarine-chunk'),
    import('prismarine-block'),
    import('minecraft-data')
  ])

  // Initialize mcData with full schema support
  const mcData = mcDataModule.default(VERSION)
  
  // Load block states from minecraft-data
  const states = {}
  
  // Map each block to its possible states
  for (const blockId in mcData.blocks) {
    const block = mcData.blocks[blockId]
    if (!block) continue

    // Create state entry for each block
    states[block.id] = {
      name: block.name,
      properties: block.variations ? block.variations.reduce((acc, variant) => {
        acc[variant.displayName] = variant.metadata
        return acc
      }, {}) : {},
      variants: {
        "normal": {
          model: {
            textures: {
              all: `block/${block.name}`
            }
          }
        }
      },
      default: "normal"
    }

    // Handle blocks with specific faces
    const faces = ['up', 'down', 'north', 'south', 'east', 'west']
    if (block.transparent) {
      states[block.id].variants.normal.model.textures = faces.reduce((acc, face) => {
        acc[face] = `block/${block.name}`
        return acc
      }, {})
    }
  }

  // Create an enhanced mcData object with block states
  const enhancedMcData = {
    ...mcData,
    blockStates: states
  }

  return {
    World: worldModule.default(VERSION),
    Chunk: chunkModule.default(VERSION),
    Block: blockModule.default(VERSION),
    mcData: enhancedMcData
  }
}

// Process NBT
const processNBT = async (buffer, { World, Chunk, Block, mcData }) => {
  const world = new World(() => {
    const chunk = new Chunk()
    chunk.initialize(() => null)
    return chunk
  })
  
  const { parsed } = await parse(buffer)
  
  const size = {
    x: parsed.value.size.value.value[0],
    y: parsed.value.size.value.value[1],
    z: parsed.value.size.value.value[2],
  }
  
  VIEWPORT.center = new Vec3(
    Math.floor(size.x / 2),
    Math.floor(size.y / 2),
    Math.floor(size.z / 2)
  )

  const palette = parsed.value.palette.value.value.map(block => ({
    type: block.Name.value,
    properties: block.Properties ? simplify(block.Properties) : {},
  }))

  // Group blocks by chunk
  const chunkBlocks = new Map()
  for (const block of parsed.value.blocks.value.value) {
    const { type, properties } = palette[block.state.value]
    if (type === 'minecraft:air') continue

    const blockName = type.split(':')[1]
    const blockRef = mcData.blocksByName[blockName]
    if (!blockRef) continue

    const [x, y, z] = block.pos.value.value
    const chunkX = Math.floor(x / 16)
    const chunkZ = Math.floor(z / 16)
    const chunkKey = `${chunkX},${chunkZ}`
    
    if (!chunkBlocks.has(chunkKey)) {
      chunkBlocks.set(chunkKey, [])
    }
    
    chunkBlocks.get(chunkKey).push({
      position: new Vec3(x, y, z),
      block: Block.fromProperties(blockRef.id, properties, 1)
    })
  }

  // Set blocks chunk by chunk
  for (const [key, blocks] of chunkBlocks) {
    const [chunkX, chunkZ] = key.split(',').map(Number)
    const chunk = new Chunk()
    chunk.initialize(() => null)
    
    for (const { position, block } of blocks) {
      const localX = position.x % 16
      const localZ = position.z % 16
      chunk.setBlock(new Vec3(localX, position.y, localZ), block)
    }
    
    await world.setColumn(chunkX, chunkZ, chunk)
  }

  return { world, size }
}

const createTextureAtlas = async (assets) => {
  console.log('Debug assets:', {
    hasAssets: !!assets,
    directory: assets?.directory,
    textureCount: assets?.textureContent ? Object.keys(assets.textureContent).length : 0
  });

  const ATLAS_SIZE = 2048 // Increased atlas size
  const atlasCanvas = createCanvas(ATLAS_SIZE, ATLAS_SIZE)
  const ctx = atlasCanvas.getContext('2d')
  const textures = {}

  ctx.fillStyle = 'rgba(0,0,0,0)'
  ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE)

  const uvMapping = {}
  let x = 0
  let y = 0

  const size = 16  // texture size
  const rowHeight = size

  try {
    const blocksDir = path.join(assets.directory, 'blocks')
    const textureFiles = await fs.readdir(blocksDir)
    
    for (const file of textureFiles) {
      if (!file.endsWith('.png')) continue
      
      try {
        const textureName = path.basename(file, '.png')
        const imagePath = path.join(blocksDir, file)
        const image = await loadImage(imagePath)

        // Draw the texture to the atlas
        ctx.drawImage(image, x, y, TEXTURE_SIZE, TEXTURE_SIZE)
        
        // Store UV coordinates (normalized 0-1 range)
        uvMapping[textureName] = {
          x: x / ATLAS_SIZE,
          y: y / ATLAS_SIZE,
          width: TEXTURE_SIZE / ATLAS_SIZE,
          height: TEXTURE_SIZE / ATLAS_SIZE
        }

        // Move to next position
        x += TEXTURE_SIZE
        if (x + TEXTURE_SIZE > ATLAS_SIZE) {
          x = 0
          y += TEXTURE_SIZE
        }
      } catch (error) {
        console.warn(`Failed to process texture ${file}:`, error)
      }
    }

    const atlas = new THREE.CanvasTexture(atlasCanvas)
    atlas.magFilter = THREE.NearestFilter
    atlas.minFilter = THREE.NearestFilter
    atlas.generateMipmaps = false
    atlas.userData = { uvMapping }
    atlas.needsUpdate = true

    return atlas
  } catch (error) {
    console.error('Error creating texture atlas:', error)
    throw error
  }
}

const main = async () => {
  try {
    console.log('Setting up environment...')
    setupGlobalEnv()
    
    console.log('Initializing renderer...')
    const renderer = initRenderer()
    
    console.log('Initializing Minecraft modules...')
    const mcModules = await initMinecraftModules()
    console.log('Minecraft modules initialized:', Object.keys(mcModules))
    
    console.log('Creating viewer...')
    const viewer = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(75, VIEWPORT.width / VIEWPORT.height, 0.1, 1000),
      renderer: renderer,
      world: {
        blockStates: mcModules.mcData.blockStates,
        material: new THREE.MeshStandardMaterial({
          roughness: 1.0,
          metalness: 0.0,
          transparent: true,
          alphaTest: 0.1
        })
      },
      setVersion: async (version) => {
        console.log('Setting version:', version)
        return true
      },
      listen: (worldView) => {
        // Add any necessary event listeners here
      }
    }

    console.log('Setting version...')
    if (!await viewer.setVersion(VERSION)) {
      throw new Error('Failed to set version')
    }
    console.log('Version set successfully')

    console.log('Reading NBT file...')
    const buffer = await fs.readFile('./public/my_awesome_house.nbt')
    console.log('NBT file read successfully, size:', buffer.length)

    // Load Minecraft assets
    console.log('Loading Minecraft assets...')
    const assets = mcAssets(VERSION)
    console.log('Assets loaded:', {
      version: VERSION,
      directory: assets?.directory,
      exists: !!assets
    })

    // Inside main function, replace the texture atlas creation section:
    console.log('Creating enhanced texture atlas...')
    const ATLAS_SIZE = 2048

    try {
      const blocksDir = path.join(assets.directory, 'blocks')
      const textureFiles = await fs.readdir(blocksDir)
      console.log(`Found ${textureFiles.length} texture files`)

      // Load first texture to determine size
      const sampleTexturePath = path.join(blocksDir, textureFiles[0])
      const sampleTexture = await loadImage(sampleTexturePath)
      const TEXTURE_SIZE = sampleTexture.width
      console.log(`Detected texture size: ${TEXTURE_SIZE}x${TEXTURE_SIZE}`)

      // Calculate atlas dimensions to fit all textures
      const texturesPerRow = Math.floor(ATLAS_SIZE / TEXTURE_SIZE)
      const textureRows = Math.ceil(textureFiles.length / texturesPerRow)
      const actualAtlasHeight = Math.min(ATLAS_SIZE, textureRows * TEXTURE_SIZE)

      console.log('Atlas dimensions:', {
        width: ATLAS_SIZE,
        height: actualAtlasHeight,
        texturesPerRow,
        totalRows: textureRows
      })

      const atlasCanvas = createCanvas(ATLAS_SIZE, actualAtlasHeight)
      const ctx = atlasCanvas.getContext('2d')
      
      // Clear canvas with transparency
      ctx.clearRect(0, 0, ATLAS_SIZE, actualAtlasHeight)

      const uvMapping = {}
      const blockTextures = {}
      let x = 0
      let y = 0
      let processedCount = 0

      // Process each texture file
      for (const file of textureFiles) {
        if (!file.endsWith('.png')) continue
        
        try {
          const textureName = path.basename(file, '.png')
          const imagePath = path.join(blocksDir, file)
          const image = await loadImage(imagePath)

          // Draw texture
          ctx.drawImage(image, x, y, TEXTURE_SIZE, TEXTURE_SIZE)
          
          // Store UV coordinates (normalized 0-1 coordinates)
          const uvCoords = {
            x: x / ATLAS_SIZE,
            y: y / actualAtlasHeight,
            width: TEXTURE_SIZE / ATLAS_SIZE,
            height: TEXTURE_SIZE / actualAtlasHeight
          }
          
          uvMapping[textureName] = uvCoords
          
          // Map block name to texture coordinates
          const blockName = textureName.split('_')[0]
          if (!blockTextures[blockName]) {
            blockTextures[blockName] = []
          }
          blockTextures[blockName].push({
            name: textureName,
            uvs: uvCoords
          })

          // Move to next position
          x += TEXTURE_SIZE
          if (x + TEXTURE_SIZE > ATLAS_SIZE) {
            x = 0
            y += TEXTURE_SIZE
            if (y + TEXTURE_SIZE > actualAtlasHeight) {
              console.warn('Atlas height exceeded, some textures may be missing')
              break
            }
          }

          processedCount++
          if (processedCount % 100 === 0) {
            console.log(`Processed ${processedCount} textures...`)
          }

        } catch (error) {
          console.warn(`Failed to process texture ${file}:`, error)
          continue
        }
      }

      console.log('Texture processing complete:', {
        processedTextures: processedCount,
        mappedBlocks: Object.keys(blockTextures).length,
        uvMappings: Object.keys(uvMapping).length
      })

      // Create Three.js texture
      const textureAtlas = new THREE.CanvasTexture(atlasCanvas)
      textureAtlas.magFilter = THREE.NearestFilter
      textureAtlas.minFilter = THREE.NearestFilter
      textureAtlas.generateMipmaps = false
      textureAtlas.flipY = false // Important for correct UV mapping
      textureAtlas.needsUpdate = true

      // Store texture information in userData
      textureAtlas.userData = {
        uvMapping,
        textureSize: TEXTURE_SIZE,
        atlasSize: { width: ATLAS_SIZE, height: actualAtlasHeight }
      }

      // Set up viewer world properties
      viewer.world.textureAtlas = textureAtlas
      viewer.world.atlas = textureAtlas  // Add this line
      viewer.world.textureUvMap = uvMapping
      viewer.world.blockType = mcModules.Block
      viewer.world.material.map = textureAtlas
      viewer.world.material.needsUpdate = true
      viewer.world.blockTextures = blockTextures
      viewer.world.textures = blockTextures

      console.log('Debug: Atlas creation:', {
        atlasWidth: atlasCanvas.width,
        atlasHeight: atlasCanvas.height,
        textureSize: TEXTURE_SIZE,
        mappingsCount: Object.keys(uvMapping).length,
        hasAtlas: !!textureAtlas,
        textureValid: !!textureAtlas?.image
      })

      console.log('Debug: World state:', {
        version: VERSION,
        hasBlockStates: !!viewer.world.blockStates,
        hasTextures: !!viewer.world.textures,
        hasTextureAtlas: !!viewer.world.textureAtlas,
        textureCount: Object.keys(uvMapping).length,
        blockStatesCount: Object.keys(viewer.world.blockStates || {}).length,
        blockTexturesCount: Object.keys(blockTextures).length,
        atlasSize: ATLAS_SIZE,
        textureSize: TEXTURE_SIZE
      })

      console.log('Processing NBT data...')
      const { world, size } = await processNBT(buffer, mcModules)
      console.log('NBT data processed. Structure size:', size)
      
      const center = new Vec3(
        Math.floor(size.x / 2),
        Math.floor(size.y / 2),
        Math.floor(size.z / 2)
      )
      console.log('Center calculated:', center)
      
      console.log('Setting up scene...')
      setupScene(viewer, size)
      
      console.log('Setting up world view...')
      const worldView = new EnhancedWorldView(
        world,
        VIEWPORT.viewDistance,
        center,
        viewer.scene,
        mcModules.mcData
      )

      worldView.worker.setAtlas(textureAtlas, uvMapping)

      await worldView.init(center)
      viewer.listen(worldView)
      
      console.log('Generating meshes...')
      const meshCount = await worldView.generateMeshes()
      console.log('Meshes generated:', meshCount)
      
      console.log('Waiting for meshes...')
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Render and export
      const fileName = `minecraft_structure_${Date.now()}.gltf`
      
      try {
        console.log('Starting render...')
        renderer.render(viewer.scene, viewer.camera)
        console.log('Render complete')
        
        console.log('Starting GLTF export...')
        console.log('Debug: Checking texture atlas state:')
        console.log('viewer.world:', viewer.world ? 'exists' : 'missing')
        console.log('viewer.world.textureAtlas:', viewer.world?.textureAtlas ? 'exists' : 'missing')
        console.log('viewer.world.atlas:', viewer.world?.atlas ? 'exists' : 'missing')
        
        // Ensure output directory exists
        await fs.mkdir('./gltf_out', { recursive: true })
        
        // Save texture atlas
        if (viewer.world.textureAtlas?.image) {
          console.log('Saving texture atlas...')
          const textureAtlasCanvas = viewer.world.textureAtlas.image
          const stream = textureAtlasCanvas.createPNGStream()
          const outputPath = path.join('./gltf_out', 'atlas.png')
          
          await pipeline(
            stream,
            createWriteStream(outputPath)
          )
          
          console.log('Texture atlas saved')
        } else {
          console.warn('No texture atlas image found to save')
        }
        
        console.log('Exporting GLTF...')
        await exportGLTF(viewer.scene, fileName)
        
        console.log(`Successfully exported to: ./gltf_out/${fileName}`)
        console.log('Export complete')
      } catch (error) {
        console.error('Error during render/export:', error)
        throw error
      }

    } catch (error) {
      console.error('Failed during processing:', error)
      throw error
    }
    
    process.exit(0)
  } catch (error) {
    console.error('Error in main:', error)
    console.error('Stack trace:', error.stack)
    process.exit(1)
  }
}
main()