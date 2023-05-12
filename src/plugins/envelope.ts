/**
 * Envelope is a visual UI for controlling the audio volume and add fade-in and fade-out effects.
 */

import BasePlugin from '../base-plugin.js'

export type EnvelopePluginOptions = {
  fadeInStart?: number
  fadeInEnd?: number
  fadeOutStart?: number
  fadeOutEnd?: number
  volume?: number
  lineWidth?: string
  lineColor?: string
  dragPointSize?: number
  dragPointFill?: string
  dragPointStroke?: string
}

const defaultOptions = {
  fadeInStart: 0,
  fadeOutEnd: 0,
  fadeInEnd: 0,
  fadeOutStart: 0,
  lineWidth: 4,
  lineColor: 'rgba(0, 0, 255, 0.5)',
  dragPointSize: 10,
  dragPointFill: 'rgba(255, 255, 255, 0.8)',
  dragPointStroke: 'rgba(255, 255, 255, 0.8)',
}

export type EnvelopePluginEvents = {
  'fade-in-change': [time: number]
  'fade-out-change': [time: number]
  'volume-change': [volume: number]
}

class EnvelopePlugin extends BasePlugin<EnvelopePluginEvents, EnvelopePluginOptions> {
  protected options: EnvelopePluginOptions & typeof defaultOptions
  private svg: SVGViewElement | null = null
  private audioContext: AudioContext | null = null
  private gainNode: GainNode | null = null
  private volume = 1
  private isFadingIn = false
  private isFadingOut = false
  // Adjust the exponent to change the curve of the volume control
  private readonly naturalVolumeExponent = 1.5

  constructor(options: EnvelopePluginOptions) {
    super(options)

    this.options = Object.assign({}, defaultOptions, options)
    this.options.lineColor = this.options.lineColor || defaultOptions.lineColor
    this.options.dragPointFill = this.options.dragPointFill || defaultOptions.dragPointFill
    this.options.dragPointStroke = this.options.dragPointStroke || defaultOptions.dragPointStroke

    this.volume = this.options.volume ?? 1
  }

  public static create(options: EnvelopePluginOptions) {
    return new EnvelopePlugin(options)
  }

  public destroy() {
    this.svg?.remove()
    super.destroy()
  }

  /** Called by wavesurfer, don't call manually */
  onInit() {
    if (!this.wavesurfer) {
      throw Error('WaveSurfer is not initialized')
    }

    this.initWebAudio()
    this.initSvg()
    this.initFadeEffects()

    this.subscriptions.push(
      this.wavesurfer.on('decode', (duration) => {
        this.options.fadeInStart = this.options.fadeInStart || 0
        this.options.fadeOutEnd = this.options.fadeOutEnd || duration
        this.options.fadeInEnd = this.options.fadeInEnd || this.options.fadeInStart
        this.options.fadeOutStart = this.options.fadeOutStart || this.options.fadeOutEnd
        this.renderPolyline()
      }),
    )

    this.subscriptions.push(this.wavesurfer.on('redraw', () => this.onRedraw()))
  }

  private makeDraggable(draggable: SVGElement, onDrag: (dx: number, dy: number) => void) {
    draggable.addEventListener('mousedown', (e) => {
      let x = e.clientX
      let y = e.clientY
      const wasInteractive = this.wavesurfer?.options.interact || true
      let delay: ReturnType<typeof setTimeout>

      // Make the wavesurfer ignore clicks when we're dragging
      this.wavesurfer?.toggleInteraction(false)

      const move = (e: MouseEvent) => {
        const dx = e.clientX - x
        const dy = e.clientY - y
        x = e.clientX
        y = e.clientY
        onDrag(dx, dy)
      }

      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)

        // Restore interactive state
        if (delay) clearTimeout(delay)
        delay = setTimeout(() => {
          this.wavesurfer?.toggleInteraction(wasInteractive)
        }, 100)
      }

      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)

