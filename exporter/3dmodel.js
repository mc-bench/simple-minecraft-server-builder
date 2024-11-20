/* global THREE */

global.THREE = require("three");
global.Worker = require("worker_threads").Worker;
const { createCanvas, ImageData } = require("node-canvas-webgl/lib");
const { Schematic } = require("prismarine-schematic");
const fs = require("fs").promises;
const Vec3 = require("vec3").Vec3;
const path = require("path");

const { Viewer, WorldView } = require("prismarine-viewer").viewer;

const main = async () => {
  const viewDistance = 4;
  const width = 512;
  const height = 512;
  const version = "1.16.4";
  const World = require("prismarine-world")(version);
  const Chunk = require("prismarine-chunk")(version);
  const center = new Vec3(30, 90, 30);

  // Read all files from schematics directory at project root
  const schematicsDir = path.join(__dirname, "..", "..", "schematics");
  const files = await fs.readdir(schematicsDir);
  const schemFiles = files.filter((file) => file.endsWith(".schem"));

  for (const schemFile of schemFiles) {
    const canvas = createCanvas(width, height);
    const renderer = new THREE.WebGLRenderer({ canvas });
    const viewer = new Viewer(renderer, false);

    const data = await fs.readFile(path.join(schematicsDir, schemFile));
    const schem = await Schematic.read(data, version);

    const world = new World(() => new Chunk());
    await schem.paste(world, new Vec3(0, 60, 0));

    if (!viewer.setVersion(version)) {
      continue;
    }

    // Load world
    const worldView = new WorldView(world, viewDistance, center);
    viewer.listen(worldView);

    viewer.camera.position.set(center.x, center.y, center.z);
    const point = new THREE.Vector3(0, 60, 0);
    viewer.camera.lookAt(point);

    await worldView.init(center);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    renderer.render(viewer.scene, viewer.camera);

    // Create output directory
    const outputDir = path.join(
      __dirname,
      "models",
      schemFile.replace(".schem", "")
    );
    await fs.mkdir(outputDir, { recursive: true });

    // Setup for GLTF export
    const { Blob, FileReader } = require("vblob");
    global.window = global;
    global.Blob = Blob;
    global.FileReader = FileReader;
    global.THREE = THREE;
    global.ImageData = ImageData;
    global.document = {
      createElement: (nodeName) => {
        if (nodeName !== "canvas")
          throw new Error(`Cannot create node ${nodeName}`);
        const canvas = createCanvas(256, 256);
        return canvas;
      },
    };

    // Export GLTF
    require("three-gltf-exporter");
    await fs.writeFile(
      path.join(outputDir, "model.gltf"),
      await new Promise((resolve) =>
        new THREE.GLTFExporter().parse(
          viewer.scene,
          (a) => resolve(JSON.stringify(a)),
          {
            embedImages: true,
            binary: false,
          }
        )
      )
    );
    console.log(`Exported models for ${schemFile}`);
  }

  console.log("All models saved");
  process.exit(0);
};
main();
