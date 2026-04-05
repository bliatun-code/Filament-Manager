import * as THREE from "three";
import { createSpoolMesh, SpoolVisual } from "./spool_model";

export type WarehouseSlot = {
  id: string;
  position: { x: number; y: number; z: number };
  spool?: SpoolVisual;
};

type SceneHandle = {
  updateSlots: (slots: WarehouseSlot[]) => void;
  dispose: () => void;
};

export function initWarehouseScene(
  canvas: HTMLCanvasElement,
  onSelect?: (spoolId: string) => void,
): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0f172a");

  const camera = new THREE.PerspectiveCamera(
    45,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    100,
  );
  camera.position.set(4, 4, 6);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight("#ffffff", 0.8);
  const directional = new THREE.DirectionalLight("#ffffff", 1.2);
  directional.position.set(6, 8, 4);
  scene.add(ambient, directional);

  const shelf = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.1, 2),
    new THREE.MeshStandardMaterial({ color: "#1f2937" }),
  );
  shelf.position.set(0, -0.4, 0);
  scene.add(shelf);

  const spoolGroup = new THREE.Group();
  scene.add(spoolGroup);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function onPointer(event: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(spoolGroup.children, true);
    if (hits.length > 0) {
      const target = hits[0].object;
      const parent = target.parent ?? target;
      const spoolId = parent.userData?.spoolId;
      if (spoolId && onSelect) {
        onSelect(spoolId);
      }
    }
  }

  canvas.addEventListener("pointerdown", onPointer);

  let animationFrame = 0;
  const renderLoop = () => {
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(renderLoop);
  };
  renderLoop();

  const updateSlots = (slots: WarehouseSlot[]) => {
    spoolGroup.clear();
    slots.forEach((slot) => {
      if (!slot.spool) {
        return;
      }
      const mesh = createSpoolMesh(slot.spool);
      mesh.position.set(slot.position.x, slot.position.y, slot.position.z);
      spoolGroup.add(mesh);
    });
  };

  const dispose = () => {
    cancelAnimationFrame(animationFrame);
    canvas.removeEventListener("pointerdown", onPointer);
    renderer.dispose();
    spoolGroup.clear();
  };

  return { updateSlots, dispose };
}
