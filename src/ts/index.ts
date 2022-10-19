import World  from './world/World'

// earth-canvas
const dom: HTMLElement = document.querySelector('#earth-canvas')
new World({
  dom,
})