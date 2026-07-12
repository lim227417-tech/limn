import NotFound from "./pages/404"
import Head from "./Head"
import Spacer from "./Spacer"
import DesktopOnly from "./DesktopOnly"
import MobileOnly from "./MobileOnly"
import Flex from "./Flex"
import ConditionalRender from "./ConditionalRender"
import DappledScene from "./DappledScene"

import { componentRegistry, defineComponent } from "./registry"
export { External } from "./external"
export type { ComponentManifest, RegisteredComponent } from "./registry"
export type { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

export { Head, Spacer, DesktopOnly, MobileOnly, NotFound, Flex, ConditionalRender, DappledScene }

// Register the scene under its component name and local plugin alias so the
// declarative Quartz layout can resolve either form.
componentRegistry.register("DappledScene", DappledScene, "quartz")
componentRegistry.register("dappled-scene-local", DappledScene, "quartz")
