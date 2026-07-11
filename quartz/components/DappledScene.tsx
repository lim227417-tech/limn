import { QuartzComponent, QuartzComponentConstructor } from "./types"
import dappledScript from "./scripts/dappled.inline"

const DappledScene: QuartzComponent = () => {
  return <div class="dappled-scene" aria-hidden="true" />
}

DappledScene.afterDOMLoaded = dappledScript

export default (() => DappledScene) satisfies QuartzComponentConstructor
