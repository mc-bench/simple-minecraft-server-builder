# simple-minecraft-server-builder

This is a simple demo repo that includes:

* a docker-compose configured to start up a Java 1.20.4 minecraft server locally via docker
* a prompt template (very rought draft) for prompting for a creative build script function
* a template running (builds/template.js)
* a directory to put builds

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

2. Connect to this server from a local client. Be sure to select the Java Edition and then under Installations be sure to add and launch the 1.20.4 version.
3. Attach to the server:

```shell
docker attach `docker-compose ps -q`
```
4. Make your user an operator. For example if you connected to the minecraft server is `hunter`, then hit `enter` and type `op hunter`. It should output something like:

```shell
[03:31:35 INFO]: Made hunter a server operator
```
it may be helpful to also do the same for the `Builder` user, which is the user that the bot script connects as.

5. Carefully detach using ctrl+p+q (press ctrl button, p button, and q button all at once) which should gracefully detach with the following output:
```shell
> read escape sequence
```

**Note:** If you're using VSCode or another IDE, the ctrl+p+q keybinding might conflict with editor shortcuts. You may need to temporarily disable or rebind conflicting keyboard shortcuts in your editor / docker settings.

6. Using the prompt template and your favorite LLM chatbot, prompt for a creation

7. Copy the `builds/template.js` to something like `builds/house.js` and overwrite the function `buildCreation` with the generated code

8.Run the script (you must use npm >=18, so consider using `nvm` like `nvm use 18`) like:
```shell
DELAY=50 STRUCTURE_NAME=someStructureName node builds/house.js
```

9. You can find the nbt file for your structure at `data/world/generated/minecraft/structures` with whatever name you passed as the `STRUCTURE_NAME`
