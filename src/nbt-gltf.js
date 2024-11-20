// `cd src` and then run `node nbt-gltf.js`
import * as THREE from 'three'
import { createCanvas, ImageData } from 'canvas'
import { loadImage } from 'node-canvas-webgl/lib/index.js'
import gl from 'gl'
import { promises as fs } from 'fs'
import { Vec3 } from 'vec3'
import { parse, simplify } from 'prismarine-nbt'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import mcAssets from 'minecraft-assets'
import path from 'path'
import { Blob, FileReader } from 'vblob'

// Polyfills for GLTF export and canvas
global.Blob = Blob
global.FileReader = FileReader
global.ImageData = ImageData
global.Image = loadImage
global.performance = { now: () => Date.now() }

const VERSION = '1.20.2'
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
    this.blockStates = null
    
    this.handleMessage = this.handleMessage.bind(this)
    this.postMessage = this.handleMessage
  }

  handleMessage(data) {
    if (data.type === 'add_mesh') {
      this.addMesh(data)
    } else {
      console.warn('Unknown message type:', data.type)
    }
  }

  setAtlas(atlas, uvMapping, blockStates) {
    this.atlas = atlas
    this.uvMapping = uvMapping
    this.blockStates = blockStates
    console.log('Atlas set with:', {
      hasAtlas: !!atlas,
      mappingCount: Object.keys(uvMapping).length,
      statesCount: Object.keys(blockStates || {}).length
    })
  }

  getBlockState(blockId) {
    const block = this.mcData.blocks[blockId]
    if (!block) return null

    // Get block state from our loaded states
    const blockState = this.blockStates[block.name]
    if (!blockState) {
      console.warn(`No block state found for ${block.name}`)
      return null
    }

    return blockState
  }

  getTextureForBlock(blockName, textureType = 'all') {
    // Try different texture naming patterns
    const patterns = [
      `${blockName}`,                    // Basic name
      `${blockName}_${textureType}`,     // With type suffix
      blockName.replace('_block', ''),   // Without _block suffix
      blockName.split('_')[0],           // Base material name
    ]

    for (const pattern of patterns) {
      if (this.uvMapping[pattern]) {
        return {
          uvs: this.uvMapping[pattern],
          name: pattern
        }
      }
    }

    // Log the failure to find a texture
    console.warn(`No texture found for ${blockName} (${textureType}) in available textures:`, 
      Object.keys(this.uvMapping).filter(k => k.includes(blockName.split('_')[0])))
    
    return null
  }

  createMaterial(blockId) {
    const block = this.mcData.blocks[blockId]
    if (!block || !this.atlas) {
      console.warn(`Unable to create material for block ${blockId}`)
      return new THREE.MeshStandardMaterial({ color: 0x808080 })
    }

    // Get texture info
    const textureInfo = this.getTextureForBlock(block.name)
    if (!textureInfo) {
      console.warn(`No texture found for ${block.name}`)
      return new THREE.MeshStandardMaterial({ color: 0x808080 })
    }

    // Create material
    const material = new THREE.MeshStandardMaterial({
      map: this.atlas.clone(),
      transparent: block.transparent || false,
      alphaTest: block.transparent ? 0.1 : 0,
      side: THREE.FrontSide,
      roughness: 1.0,
      metalness: 0.0
    })

    // Set UV mapping
    const { uvs } = textureInfo
    material.map.repeat.set(uvs.width, uvs.height)
    material.map.offset.set(uvs.x, uvs.y)
    material.map.needsUpdate = true

    return material
  }

  addMesh(data) {
    console.log('Adding mesh:', {
      chunkPos: `${data.x},${data.z}`,
      blockCount: data.blocks?.length || 0
    })
    
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
      if (!blockName) {
        console.warn(`Unknown block type: ${blockType}`)
        continue
      }

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
      
      // Store mesh for cleanup
      const meshId = `${x},${z},${blockType}`
      if (this.meshes.has(meshId)) {
        const oldMesh = this.meshes.get(meshId)
        this.scene.remove(oldMesh)
        oldMesh.geometry.dispose()
        if (Array.isArray(oldMesh.material)) {
          oldMesh.material.forEach(m => m.dispose())
        } else {
          oldMesh.material.dispose()
        }
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
  try {
    // Load block textures JSON as an array
    const blocksTexturesPath = path.join(assets.directory, 'blocks_textures.json')
    const textureArray = JSON.parse(await fs.readFile(blocksTexturesPath, 'utf8'))

    const ATLAS_SIZE = 2048
    const TEXTURE_SIZE = 16
    
    const atlasCanvas = createCanvas(ATLAS_SIZE, ATLAS_SIZE)
    const ctx = atlasCanvas.getContext('2d')
    ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE)

    const uvMapping = {}
    let x = 0
    let y = 0
    let processedCount = 0

    // Process each texture entry in the array
    for (const entry of textureArray) {
      try {
        // Skip entries with no texture
        if (!entry.texture || entry.texture === 'null' || entry.name === 'air') {
          continue
        }

        const isItem = entry.texture.includes('item/')
        const baseDir = isItem ? 'items' : 'blocks'

        const texturePath = entry.texture
          .replace('minecraft:blocks/', '')
          .replace('minecraft:item/', '')
          .replace('blocks/', '')
          .replace('item/', '')

        const blockName = entry.name
        // Use the appropriate directory in the path
        const fullTexturePath = path.join(assets.directory, baseDir, `${texturePath}.png`)
        
        try {
          const image = await loadImage(fullTexturePath)
          
          // Draw texture to atlas
          ctx.drawImage(image, x, y, TEXTURE_SIZE, TEXTURE_SIZE)

          // Store UV mapping using block name
          uvMapping[blockName] = {
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
            if (y + TEXTURE_SIZE > ATLAS_SIZE) {
              console.warn('Atlas size exceeded')
              break
            }
          }

          processedCount++

        } catch (error) {
          console.warn(`Failed to load texture for ${blockName} at ${fullTexturePath}`)
        }
      } catch (error) {
        console.warn(`Failed to process texture entry:`, error)
      }
    }

    console.log('Texture processing complete:', {
      processedCount,
      mappingCount: Object.keys(uvMapping).length
    })

    // Create Three.js texture
    const textureAtlas = new THREE.CanvasTexture(atlasCanvas)
    textureAtlas.magFilter = THREE.NearestFilter
    textureAtlas.minFilter = THREE.NearestFilter
    textureAtlas.generateMipmaps = false
    textureAtlas.flipY = false
    textureAtlas.needsUpdate = true

    // Store mapping data
    textureAtlas.userData = {
      uvMapping,
      textureSize: TEXTURE_SIZE,
      atlasSize: { width: ATLAS_SIZE, height: ATLAS_SIZE }
    }

    // Create block states
    const blockStates = {}
    for (const [blockName, uvs] of Object.entries(uvMapping)) {
      blockStates[blockName] = {
        variants: {
          "normal": {
            model: {
              textures: {
                all: blockName,
                top: blockName,
                side: blockName,
                bottom: blockName
              }
            }
          }
        },
        name: blockName
      }
    }

    return {
      atlas: textureAtlas,
      uvMapping,
      blockStates,
      textureSize: TEXTURE_SIZE
    }

  } catch (error) {
    console.error('Error in texture atlas creation:', error)
    throw error
  }
}

