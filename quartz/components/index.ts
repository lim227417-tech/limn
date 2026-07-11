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

// Register DappledScene so it can be referenced in quartz.config.yaml layout
componentRegistry.register("DappledScene", DappledScene, "quartz")
