This is a barebones implementation of the following repo:
https://github.com/PrismarineJS/prismarine-viewer/tree/master/examples/exporter
The goal is to take the schematic files created in the `convert.js` script and export them into other potentially usable formats

NOTE - YOU MUST USE NODE JS 16.20.2 - this code is quite old and not very well maintained
We can work to modernize it later but for now this works

Also - if you get errors with the node-canvas-webgl which you may have library try just manually running `npm install node-canvas-webgl`

You should run this code after running the `convert.js` script located in `src`