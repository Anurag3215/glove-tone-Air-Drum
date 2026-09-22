import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

export function usePointerParallax(intensity = 0.35) {
  const { camera } = useThree()
  const mouseRef = useRef(new THREE.Vector2(0, 0))
  const targetRot = useRef(new THREE.Vector2(0, 0))
  const initialCamPos = useRef(new THREE.Vector3(0, 0.4, 5.0))

  useEffect(() => {
    initialCamPos.current.copy(camera.position)

    const handlePointerMove = (e) => {
      // Normalized between -1 and 1
      const x = (e.clientX / window.innerWidth) * 2 - 1
      const y = -(e.clientY / window.innerHeight) * 2 + 1
      mouseRef.current.set(x, y)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [camera])

  useFrame((_, delta) => {
    // Smooth spring interpolation
    const factor = Math.min(1, delta * 4.5)

    targetRot.current.x += (mouseRef.current.x * intensity - targetRot.current.x) * factor
    targetRot.current.y += (mouseRef.current.y * intensity - targetRot.current.y) * factor

    // Subtle position shift
    camera.position.x = initialCamPos.current.x + targetRot.current.x * 0.45
    camera.position.y = initialCamPos.current.y + targetRot.current.y * 0.35
    camera.position.z = initialCamPos.current.z + (Math.abs(targetRot.current.x) + Math.abs(targetRot.current.y)) * -0.15

    // Subtle rotation tilt
    camera.rotation.y = -targetRot.current.x * 0.08
    camera.rotation.x = targetRot.current.y * 0.06
  })
}