      e.preventDefault()
      e.stopPropagation()
    })
  }

  private initSvg() {
    if (!this.wavesurfer) return

    const wrapper = this.wavesurfer.getWrapper()

    // SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '100%')
    svg.setAttribute('height', '100%')
    svg.setAttribute('viewBox', `0 0 ${wrapper.clientWidth} ${wrapper.clientHeight}`)
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.setAttribute('style', 'position: absolute; left: 0; top: 0; z-index: 4; pointer-events: none;')
    this.svg = svg

    // A polyline representing the envelope
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    polyline.setAttribute('points', '0,0 0,0 0,0 0,0')
    polyline.setAttribute('stroke', this.options.lineColor)
    polyline.setAttribute('stroke-width', this.options.lineWidth)
    polyline.setAttribute('fill', 'none')
    polyline.setAttribute('style', 'pointer-events: none')
    svg.appendChild(polyline)

    // Draggable top line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('stroke', 'transparent')
    line.setAttribute('stroke-width', (this.options.lineWidth * 3).toString())
    line.setAttribute('style', 'cursor: ns-resize; pointer-events: all;')
    svg.appendChild(line)

    // Drag points
    Array.from(polyline.points).forEach((_, index) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('r', (this.options.dragPointSize / 2).toString())
      circle.setAttribute('fill', this.options.dragPointFill)
      circle.setAttribute('stroke', this.options.dragPointStroke || this.options.dragPointFill)
      circle.setAttribute('stroke-width', '2')
      circle.setAttribute('style', 'cursor: ew-resize; pointer-events: all;')
      svg.appendChild(circle)
      if (index === 0 || index === 3) {
        circle.setAttribute('style', 'display: none')
      }
    })

    wrapper.appendChild(svg)

    // Init dtagging
    {
      // On top line drag
      const onDragY = (dy: number) => {
        const topPoint = polyline.points.getItem(1)
        const offset = this.options.dragPointSize / 2
        const newTop = topPoint.y + dy - offset
        const { height } = svg.viewBox.baseVal
        if (newTop < -0.5 || newTop > height) return
        const newVolume = Math.min(1, Math.max(0, (height - newTop) / height))
        this.onVolumeDrag(newVolume)
      }

      // On points drag
      const onDragX = (dx: number, index: number) => {
        const duration = this.wavesurfer?.getDuration() || 0
        const point = polyline.points.getItem(index)
        const newX = point.x + dx
        const { width } = svg.viewBox.baseVal
        const newTime = (newX / width) * duration

        // Fade-in end point
        if (index === 1 && (newTime < this.options.fadeInStart || newTime > this.options.fadeOutStart)) return

        // Fade-out start point
        if (index === 2 && (newTime > this.options.fadeOutEnd || newTime < this.options.fadeInEnd)) return

        if (index === 1) {
          this.options.fadeInEnd = newTime
          this.emit('fade-in-change', newTime)
        } else if (index === 2) {
          this.options.fadeOutStart = newTime
          this.emit('fade-out-change', newTime)
        }

        this.renderPolyline()
      }

      // Draggable top line of the polyline
      this.makeDraggable(line, (_, dy) => onDragY(dy))

      // Make each point draggable
      const draggables = this.svg.querySelectorAll('circle')
      Array.from(draggables).forEach((draggable, index) => {
        this.makeDraggable(draggable, (dx) => onDragX(dx, index))
      })
    }
  }

  private renderPolyline() {
    if (!this.svg || !this.wavesurfer) return

    const { width, height } = this.svg.viewBox.baseVal
    const duration = this.wavesurfer.getDuration()
    const offset = this.options.dragPointSize / 2
    const top = height - this.invertNaturalVolume(this.volume) * height + offset

    const polyline = this.svg.querySelector('polyline') as SVGPolylineElement
    const { points } = polyline
    const xScale = width / duration
    points.getItem(0).x = this.options.fadeInStart * xScale
    points.getItem(0).y = height
    points.getItem(1).x = this.options.fadeInEnd * xScale
    points.getItem(1).y = top
    points.getItem(2).x = this.options.fadeOutStart * xScale
    points.getItem(2).y = top
    points.getItem(3).x = this.options.fadeOutEnd * xScale
    points.getItem(3).y = height

    const line = this.svg.querySelector('line') as SVGLineElement
    line.setAttribute('x1', points.getItem(1).x.toString())
    line.setAttribute('x2', points.getItem(2).x.toString())
    line.setAttribute('y1', top.toString())
    line.setAttribute('y2', top.toString())

    const circles = this.svg.querySelectorAll('circle')
    Array.from(circles).forEach((circle, i) => {
      const point = points.getItem(i)
      circle.setAttribute('cx', point.x.toString())
      circle.setAttribute('cy', point.y.toString())
    })
  }

  private onRedraw() {
    if (!this.svg || !this.wavesurfer) return
    const wrapper = this.wavesurfer.getWrapper()
    this.svg.viewBox.baseVal.width = wrapper.clientWidth
    this.svg.viewBox.baseVal.height = wrapper.clientHeight
    this.renderPolyline()
  }

  private initWebAudio() {
    const audio = this.wavesurfer?.getMediaElement()
    if (!audio) return null

    this.volume = this.options.volume ?? audio.volume

    // Create an AudioContext
    const audioContext = new window.AudioContext()

    // Create a GainNode for controlling the volume
    this.gainNode = audioContext.createGain()
    this.setGainValue()

    // Create a MediaElementAudioSourceNode using the audio element
    const source = audioContext.createMediaElementSource(audio)

    // Connect the source to the GainNode, and the GainNode to the destination (speakers)
    source.connect(this.gainNode)
    this.gainNode.connect(audioContext.destination)

    this.audioContext = audioContext
  }

  private invertNaturalVolume(value: number): number {
    const minValue = 0.0001
    const maxValue = 1
    const interpolatedValue = Math.pow((value - minValue) / (maxValue - minValue), 1 / this.naturalVolumeExponent)
    return interpolatedValue
  }

  private naturalVolume(value: number): number {
    const minValue = 0.0001
    const maxValue = 1
    const interpolatedValue = minValue + (maxValue - minValue) * Math.pow(value, this.naturalVolumeExponent)
    return interpolatedValue
  }

  private setGainValue() {
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume
    }
  }

  private onVolumeDrag(volume: number) {
    this.setVolume(this.naturalVolume(volume))
  }

  private initFadeEffects() {
    if (!this.audioContext || !this.wavesurfer) return

    const unsub = this.wavesurfer.on('timeupdate', (currentTime) => {
      if (!this.audioContext || !this.gainNode) return
      if (!this.wavesurfer?.isPlaying()) return

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume()
      }

      // Fade in
      if (!this.isFadingIn && currentTime >= this.options.fadeInStart && currentTime <= this.options.fadeInEnd) {
        this.isFadingIn = true
        // Set the initial gain (volume) to 0 (silent)
        this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime)
        // Set the target gain (volume) to 1 (full volume) over N seconds
        this.gainNode.gain.linearRampToValueAtTime(
          this.volume,
          this.audioContext.currentTime + (this.options.fadeInEnd - currentTime),
        )
        return
      }

      // Fade out
      if (!this.isFadingOut && currentTime >= this.options.fadeOutStart && currentTime <= this.options.fadeOutEnd) {
        this.isFadingOut = true
        /**
         * Set the gain at this point in time to the current volume, otherwise
         * the audio will start fading out from the fade-in point.
         */
        this.gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime)
        // Set the target gain (volume) to 0 (silent) over N seconds
        this.gainNode.gain.linearRampToValueAtTime(
          0,
          this.audioContext.currentTime + (this.options.fadeOutEnd - currentTime),
        )
        return
      }

      // Reset fade in/out
      let cancelRamp = false
      if (this.isFadingIn && (currentTime < this.options.fadeInStart || currentTime > this.options.fadeInEnd)) {
        this.isFadingIn = false
        cancelRamp = true
      }
      if (this.isFadingOut && (currentTime < this.options.fadeOutStart || currentTime >= this.options.fadeOutEnd)) {
        this.isFadingOut = false
        cancelRamp = true
      }
      if (cancelRamp) {
        this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime)
        this.setGainValue()
      }
    })

    this.subscriptions.push(unsub)
  }

  /** Get the current audio volume */
  public getCurrentVolume() {
    return this.gainNode ? this.gainNode.gain.value : this.volume
  }

  /**
   * Set the fade-in start time.
   * @param time The time (in seconds) to set the fade-in start time to
   * @param moveFadeInEnd Whether to move the drag point to the new time (default: false)
   */
  public setStartTime(time: number, moveFadeInEnd = false) {
    this.options.fadeInStart = time

    if (moveFadeInEnd) {
      const rampLength = this.options.fadeInEnd - this.options.fadeInStart
      this.options.fadeInEnd = time + rampLength
    }

    this.renderPolyline()
  }

  /** Set the fade-in end time.
   * @param time The time (in seconds) to set the fade-in end time to
   * @param moveFadeOutStart Whether to move the drag point to the new time (default: false)
   */
  public setEndTime(time: number, moveFadeOutStart = false) {
    this.options.fadeOutEnd = time

    if (moveFadeOutStart) {
      const rampLength = this.options.fadeOutEnd - this.options.fadeOutStart
      this.options.fadeOutStart = time - rampLength
    }

    this.renderPolyline()
  }

  /** Set the volume of the audio */
  public setVolume(volume: number) {
    this.volume = volume
    this.setGainValue()
    this.renderPolyline()
    this.emit('volume-change', volume)
  }
}

export default EnvelopePlugin
