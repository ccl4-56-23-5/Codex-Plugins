import { serveIpc } from "./ipc.mjs";
import { createDesktopHost } from "./workbuddy-host.mjs";

const server = await serveIpc(createDesktopHost(() => server.close()));
