import Fetcher from './fetcher.js'
import Decoder from './decoder.js'
import Renderer, { type RendererStyleOptions } from './renderer.js'
import Player from './player.js'
import Timer from './timer.js'
import type { GenericPlugin } from './base-plugin.js'

export type WaveSurferOptions = {
  /** HTML element or CSS selector */
  container: HTMLElement | string
  /** The height of the waveform in pixels */
  height?: number
  /** The color of the waveform */
  waveColor?: string
  /** The color of the progress mask */
  progressColor?: string
  /** The color of the playpack cursor */
  cursorColor?: string
  /** The cursor width */
  cursorWidth?: number
  /** If set, the waveform will be rendered with bars like this: ▁ ▂ ▇ ▃ ▅ ▂ */
  barWidth?: number
  /** Spacing between bars in pixels */
  barGap?: number
  /** Rounded borders for bars */
  barRadius?: number
  /** A vertical scaling factor for the waveform */
  barHeight?: number
  /** Minimum pixels per second of audio (i.e. zoom level) */
  minPxPerSec?: number
  /** Stretch the waveform to fill the container, true by default */
  fillParent?: boolean
  /** Audio URL */
  url?: string
  /** Pre-computed audio data */
  peaks?: Float32Array[] | Array<number[]>
  /** Pre-computed duration */
  duration?: number
  /** Use an existing media element instead of creating one */
  media?: HTMLMediaElement
  /** Play the audio on load */
  autoplay?: boolean
  /** Pass false to disable clicks on the waveform */
  interact?: boolean
  /** Hide the scrollbar */
  hideScrollbar?: boolean
  /** Audio rate */
  audioRate?: number
  /** Automatically scroll the container to keep the current position in viewport */
  autoScroll?: boolean
  /** If autoScroll is enabled, keep the cursor in the center of the waveform during playback */
  autoCenter?: boolean
  /** Decoding sample rate. Doesn't affect the playback. Defaults to 8000 */
  sampleRate?: number
  /** The list of plugins to initialize on start */
  plugins?: GenericPlugin[]
}

const defaultOptions = {
  height: 128,
  waveColor: '#999',
  progressColor: '#555',
  cursorWidth: 1,
  minPxPerSec: 0,
  fillParent: true,
  interact: true,
  autoScroll: true,
  autoCenter: true,
  sampleRate: 8000,
}

export type WaveSurferEvents = {
  /** When audio starts loading */
  load: [url: string]
  /** When the audio has been decoded */
  decode: [duration: number]
  /** When the media element has loaded enough to play */
  canplay: [duration: number]
  /** When the audio is both decoded and can play */
  ready: [duration: number]
  /** When a waveform is drawn */
  redraw: []
  /** When the audio starts playing */
  play: []
  /** When the audio pauses */
  pause: []
  /** When the audio finishes playing */
  finish: []
  /** On audio position change, fires continuously during playback */
  timeupdate: [currentTime: number]
  /** An alias of timeupdate but only when the audio is playing */
  audioprocess: [currentTime: number]
  /** When the user seeks to a new position */
  seeking: [currentTime: number]
  /** When a user interaction (i.e. a click on the waveform) happens */
  interaction: []
  /** When the waveform is scrolled (panned) */
  scroll: [visibleStartTime: number, visibleEndTime: number]
  /** When the zoom level changes */
  zoom: [minPxPerSec: number]
  /** Just before the waveform is destroyed so you can clean up your events */
  destroy: []
}

class WaveSurfer extends Player<WaveSurferEvents> {
  public options: WaveSurferOptions & typeof defaultOptions
  private renderer: Renderer
  private timer: Timer
  private plugins: GenericPlugin[] = []
  private decodedData: AudioBuffer | null = null
  private canPlay = false

  /** Create a new WaveSurfer instance */
  public static create(options: WaveSurferOptions) {
    return new WaveSurfer(options)
  }

  /** Create a new WaveSurfer instance */
  constructor(options: WaveSurferOptions) {
    super({
      media: options.media,
      autoplay: options.autoplay,
      playbackRate: options.audioRate,
    })

    this.options = Object.assign({}, defaultOptions, options)

    this.timer = new Timer()

    this.renderer = new Renderer(
      {
        container: this.options.container,
      },
      this.options,
    )

    this.initPlayerEvents()
    this.initRendererEvents()
    this.initTimerEvents()
    this.initReadyEvent()
    this.initPlugins()

    const url = this.options.url || this.options.media?.src
    if (url) {
      this.load(url, this.options.peaks, this.options.duration)
    }
  }

  public setOptions(options: Partial<RendererStyleOptions>) {
    this.options = { ...this.options, ...options }
    this.renderer.setOptions(this.options)
  }

  private initPlayerEvents() {
    this.subscriptions.push(
      this.onMediaEvent('timeupdate', () => {
        const currentTime = this.getCurrentTime()
        this.renderer.renderProgress(currentTime / this.getDuration(), this.isPlaying())
        this.emit('timeupdate', currentTime)
      }),

      this.onMediaEvent('play', () => {
        this.emit('play')
        this.timer.start()
      }),

      this.onMediaEvent('pause', () => {
        this.emit('pause')
        this.timer.stop()

        if (this.getCurrentTime() >= this.getDuration()) {
          this.emit('finish')
        }
      }),

      this.onMediaEvent('canplay', () => {
        this.canPlay = true
        this.emit('canplay', this.getDuration())
      }),

      this.onMediaEvent('seeking', () => {
        this.emit('seeking', this.getCurrentTime())
      }),
    )
  }

