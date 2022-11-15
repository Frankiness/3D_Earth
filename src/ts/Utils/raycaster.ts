import { Vector3, Raycaster } from 'three'

export function addRaycaster(event: MouseEvent) {
  let vector = new Vector3((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window
    .innerHeight) * 2 + 1, 0.5);
  vector = vector.unproject(this.camera); // 将屏幕的坐标转换成三维场景中的坐标
  const meshArray = this.scene.children.filter(item => item.isMesh)
  const raycaster = new Raycaster(this.camera.position, vector.sub(this.camera.position).normalize());
  const intersects = raycaster.intersectObjects(meshArray, true);
  if (intersects.length > 0) {
    console.log(intersects[0]);
  }
}