const main = async () => {
  try {
    setupGlobalEnv() // start environment
    
    const renderer = initRenderer() // initialize rendering
    
    console.log('Initializing Minecraft modules...')
    const mcModules = await initMinecraftModules()
    
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
      }
    }

    if (!await viewer.setVersion(VERSION)) {
      throw new Error('Failed to set version')
    }

    console.log('Reading NBT file...')
    const buffer = await fs.readFile('./public/my_awesome_house.nbt')

    // Load Minecraft assets
    const assets = mcAssets(VERSION)
    const { atlas, uvMapping, blockStates } = await createTextureAtlas(assets)
    const { world, size } = await processNBT(buffer, mcModules)
    console.log('NBT data processed. Structure size:', size)
    
    const center = new Vec3(
      Math.floor(size.x / 2),
      Math.floor(size.y / 2),
      Math.floor(size.z / 2)
    )
    setupScene(viewer, size)
    
    const worldView = new EnhancedWorldView(
      world,
      VIEWPORT.viewDistance,
      center,
      viewer.scene,
      mcModules.mcData
    )

    // Set the atlas and mappings
    worldView.worker.setAtlas(atlas, uvMapping, blockStates)

    await worldView.init(center)
    viewer.listen(worldView)
    
    console.log('Generating meshes...')
    const meshCount = await worldView.generateMeshes()
    console.log('Meshes generated:', meshCount)
    
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Render and export
    const fileName = `structure_${Date.now()}.gltf`
    
    try {
      renderer.render(viewer.scene, viewer.camera)
      console.log('Render complete')
      
      await exportGLTF(viewer.scene, fileName)
      console.log(`Successfully exported to: ./gltf_out/${fileName}`)
      
    } catch (error) {
      console.error('Error during render/export:', error)
      throw error
    }
    
    process.exit(0)
  } catch (error) {
    console.error('Error in main:', error, {
      stack: error.stack
    })
    process.exit(1)
  }
}
main()