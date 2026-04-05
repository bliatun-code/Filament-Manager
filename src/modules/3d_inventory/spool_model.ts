import * as THREE from "three";

export type SpoolVisual = {
  id: string;
  colorHex: string;
  label?: string;
};

export function createSpoolMesh(spool: SpoolVisual): THREE.Group {
  const group = new THREE.Group();

  const bodyGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.2, 32);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: spool.colorHex,
    roughness: 0.4,
    metalness: 0.1,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.rotation.x = Math.PI / 2;

  const hubGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.24, 24);
  const hubMaterial = new THREE.MeshStandardMaterial({
    color: "#1f2937",
    roughness: 0.5,
    metalness: 0.2,
  });
  const hub = new THREE.Mesh(hubGeometry, hubMaterial);
  hub.rotation.x = Math.PI / 2;

  group.add(body, hub);
  group.userData = { spoolId: spool.id };
  return group;
}