  private initRendererEvents() {
    // Seek on click
    this.subscriptions.push(
      this.renderer.on('click', (relativeX) => {
        if (this.options.interact) {
          this.canPlay && this.seekTo(relativeX)
          this.emit('interaction')
        }
      }),

      this.renderer.on('drag', (relativeX) => {
        if (this.options.interact) {
          const newTime = this.getCurrentTime() + this.getDuration() * relativeX
          this.canPlay && this.setTime(newTime)
          this.emit('interaction')
        }
      }),

      this.renderer.on('scroll', (startX, endX) => {
        const duration = this.getDuration()
        this.emit('scroll', startX * duration, endX * duration)
      }),

      this.renderer.on('render', () => {
        this.emit('redraw')
      }),
    )
  }

  private initTimerEvents() {
    // The timer fires every 16ms for a smooth progress animation
    this.subscriptions.push(
      this.timer.on('tick', () => {
        const currentTime = this.getCurrentTime()
        this.renderer.renderProgress(currentTime / this.getDuration(), true)
        this.emit('timeupdate', currentTime)
        this.emit('audioprocess', currentTime)
      }),
    )
  }

  private initReadyEvent() {
    const emitReady = () => {
      if (this.decodedData && this.canPlay) {
        this.emit('ready', this.getDuration())
      }
    }
    this.subscriptions.push(this.on('decode', emitReady), this.on('canplay', emitReady))
  }

  private initPlugins() {
    if (!this.options.plugins?.length) return

    this.options.plugins.forEach((plugin) => {
      this.registerPlugin(plugin)
    })
  }

  /** Register a wavesurfer.js plugin */
  public registerPlugin<T extends GenericPlugin>(plugin: T): T {
    plugin.init(this)
    this.plugins.push(plugin)
    return plugin
  }

  /** For plugins only: get the waveform wrapper div */
  public getWrapper(): HTMLElement {
    return this.renderer.getWrapper()
  }

  /** Get the current scroll position in pixels */
  public getScroll(): number {
    return this.renderer.getScroll()
  }

  /** Get all registered plugins */
  public getActivePlugins() {
    return this.plugins
  }

  /** Load an audio file by URL, with optional pre-decoded audio data */
  public async load(url: string, channelData?: WaveSurferOptions['peaks'], duration?: number) {
    this.decodedData = null
    this.canPlay = false

    this.loadUrl(url)
    this.emit('load', url)

    if (channelData) {
      // Pre-decoded audio data
      if (!duration) {
        // Wait for the audio duration
        duration =
          (await new Promise((resolve) => {
            this.onceMediaEvent('loadedmetadata', () => resolve(this.getMediaElement().duration))
          })) || 0
      }
      this.decodedData = Decoder.createBuffer(channelData, duration)
    } else {
      // Fetch and decode the audio of no pre-computed audio data is provided
      const audio = await Fetcher.load(url)
      this.decodedData = await Decoder.decode(audio, this.options.sampleRate)
    }

    this.renderAudio()
    this.emit('decode', this.getDuration())
  }

  private renderAudio() {
    if (!this.decodedData) return

    // Only the first two channels are used
    const channelData = [this.decodedData.getChannelData(0)]
    if (this.decodedData.numberOfChannels > 1) {
      channelData.push(this.decodedData.getChannelData(1))
    }

    this.renderer.render(channelData, this.decodedData.duration)
  }

  /** Zoom in or out */
  public zoom(minPxPerSec: number) {
    if (!this.decodedData) {
      throw new Error('No audio loaded')
    }
    this.renderer.zoom(minPxPerSec)
    this.emit('zoom', minPxPerSec)
  }

  /** Get the decoded audio data */
  public getDecodedData(): AudioBuffer | null {
    return this.decodedData
  }

  /** Get the duration of the audio in seconds */
  public getDuration(): number {
    const audioDuration = super.getDuration()
    return audioDuration > 0 && audioDuration < Infinity ? audioDuration : this.decodedData?.duration || 0
  }

  /** Toggle if the waveform should react to clicks */
  public toggleInteraction(isInteractive: boolean) {
    this.options.interact = isInteractive
  }

  /** Seeks to a percentage of audio as [0..1] (0 = beginning, 1 = end) */
  public seekTo(progress: number) {
    const time = this.getDuration() * progress
    this.setTime(time)
  }

  /** Play or pause the audio */
  public playPause(): Promise<void> {
    if (this.isPlaying()) {
      this.pause()
      return Promise.resolve()
    } else {
      return this.play()
    }
  }

  /** Stop the audio and go to the beginning */
  public stop() {
    this.pause()
    this.setTime(0)
  }

  /** Skip N or -N seconds from the current positions */
  public skip(seconds: number) {
    this.setTime(this.getCurrentTime() + seconds)
  }

  /** Empty the waveform by loading a tiny silent audio */
  public empty() {
    this.load('', [[0]], 0.001)
  }

  /** Unmount wavesurfer */
  public destroy() {
    this.emit('destroy')
    this.plugins.forEach((plugin) => plugin.destroy())
    this.timer.destroy()
    this.renderer.destroy()
    super.destroy()
  }
}

export default WaveSurfer
