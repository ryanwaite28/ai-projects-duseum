import { useEffect, useRef } from 'react'

export const useReveal = <T extends HTMLElement = HTMLElement>() => {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible')
          io.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )

    io.observe(el)
    return () => io.disconnect()
  }, [])

  return ref
}
