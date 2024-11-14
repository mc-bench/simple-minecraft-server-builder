# simple-minecraft-server-builder

This is a simple demo repo that includes:

* a docker-compose configured to start up a Java 1.20.4 Minecraft server locally via docker
* a prompt template (very rough draft) for prompting for a creative build script function
* a template running (builds/template.js)
* a directory to put builds

# Example Build

The `builds/house.js` provides an example of a complete building script that creates a simple house structure. You can use this as a reference for how the building functions work and what a completed script looks like.

# Installation

Before getting started, install the required dependencies:

```shell
npm install
```
or
```shell
bun install
```

# How to use this repo

1. Start up the server. Run:
```shell
$ docker-compose up -d
```
This step takes a while. You can review the logs via `docker-compose logs -f` 
This will run an offline minecraft server on 127.0.0.1:25565

2. Connect to this server from a local client. Be sure to select the Java Edition and under Installations, add and launch the 1.20.4 version.
3. Attach to the server:

```shell
docker attach `docker-compose ps -q`
```
4. Make your user an operator. For example if you connected to the minecraft server as `hunter`, then hit `enter` and type `op hunter`. It should output something like:

```shell
[03:31:35 INFO]: Made hunter a server operator
```
it may be helpful to also do the same for the `Builder` user, which is the user that the bot script connects as.

5. Carefully detach using ctrl+p+q (press ctrl button, p button, and q button all at once) which should gracefully detach with the following output:
```shell
read escape sequence
```

**Note:** If you're using VSCode or another IDE, the ctrl+p+q keybinding might conflict with editor shortcuts. You may need to temporarily disable or rebind conflicting keyboard shortcuts in your editor or docker settings.

6. Using your favorite LLM chatbot, create a building script by providing it with:
   - The desired structure you want to build
   - The template function signature: `async function buildCreation(startX, startY, startZ)`
   - The available helper functions: `safeSetBlock()` and `safeFill()`

7. Create a new build file:
   ```shell
   cp builds/template.js builds/your-structure.js
   ```

   Then replace the empty `buildCreation` function with your generated code:
   ```javascript
   async function buildCreation(startX, startY, startZ) {
     // Your generated building code here
   }
   ```

8. Run your structure script:
   ```shell
   # The DELAY controls block placement speed (milliseconds)
   # STRUCTURE_NAME sets the .nbt file name
   DELAY=50 STRUCTURE_NAME=my_awesome_house node builds/your-structure.js
   ```

9. Find your structure's NBT file at:
   ```
   data/world/generated/minecraft/structures/my_awesome_house.nbt
   ```
