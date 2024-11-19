/* global THREE */

/*
This is an example of using only the core API (.viewer) to implement rendering a world and saving a screenshot of it
*/

global.THREE = require("three");
global.Worker = require("worker_threads").Worker;
const { createCanvas } = require("node-canvas-webgl");
const { Schematic } = require("prismarine-schematic");
const fs = require("fs").promises;
const path = require("path");
const Vec3 = require("vec3").Vec3;

const { Viewer, WorldView, getBufferFromStream } =
  require("prismarine-viewer").viewer;

const main = async () => {
  const viewDistance = 4;
  const width = 4096; // Upping the resolution quite a lot from the original, which was 512
  const height = 4096;
  const version = "1.16.4";
  const World = require("prismarine-world")(version);
  const Chunk = require("prismarine-chunk")(version);
  const center = new Vec3(30, 90, 30);
  const canvas = createCanvas(width, height);
  const renderer = new THREE.WebGLRenderer({ canvas });
  const viewer = new Viewer(renderer);

  // Read all files from schematics directory at project root
  const schematicsDir = path.join(__dirname, "..", "..", "schematics");
  const files = await fs.readdir(schematicsDir);
  const schemFiles = files.filter((file) => file.endsWith(".schem"));

  // Process each schematic file
  for (const schemFile of schemFiles) {
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
    await viewer.world.waitForChunksToRender();
    renderer.render(viewer.scene, viewer.camera);

    // Save screenshot with filename based on schematic name
    const screenshotName = schemFile.replace(".schem", ".jpg");
    const imageStream = canvas.createJPEGStream({
      bufsize: 4096,
      quality: 100,
      progressive: false,
    });
    const buf = await getBufferFromStream(imageStream);
    await fs.mkdir(path.join(__dirname, "screenshots/"), { recursive: true });
    await fs.writeFile(
      path.join(__dirname, `screenshots/${screenshotName}`),
      buf
    );
    console.log(`Saved screenshot for ${schemFile}`);
  }

  process.exit(0);
};
main();
